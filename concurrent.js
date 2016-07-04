/* eslint-env node */

'use strict';

const phantom = require('phantom');
const cheerio = require('cheerio');
const co = require('co');
const stringifyObject = require('stringify-object');
const fs = require('fs');
const path = require('path');

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
const MEMBERS = {};
let PAGES_PARSED = 0;
let PAGES_PARSE_TIMES = [];
let MEMBERS_PARSED = 0;
let MEMBERS_PARSE_TIMES = [];
let TOTAL_ENTRIES = 0;
const timer = createTimer();


TARGETS.forEach(target => {
    co(scrape(target));
});


function* scrape(target) {
    console.log(`Begin scraping ${target.type} members.`);
    timer('test').start();
    let instance = yield * initPhantomInstance();
    let next_page;
    let url = target.url;
    let file = path.join(ROOT_DIR, `${target.type}.json`);

    cleanFile(file);
    timer('test').stop();
    console.log(timer('test').result());
    do {
        next_page = yield * scrapePage(url, instance, file);
    } while (next_page);

    console.log(`All ${target.type} member data scraped.`);

    console.log('Exiting phantom instance.');
    instance.exit();
    console.log('Done!\n\n');
    console.log('Performance analysis...');
    console.log(formatPerformanceResults());
}

function* initPhantomInstance() {
    console.log('Initiate phantom');
    console.log('Storing phantom instance.');
    return yield phantom.create();
}

function* scrapePage(url, instance, file) {
    timer('page').start();
    let html = yield * fetchPage(instance, url);
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
    let $rows = $('.table-list-directory tr').not('.table-list-header');
    let member;
    for (let i = 0; i < $rows.length; i++) {
        timer('member').start();
        console.log(`Member ${MEMBERS_PARSED + 1} of ${TOTAL_ENTRIES}`);
        member = yield * scrapeMemberData($rows.eq(i), $, instance);
        // members.push(member);
        // let file = path.join(ROOT_DIR, `${target.type}.json`);
        writeToFile(file, JSON.stringify(member));
        timer('member').stop();
        timer('member').result(t => {
            console.log(`Member parsed in ${t}ms\n\n`);
            MEMBERS_PARSE_TIMES.push(t);
        });
        MEMBERS_PARSED++;
    }


    url = ROOT_URL + $('.nextLinkWrap a').first().attr('href');
    let next_page = $('.nextLinkWrap a').length > 0;
    timer('page').stop();
    timer('page').result(t => {
        console.log(`Page parsed in ${t}ms`);
        PAGES_PARSE_TIMES.push(t);
    });
    PAGES_PARSED++;
    return next_page;
}

function createTimer() {
    const timers = {};
    return function(name) {
        if (!timers[name]) {
            timers[name] = {
                start: function() {
                    this._start = new Date();
                },
                stop: function() {
                    this._end = new Date();
                },
                result: function(cb) {
                    let time = this._end - this._start;
                    if (typeof cb === 'function') {
                        return cb(time);
                    }

                    return `Execution time for "${name}": ${time}ms`;
                }
            };
        }

        return timers[name];
    };
}

function* scrapeMemberData($row, $, instance) {
    let member = {};

    const keys = parseColumnNames($);
    console.log('Parsing general member data');
    member = parseGeneralMemberData($row, keys);

    console.log('Get URL to member page');
    let url = getMemberUrl($row);

    console.log('Open member page');
    let html = yield * fetchPage(instance, url);
    console.log('Parsing detailed member data');
    member.details = parseDetailedMemberData(html);

    return member;
}

function* fetchPage(instance, url) {
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
    return html;
}


// function parseMemberData($) {
//     let member = {};
//     member = parseGeneralMemberData($);
//     member.details = parseDetailedMemberData($);
//
//     return member;
// }

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

function formatPerformanceResults() {
    let result = '';
    let total_page_parse_time = PAGES_PARSE_TIMES.reduce(sum, 0);
    let avg_page_parse_time = total_page_parse_time / PAGES_PARSED;
    result += `Nr. of pages parsed: ${PAGES_PARSED}\n`;
    result += `Total time for parsing pages: ${total_page_parse_time}ms\n`;
    result += `Average parse time per page: ${avg_page_parse_time}ms\n`;

    result += '\n';

    let total_member_parse_time = MEMBERS_PARSE_TIMES.reduce(sum, 0);
    let avg_member_parse_time = total_page_parse_time / MEMBERS_PARSED;
    result += `Nr. of members parsed: ${MEMBERS_PARSED}\n`;
    result += `Total time for parsing members: ${total_member_parse_time}ms\n`;
    result += `Average parse time per member: ${avg_member_parse_time}ms\n`;

    return result;
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
        if (BLOCKED_RESOURCES.some(function(r) {
                return r.test(requestData['url']);
            })) {
            // console.log('BLOCKED: ', requestData['url']);
            request.abort();
        }
    });
}