/* eslint-env node */
/* eslint no-console: 0 */

'use strict';

const cheerio = require('cheerio');
const co = require('co');

const timer = require('./timer');
const utils = require('./utils');
const CONFIG = require('./config.json');


let PAGES_PARSED = 0;
let PAGES_PARSE_TIMES = [];
let MEMBERS_PARSED = 0;
let MEMBERS_PARSE_TIMES = [];
let TOTAL_ENTRIES = 0;


module.exports = workerWork;

/**************************************************************/
function getMemberRows(html, index_from, index_to) {
    timer(`PAGE[${PAGES_PARSED}]`).start();
    let $ = cheerio.load(html);
    let $rows = $('.table-list-directory tr').not('.table-list-header');

    return $rows.slice(index_from, index_to);
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
        let instance = yield * utils.initPhantomInstance();
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
    let html = yield * utils.fetchPage(url, instance);
    console.log('Parsing detailed member data');
    member.details = parseDetailedMemberData(html);

    return member;
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
