/* eslint-env node */
/* eslint no-console: 0 */

'use strict';

const phantom = require('phantom');
const cheerio = require('cheerio');
const co = require('co');
const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const NUM_CPUs = require('os').cpus().length;

const timer = require('./timer');
const CONFIG = require('./config.json');
const ROOT_DIR = __dirname;


let PAGES_PARSED = 0;
let PAGES_PARSE_TIMES = [];
let MEMBERS_PARSED = 0;
let MEMBERS_PARSE_TIMES = [];
let TOTAL_ENTRIES = 0;

if (cluster.isMaster) {
    CONFIG.targets.forEach(target => {
        co(scrape(target.url, target.type));
    });
} else {
    workerWork();
}



/**************************************************************/
function* scrape(url, member_type) {
    console.log(`Begin scraping ${member_type} members.`);
    let file = path.join(ROOT_DIR, `${member_type}_members.json`);
    cleanFile(file);
    while (url) {
        url = yield * scrapePage(url, member_type);
    }

    console.log(`All ${member_type} member data scraped.`);
    console.log('Done!\n\n');
    console.log('Performance analysis...');
    let results = getPerformanceResults();
    let formatted_results = formatPerformanceResults(results);
    console.log(formatted_results);
}

function* initPhantomInstance() {
    console.log('Initiate phantom');
    console.log('Storing phantom instance.');
    return yield phantom.create();
}

