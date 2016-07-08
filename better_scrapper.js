/* eslint-env node */

'use strict';

const phantom = require('phantom');
const cheerio = require('cheerio');
const co = require('co');
const fs = require('fs');
const path = require('path');
const timer = require('./timer');


const ROOT_URL = 'http://www.sia.ch';
// const URL = 'http://www.sia.ch/en/membership/member-directory/honorary-members/';
const TARGETS = [{
        type: 'honorary',
        url: 'http://www.sia.ch/en/membership/member-directory/honorary-members/'
    },
    // { type: 'individual', url: 'http://www.sia.ch/en/membership/member-directory/individual-members/'},
    // { type: 'corporate', url: 'http://www.sia.ch/en/membership/member-directory/corporate-members/'},
    // { type: 'student', url: 'http://www.sia.ch/en/membership/member-directory/student-members/'}
];
// const TARGET_FILE = path.join(__dirname, 'data.json');
const ROOT_DIR = __dirname;
const ENTRIES_COUNT_SELECTOR = '.csc-default > .tx-updsiafeuseradmin-pi1 > div.specPageBrowse.clearfix > h2 > span';
const CURRENT_ENTRIES_SELECTOR = '.csc-default > .tx-updsiafeuseradmin-pi1 > div.specPageBrowse.clearfix > .browseBoxWrapTop > p > span';
let PAGES_PARSED = 0;
let PAGES_PARSE_TIMES = [];
let MEMBERS_PARSED = 0;
let MEMBERS_PARSE_TIMES = [];
let TOTAL_ENTRIES = 0;


TARGETS.forEach(target => {
    co(scrape(target.url, target.type));
});


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
    console.log(formatPerformanceResults(results));
}

function* initPhantomInstance() {
    console.log('Initiate phantom');
    console.log('Storing phantom instance.');
    return yield phantom.create();
}

function* scrapePage(url, member_type) {
    timer(`PAGE[${PAGES_PARSED}]`).start();
    let html = yield * fetchPage(url);
    let $ = cheerio.load(html);
    if (PAGES_PARSED === 0) {
        let total_entries = $(ENTRIES_COUNT_SELECTOR).text().match(/\d+'?\d+/);
        TOTAL_ENTRIES = total_entries.toString().replace('\'', '');
        console.log(`Number of entries: ${total_entries.toString()}`);
    }
    if ($(CURRENT_ENTRIES_SELECTOR).length) {
        console.log(`Parsing entries ${$(CURRENT_ENTRIES_SELECTOR).text()}`);
    }

    console.log('\n\n');
    const keys = parseColumnNames($);
    let $rows = $('.table-list-directory tr').not('.table-list-header');

    // DEBUG ONLY
    $rows = $rows.slice(0, 3);
    // EOF DEBUG ONLY

    yield * scrapeMembers($rows, keys, member_type);

    let next_page = $('.nextLinkWrap a').length > 0;
    if (next_page) {
        url = ROOT_URL + $('.nextLinkWrap a').first().attr('href');
    } else {
        url = null;
    }

    timer(`PAGE[${PAGES_PARSED}]`).stop();
    timer(`PAGE[${PAGES_PARSED}]`).result(time => {
        console.log(`Page parsed in ${time}ms\n\n`);
        PAGES_PARSE_TIMES.push(time);
    });
    PAGES_PARSED++;

    return url;
}

function* scrapeMembers($rows, keys, member_type) {
    let file = path.join(ROOT_DIR, `${member_type}_members.json`);
    for (let i = 0; i < $rows.length; i++) {
        timer(`MEMBER[${MEMBERS_PARSED}]`).start();
        console.log(`Member ${MEMBERS_PARSED + 1} of ${TOTAL_ENTRIES}`);
        let member = yield * scrapeMemberData($rows.eq(i), keys);
        writeToFile(file, JSON.stringify(member));
        timer(`MEMBER[${MEMBERS_PARSED}]`).stop();
        timer(`MEMBER[${MEMBERS_PARSED}]`).result(time => {
            console.log(`Member parsed in ${time}ms\n\n`);
            MEMBERS_PARSE_TIMES.push(time);
        });
        MEMBERS_PARSED++;
    }
}

function* scrapeMemberData($row, keys) {
    let member = {};

    console.log('Parsing general member data');
    member = parseGeneralMemberData($row, keys);

    console.log('Get URL to member page');
    let url = getMemberUrl($row);

    console.log('Open member page');
    let html = yield * fetchPage(url);
    console.log('Parsing detailed member data');
    member.details = parseDetailedMemberData(html);

    return member;
}

function* fetchPage(url) {
    let instance = yield * initPhantomInstance();
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
    instance.exit();
    console.log('Phantom instance exited.');
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
    const member_url = ROOT_URL + $cell.find('a').attr('href');

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
            /\.css/gi
        ];
        var is_blacklisted_resource = BLOCKED_RESOURCES.some(function(r) {
            return r.test(requestData['url']);
        });

        if (is_blacklisted_resource) {
            // console.log('BLOCKED: ', requestData['url']);
            request.abort();
        }
    });
}
