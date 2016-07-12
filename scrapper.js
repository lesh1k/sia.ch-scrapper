/* eslint-env node */
/* eslint no-console: 0 */

'use strict';

const cheerio = require('cheerio');
const path = require('path');
const cluster = require('cluster');
const NUM_CPUs = require('os').cpus().length;

const NUMBER_OF_WORKERS = 2 * NUM_CPUs;
const CONFIG = require('./config.json');
const timer = require('./timer');
const utils = require('./utils');
const helpers = require('./helpers');
const metrics = require('./metrics');
const ROOT_DIR = __dirname;


function* scrape(url, member_type) {
    console.log(`Begin scraping ${member_type} members.`);
    let file = path.join(ROOT_DIR, CONFIG.data_dir, `${member_type}_members.json`);
    utils.cleanFile(file);
    while (url) {
        url = yield * scrapePage(url, member_type);
    }

    console.log(`All ${member_type} member data scraped.`);
    console.log('Done!\n\n');

    console.log(helpers.title('Performance analysis'));
    let formatted_results = metrics.formatPerformanceResults(metrics.data.pages, 'PAGE(s)');
    formatted_results += metrics.formatPerformanceResults(metrics.data.members, 'MEMBER(s)');
    console.log(formatted_results);
}

function* scrapePage(url, member_type) {
    try {

        timer('PAGE').start();
        let html = yield * utils.fetchPage(url);
        let $ = cheerio.load(html);
        if (metrics.data.pages.parsed === 0) {
            let total_entries = $(CONFIG.entries_count_selector).text().match(/\d+'?\d+/);
            metrics.data.members.total = total_entries.toString().replace('\'', '');
            console.log(`Number of entries: ${total_entries.toString()}`);
        }
        if ($(CONFIG.current_entries_selector).length) {
            console.log(`Parsing entries ${$(CONFIG.current_entries_selector).text()}`);
        }
        console.log('\n\n');

        let next_page = $('.nextLinkWrap a').length > 0;
        if (next_page) {
            url = CONFIG.root_url + $('.nextLinkWrap a').first().attr('href');
        } else {
            url = null;
        }

        const keys = parseColumnNames($);
        let $rows = $('.table-list-directory tr').not('.table-list-header');
        metrics.data.pages.total = Math.ceil(metrics.data.members.total / $rows.length);

        let members = yield * delegateProcessingToWorkers(html, $rows.length, keys, member_type);
        let json = JSON.stringify(members);
        if (metrics.data.pages.parsed > 0) {
            json = json.replace('[', ',');
        }

        if (next_page) {
            let index_of_array_closing_brace = json.lastIndexOf(']');
            json = json.substr(0, index_of_array_closing_brace);
        }
        let file = path.join(ROOT_DIR, CONFIG.data_dir, `${member_type}_members.json`);
        utils.writeToFile(file, json);


        timer('PAGE').stop();
        timer('PAGE').result(time => {
            console.log(`Page parsed in ${time}ms\n\n`);
            metrics.data.pages.time.total += time;
            metrics.data.pages.time.min = metrics.data.pages.time.min ? Math.min(metrics.data.pages.time.min, time) : time;
            metrics.data.pages.time.max = Math.max(metrics.data.pages.time.max, time);
        });
        metrics.data.pages.parsed++;

        return url;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

function* delegateProcessingToWorkers(html, rows_count, keys, member_type) {
    const urls_per_worker = Math.round(rows_count / NUMBER_OF_WORKERS);
    let members = [];
    let workerMessageHandler;
    yield new Promise((resolve) => {
        workerMessageHandler = function workerMessageHandler(worker, message) {
            if (message.data) {
                console.log(`[WORKER (ID=${worker.id})] has processed the URLs`);
                members = members.concat(message.data);
            }

            if (message.metrics) {
                metrics.data.members.parsed += message.metrics.count;
                metrics.data.members.time.total += message.metrics.time.total;
                metrics.data.members.time.min = metrics.data.members.time.min ? Math.min(metrics.data.members.time.min, message.metrics.time.min) : message.metrics.time.min;
                metrics.data.members.time.max = Math.max(metrics.data.members.time.max, message.metrics.time.max);
            }

            if (members.length === rows_count) {
                console.log('All members are parsed. Sorting by name...');
                let sortByName = utils.makeFnToSortBy('Name');
                members.sort(sortByName);
                console.log('Sort complete!');
                resolve(members);
            }

            console.log(`[WORKER (ID=${worker.id})] said`, message.msg);
        };

        cluster.on('online', workerOnlineHandler);
        cluster.on('message', workerMessageHandler);
        cluster.on('exit', workerExitHandler);

        for (let i = 0; i < NUMBER_OF_WORKERS; i++) {
            let index_from = i * urls_per_worker;
            let index_to = 0;
            if (i === NUMBER_OF_WORKERS - 1) {
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
    });

    console.log('Removing event listeners from clusters.');
    cluster.removeListener('online', workerOnlineHandler);
    cluster.removeListener('message', workerMessageHandler);
    cluster.removeListener('exit', workerExitHandler);

    return members;
}

function workerOnlineHandler(worker) {
    console.log(`Worker (ID=${worker.id}) is ONLINE`);
}

function workerExitHandler(worker, code, signal) {
    if (signal) {
        console.log(`[WORKER (ID=${worker.id})] was killed by signal: ${signal}`);
    } else if (code !== 0) {
        console.log(`[WORKER (ID=${worker.id})] exited with error code: ${code}`);
    } else {
        console.log(`[WORKER (ID=${worker.id})] exited with success!`);
    }
}

function parseColumnNames($) {
    console.log('Parsing column names');
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
