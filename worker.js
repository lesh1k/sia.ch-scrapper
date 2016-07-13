/* eslint-env node */
/* eslint no-console: 0 */

'use strict';

const cheerio = require('cheerio');
const co = require('co');

const timer = require('./timer');
const ph = require('./phantom_helpers');
const helpers = require('./helpers');
const CONFIG = require('./config.json');
const MEMBERS_PARSE_TIMES = [];


function workerWork() {
    let index_from, index_to, keys, member_type, html;
    ({
        index_from,
        index_to,
        keys,
        member_type,
        html
    } = process.env);

    process.send({
        msg: `Scraping members (from ${index_from} to ${index_to}).`
    });

    co(function*() {
            let $rows = getMemberRows(html, index_from, index_to);
            keys = keys.split(',');
            return yield * scrapeMembers($rows, keys, member_type);
        })
        .then(members => {
            process.send({
                msg: 'Done!',
                data: members,
                metrics: {
                    count: members.length,
                    time: {
                        list: MEMBERS_PARSE_TIMES,
                        total: MEMBERS_PARSE_TIMES.reduce(helpers.sum),
                        min: Math.min.apply(null, MEMBERS_PARSE_TIMES),
                        max: Math.max.apply(null, MEMBERS_PARSE_TIMES)
                    }
                }
            });
            process.disconnect();
        });
}

function getMemberRows(html, index_from, index_to) {
    let $ = cheerio.load(html);
    let $rows = $('.table-list-directory tr').not('.table-list-header');

    return $rows.slice(index_from, index_to);
}


function* scrapeMembers($rows, keys) {
    let members = [];
    const members_to_parse_count = $rows.length;
    let instance = yield * ph.initPhantomInstance();
    for (let i = 0; i < $rows.length; i++) {
        timer('MEMBER').start();
        let member = yield * scrapeMemberData($rows.eq(i), keys, instance);
        members.push(member);
        timer('MEMBER').stop();
        timer('MEMBER').result(time => {
            MEMBERS_PARSE_TIMES.push(time);
            process.send({
                msg: `Member ${members.length} of ${members_to_parse_count} (${time}ms)`
            });
        });
    }

    instance.exit();
    return members;
}

function* scrapeMemberData($row, keys, instance) {
    let member = {};
    member = parseGeneralMemberData($row, keys);

    let url = getMemberUrl($row);
    let html = yield * ph.fetchPage(url, instance);
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


module.exports = workerWork;
