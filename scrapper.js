/* eslint-env node */
/* eslint no-console: 0 */

'use strict';

const cheerio = require('cheerio');
const path = require('path');
const cluster = require('cluster');
const NUM_CPUs = require('os').cpus().length;
let NUMBER_OF_WORKERS = NUM_CPUs;

const CONFIG = require('./config.json');
const timer = require('./timer');
const helpers = require('./helpers');
const ph = require('./phantom_helpers');
const ROOT_DIR = __dirname;
let metrics;

if (!Number.isNaN(parseInt(CONFIG.number_of_workers))) {
    NUMBER_OF_WORKERS = parseInt(CONFIG.number_of_workers);
}


function* scrape(url, member_type, app_metrics) {
    metrics = app_metrics;
    metrics.data.number_of_workers = NUMBER_OF_WORKERS;
    metrics.data.number_of_CPUs = NUM_CPUs;
    console.log(`Begin scraping ${member_type} members.`);
    while (url) {
        url = yield * scrapePage(url, member_type);
    }

    console.log(`All ${member_type} member data scraped.`);
}

function* scrapePage(url, member_type) {
    timer('PAGE').start();
    let html = yield * ph.fetchPage(url);
    let $ = cheerio.load(html);

    const members = yield * parseMembersData(html, member_type);
    metrics.data.pages.parsed++;
    store(members, member_type, nextPageExists($));

    timer('PAGE').stop();
    timer('PAGE').result(time => {
        metrics.data.pages.time.total += time;
        metrics.data.pages.time.min = metrics.data.pages.time.min ? Math.min(metrics.data.pages.time.min, time) : time;
        metrics.data.pages.time.max = Math.max(metrics.data.pages.time.max, time);
    });

    return getNextPageUrl($);
}

function* parseMembersData(html, member_type) {
    let $ = cheerio.load(html);

    if ($(CONFIG.current_entries_selector).length) {
        console.log(`\n\nParsing entries ${$(CONFIG.current_entries_selector).text()}`);
    }

    const keys = parseColumnNames($);
    let $rows = $('.table-list-directory tr').not('.table-list-header');
    if (isNewTarget()) {
        let file = path.join(ROOT_DIR, CONFIG.data_dir, `${member_type}_members.json`);
        helpers.cleanFile(file);

        let total_entries = $(CONFIG.entries_count_selector).text().match(/\d+'?\d+/);
        metrics.data.members.total += parseInt(total_entries.toString().replace('\'', ''), 10);
        metrics.data.pages.total += Math.ceil(total_entries / $rows.length);
        console.log(`Number of entries: ${total_entries.toString()}`);
    }

    let members = yield * delegateProcessingToWorkers(html, $rows.length, keys, member_type);
    return members;
}

function isNewTarget() {
    return metrics.data.pages.parsed >= metrics.data.pages.total;
}

function store(data, filename_prefix, more_to_come) {
    let json = JSON.stringify(data);
    if (!isNewTarget()) {
        json = json.replace('[', ',');
    }

    if (more_to_come) {
        let index_of_array_closing_brace = json.lastIndexOf(']');
        json = json.substr(0, index_of_array_closing_brace);
    }

    let file = path.join(ROOT_DIR, CONFIG.data_dir, `${filename_prefix}_members.json`);
    helpers.writeToFile(file, json);
}

function getNextPageUrl($) {
    if (nextPageExists($)) {
        return CONFIG.root_url + $('.nextLinkWrap a').first().attr('href');
    }

    return null;
}

function nextPageExists($) {
    return $('.nextLinkWrap a').length > 0;
}

function* delegateProcessingToWorkers(html, rows_count, keys, member_type) {
    let members = [];
    let clusterWorkerMessageHandler;
    yield new Promise((resolve) => {
        clusterWorkerMessageHandler = makeClusterWorkerMessageHandler(members, rows_count, resolve);
        cluster.on('message', clusterWorkerMessageHandler);
        spawnWorkers(NUMBER_OF_WORKERS, rows_count, keys, member_type, html);
    });

    cluster.removeListener('message', clusterWorkerMessageHandler);
    return members;
}

function makeClusterWorkerMessageHandler(members, rows_count, resolve) {

    return function clusterWorkerMessageHandler(worker, message) {
        if (message.data) {
            Array.prototype.push.apply(members, message.data);
        }

        if (message.metrics) {
            metrics.data.members.parsed += message.metrics.count;
            metrics.data.members.time.total += message.metrics.time.total;
            if (metrics.data.members.time.min === 0) {
                metrics.data.members.time.min = message.metrics.time.min;
            } else {
                metrics.data.members.time.min = Math.min(metrics.data.members.time.min, message.metrics.time.min);
            }
            metrics.data.members.time.max = Math.max(metrics.data.members.time.max, message.metrics.time.max);
        }

        if (members.length === rows_count) {
            let sortByName = helpers.makeFnToSortBy('Name');
            members.sort(sortByName);
            resolve(members);
        }

        console.log(`[WORKER #${worker.id}] said:`, message.msg);
    };
}

function spawnWorkers(workers_count, rows_count, keys, member_type, html) {
    const urls_per_worker = Math.round(rows_count / workers_count);
    for (let i = 0; i < workers_count; i++) {
        let index_from = i * urls_per_worker;
        let index_to = 0;
        if (i === workers_count - 1) {
            index_to = rows_count;
        } else {
            index_to = (i + 1) * urls_per_worker;
        }

        cluster.fork({
            index_from: index_from,
            index_to: index_to,
            keys: keys,
            member_type: member_type,
            html: html
        });
    }
}

function parseColumnNames($) {
    const keys = [];
    const $thead = $('.table-list-directory .table-list-header');

    $thead.find('th').each((i, th) => {
        keys.push($(th).find('br').replaceWith(' ').end().text().trim());
    });

    return keys;
}


module.exports = {
    scrape: scrape
};
