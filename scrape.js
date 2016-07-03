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
const TARGETS = [
    { type: 'honorary', url: 'http://www.sia.ch/en/membership/member-directory/honorary-members/'},
    // { type: 'individual', url: 'http://www.sia.ch/en/membership/member-directory/individual-members/'},
    // { type: 'corporate', url: 'http://www.sia.ch/en/membership/member-directory/corporate-members/'},
    // { type: 'student', url: 'http://www.sia.ch/en/membership/member-directory/student-members/'}
];
// const TARGET_FILE = path.join(__dirname, 'data.json');
const ROOT_DIR = __dirname;
const ENTRIES_COUNT_SELECTOR = '.csc-default > .tx-updsiafeuseradmin-pi1 > div.specPageBrowse.clearfix > h2 > span';
const CURRENT_ENTRIES_SELECTOR = '.csc-default > .tx-updsiafeuseradmin-pi1 > div.specPageBrowse.clearfix > .browseBoxWrapTop > p > span';
const MEMBERS = {};

TARGETS.forEach(target => {
    co(scrape(target));
});


function *scrape(target) {
    console.log(`Begin scraping ${target.type} members.`);
    // const members = [];
    let member = {};

    let instance = yield *initPhantomInstance();
    let url = target.url;
    let iteration = 0;
    let next_page;
    do {
        let html = yield *fetchPage(instance, url);
        let $ = cheerio.load(html);
        if (iteration === 0) {
            let total_entries = $(ENTRIES_COUNT_SELECTOR).text().match(/\d+'?\d+/);
            console.log(`Number of entries: ${total_entries.toString()}`);
        }
        if ($(CURRENT_ENTRIES_SELECTOR).length) {
            console.log(`Parsing entries ${$(CURRENT_ENTRIES_SELECTOR).text()}`);
        }
        let $rows = $('.table-list-directory tr').not('.table-list-header');
        for (let i = 0; i < $rows.length; i++) {
            member = yield *scrapeMemberData($rows.eq(i), $, instance);
            // members.push(member);
            let file = path.join(ROOT_DIR, `${target.type}.json`);
            if (i === 0) {
                cleanFile(file);
            }
            writeToFile(file, JSON.stringify(member));
        }

        url = ROOT_URL + $('.nextLinkWrap a').first().attr('href');
        next_page = $('.nextLinkWrap a').length > 0;
    } while (next_page);

    // MEMBERS[target.type] = members;

    console.log('All member data scraped.');
    console.log(`Fetched ${target.type} members data:`);
    // console.log(stringifyObject(members));

    console.log('Exiting phantom instance.');
    yield instance.exit();
    console.log('Done!');
}

function *initPhantomInstance() {
    console.log('Initiate phantom');
    console.log('Storing phantom instance.');
    return yield phantom.create();
}

function *scrapeMemberData($row, $, instance) {
    let member = {};

    const keys = parseColumnNames($);
    console.log('Parsing general member data');
    member = parseGeneralMemberData($row, keys);

    console.log('Get URL to member page');
    let url = getMemberUrl($row);

    console.log('Open member page');
    let html = yield *fetchPage(instance, url);
    console.log('Parsing detailed member data');
    member.details = parseDetailedMemberData(html);

    return member;
}

function *fetchPage(instance, url) {
    console.log('Phantom createPage');
    const page = yield instance.createPage();
    console.log('Opening URL', url);
    let status = yield page.open(url);
    console.log('URL opened. Status: ', status);
    console.log('Getting page content');
    let html = yield page.property('content');
    console.log('Closing page');
    yield page.close();
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