function* scrapePage(url, member_type) {
    try {

        timer(`PAGE[${PAGES_PARSED}]`).start();
        let html = yield * fetchPage(url);
        let $ = cheerio.load(html);
        if (PAGES_PARSED === 0) {
            let total_entries = $(CONFIG.entries_count_selector).text().match(/\d+'?\d+/);
            TOTAL_ENTRIES = total_entries.toString().replace('\'', '');
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

        let members = yield * delegateProcessingToWorkers(html, $rows.length, keys, member_type);
        debugger
        let json = JSON.stringify(members);
        if (PAGES_PARSED > 0) {
            json = json.replace('[', ',');
        }

        if (next_page) {
            let index_of_array_closing_brace = json.lastIndexOf(']');
            json = json.substr(0, index_of_array_closing_brace);
        }
        let file = path.join(ROOT_DIR, `${member_type}_members.json`);
        writeToFile(file, json);


        timer(`PAGE[${PAGES_PARSED}]`).stop();
        timer(`PAGE[${PAGES_PARSED}]`).result(time => {
            console.log(`Page parsed in ${time}ms\n\n`);
            PAGES_PARSE_TIMES.push(time);
        });
        PAGES_PARSED++;

        return url;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

function getMemberRows(html, index_from, index_to) {
    timer(`PAGE[${PAGES_PARSED}]`).start();
    let $ = cheerio.load(html);
    let $rows = $('.table-list-directory tr').not('.table-list-header');

    return $rows.slice(index_from, index_to);
}

function* delegateProcessingToWorkers(html, rows_count, keys, member_type) {
    const urls_per_worker = Math.ceil(rows_count / NUM_CPUs);
    let members = [];
    let workerMessageHandler;
    yield new Promise((resolve) => {
        workerMessageHandler = function workerMessageHandler(worker, message) {
            if (message.data) {
                console.log(`[WORKER (ID=${worker.id})] has processed the URLs`);
                members = members.concat(message.data);
            }

            if (members.length === rows_count) {
                console.log('All members are parsed. Sorting by name...');
                members.sort((m1, m2) => {
                    if (m1['Name'] < m2['Name']) {
                        return -1;
                    } else if (m1['Name'] === m2['Name']) {
                        return 0;
                    } else {
                        return 1;
                    }
                });
                console.log('Sort complete!');
                resolve(members);
            }

            console.log(`[WORKER (ID=${worker.id})] said`, message.msg);
        };

        cluster.on('online', workerOnlineHandler);
        cluster.on('message', workerMessageHandler);
        cluster.on('exit', workerExitHandler);

        for (let i = 0; i < NUM_CPUs; i++) {
            let index_from = i * urls_per_worker;
            let index_to = 0;
            if (i === NUM_CPUs - 1) {
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

// function workerMessageHandler(members, rows_count, resolve, worker, message) {
//     if (message.data) {
//         console.log(`[WORKER (ID=${worker.id})] has processed the URLs`);
//         members = members.concat(message.data);
//     }
//
//     if (members.length === rows_count) {
//         console.log('All members are parsed. Sorting by name...');
//         members.sort((m1, m2) => {
//             if (m1['Name'] < m2['Name']) {
//                 return -1;
//             } else if (m1['Name'] === m2['Name']) {
//                 return 0;
//             } else {
//                 return 1;
//             }
//         });
//         console.log('Sort complete!');
//         resolve(members);
//     }
//
//     console.log(`[WORKER (ID=${worker.id})] said`, message.msg);
// }

function workerExitHandler(worker, code, signal) {
    if (signal) {
        console.log(`[WORKER (ID=${worker.id})] was killed by signal: ${signal}`);
    } else if (code !== 0) {
        console.log(`[WORKER (ID=${worker.id})] exited with error code: ${code}`);
    } else {
        console.log(`[WORKER (ID=${worker.id})] exited with success!`);
    }
}

function workerWork() {
    process.send({
        msg: 'Worker alive!'
    });

    process.send({
        msg: 'Prepare arguments.'
    });

    let index_from, index_to, keys, member_type, html;
    ({
        index_from,
        index_to,
        keys,
        member_type,
        html
    } = process.env);

    process.send({
        msg: `Begin scraping members (from ${index_from} to ${index_to}).`
    });

    TOTAL_ENTRIES = index_to - index_from;
    co(function*() {
            let $rows = getMemberRows(html, index_from, index_to);
            keys = keys.split(',');
            return yield * scrapeMembers($rows, keys, member_type);
        })
        .then(members => {
            process.send({
                msg: 'Done!',
                data: members
            });
            process.disconnect();
        });
}

function* scrapeMembers($rows, keys) {
    try {
        let members = [];
        let instance = yield * initPhantomInstance();
        for (let i = 0; i < $rows.length; i++) {
            timer(`MEMBER[${MEMBERS_PARSED}]`).start();
            console.log(`Member ${MEMBERS_PARSED + 1} of ${TOTAL_ENTRIES}`);
            let member = yield * scrapeMemberData($rows.eq(i), keys, instance);
            members.push(member);
            timer(`MEMBER[${MEMBERS_PARSED}]`).stop();
            timer(`MEMBER[${MEMBERS_PARSED}]`).result(time => {
                console.log(`Member parsed in ${time}ms\n\n`);
                MEMBERS_PARSE_TIMES.push(time);
            });
            MEMBERS_PARSED++;
        }

        instance.exit();
        return members;
    } catch (e) {
        console.error(e);
    }
}

function* scrapeMemberData($row, keys, instance) {
    let member = {};

    console.log('Parsing general member data');
    member = parseGeneralMemberData($row, keys);

    console.log('Get URL to member page');
    let url = getMemberUrl($row);

    console.log('Open member page');
    let html = yield * fetchPage(url, instance);
    console.log('Parsing detailed member data');
    member.details = parseDetailedMemberData(html);

    return member;
}

function* fetchPage(url, instance) {
    let is_local_instance = false;
    if (!instance) {
        instance = yield * initPhantomInstance();
        is_local_instance = true;
    }

    console.log('Phantom createPage');
    const page = yield instance.createPage();
    console.log('Setup selective resource blocking');
    yield * blockResourceLoading(page);

    console.log('Opening URL', url);
    let status = yield page.open(url);
    console.log('URL opened. Status: ', status);
    console.log('Getting page content');
    let html = yield page.property('content');
    console.log('Closing page');
    yield page.close();
    console.log('Page closed');
    if (is_local_instance) {
        instance.exit();
        console.log('Phantom instance exited.');
    }
    return html;
}

function parseGeneralMemberData($row, keys) {
    const $cells = $row.find('td');
    const data = {};

    $cells.each((i, cell) => {
        if (keys[i]) {
            data[keys[i]] = $row.find(cell).find('br').replaceWith('\n').end().text().trim();
        }
    });

    return data;
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

function getMemberUrl($row) {
    const $cell = $row.find('td').first();
    const member_url = CONFIG.root_url + $cell.find('a').attr('href');

    return member_url;
}

function parseDetailedMemberData(html) {
    const $ = cheerio.load(html);
    const details = {};
    let key = '';
    $('tr').each((i, row) => {
        let $head_cell = $(row).find('th');
        if ($head_cell.length) {
            key = $head_cell.find('br').replaceWith('\n').end().text().trim();
            details[key] = {};
        } else {
            let $cells = $(row).find('td');
            if (!$cells.text()) return;
            if ($cells.length === 1) {
                details[key] = $cells.find('br').replaceWith('\n').end().text().trim();
            } else {
                let sub_key = $cells.first().find('br').replaceWith('\n').end().text().trim();
                let cell_data = $cells.not(':first-child').find('br').replaceWith('\n').end().text().trim();
                if ((sub_key.match(/\n+/g) || []).length === (cell_data.match(/\n+/g) || []).length) {
                    let keys = sub_key.split(/\n+/g);
                    let values = cell_data.split(/\n+/g);
                    for (let i = 0; i < keys.length; i++) {
                        let k = keys[i].trim();
                        let v = values[i].trim();
                        if (!k) continue;
                        details[key][k] = v;
                    }
                } else {
                    details[key][sub_key] = cell_data;
                }
            }
        }
    });

    return details;
}

function writeToFile(file, data) {
    console.log(`Opening ${file}`);
    let fd = fs.openSync(file, 'a+');
    console.log(`Writing data to ${file}`);
    fs.writeSync(fd, data);
    console.log(`Closing ${file}`);
    fs.closeSync(fd);
    console.log('Write to file - Done!');
}

function cleanFile(file) {
    console.log(`Opening ${file}`);
    let fd = fs.openSync(file, 'w+');
    console.log(`Cleaning ${file}`);
    fs.writeSync(fd, '');
    console.log(`Closing ${file}`);
    fs.closeSync(fd);
    console.log('Cleaning file - Done!');
}

function getPerformanceResults() {
    let results = {
        pages: {},
        members: {}
    };

    results.pages.count = PAGES_PARSED;
    results.pages.total_time = PAGES_PARSE_TIMES.reduce(sum, 0);
    results.pages.average_time = results.pages.total_time / results.pages.count;

    results.members.count = MEMBERS_PARSED;
    results.members.total_time = MEMBERS_PARSE_TIMES.reduce(sum, 0);
    results.members.average_time = results.members.total_time / results.members.count;

    return results;
}

function formatPerformanceResults(results) {
    let text = '';
    text += `Nr. of pages parsed: ${results.pages.count}\n`;
    text += `Total time for parsing pages: ${results.pages.total_time}ms\n`;
    text += `Average parse time per page: ${results.pages.average_time}ms\n`;
    text += '\n';
    text += `Nr. of members parsed: ${results.members.count}\n`;
    text += `Total time for parsing members: ${results.members.total_time}ms\n`;
    text += `Average parse time per member: ${results.members.average_time}ms\n`;

    return text;
}

function sum(a, b) {
    return a + b;
}

function* blockResourceLoading(page) {
    yield page.property('onResourceRequested', function(requestData, request) {
        var BLOCKED_RESOURCES = [
            /\.gif/gi,
            /\.png/gi,
            /\.css/gi,
            /^((?!(feuseradmin\.js|tinymce|jquery-)).)*\.js.*/gi
        ];
        var is_blacklisted_resource = BLOCKED_RESOURCES.some(function(r) {
            return r.test(requestData['url']);
        });

        if (is_blacklisted_resource) {
            // console.log('BLOCKED: ', requestData['url']);
            request.abort();
        } else {
            console.log('[RESOURCE ALLOWED]', requestData.url);
        }
    });
}
