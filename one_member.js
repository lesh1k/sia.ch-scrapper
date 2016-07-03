'use strict';

const phantom = require('phantom');
const cheerio = require('cheerio');
const co = require('co');
const stringifyObject = require('stringify-object');


const ROOT_URL = 'http://www.sia.ch';
const URL = 'http://www.sia.ch/en/membership/member-directory/honorary-members/';

let phantom_instance;
let phantom_page;
let member = {};

console.log('Initiate phantom');
phantom.create()
    .then(instance => {
        console.log('Storing phantom instance.');
        phantom_instance = instance;
        console.log('Initiate phantom createPage');
        return instance.createPage();
    })
    .then(page => {
        console.log('Store created page');
        phantom_page = page;
        console.log('Opening URL');
        return page.open(URL);
    })
    .then(status => {
        console.log('URL opened. Status: ', status);
        console.log('Getting page content');
        return phantom_page.property('content');
    })
    .then(html => {
        console.log('Parsing page content');
        let $ = cheerio.load(html);
        console.log('Parsing general member data');
        member = parseGeneralMemberData($);
        console.log('Get URL to member page');
        let url = getMemberUrl($);
        console.log('Open member page');
        return phantom_page.open(url);
    })
    .then(status => {
        console.log('URL opened. Status: ', status);
        console.log('Getting page content');
        return phantom_page.property('content');
    })
    .then(html => {
        console.log('Parsing page content');
        let $ = cheerio.load(html);
        console.log('Parsing detailed member data');
        member.details = parseDetailedMemberData($);
        console.log('All member data scraped.');
        console.log('Fetched member data:');
        console.log(stringifyObject(member));
    })
    .then(() => {
        console.log('Closing page');
        phantom_page.close();
        console.log('Exiting phantom instance.');
        phantom_instance.exit()
        console.log('Done!');
    });


// function parseMemberData($) {
//     let member = {};
//     member = parseGeneralMemberData($);
//     member.details = parseDetailedMemberData($);
//
//     return member;
// }

function parseGeneralMemberData($) {
    const keys = parseColumnNames($);
    const $row = $('.table-list-directory tr').not('.table-list-header').eq(1);
    const $cells = $row.find('td');
    const data = {};

    $cells.each((i, cell) => {
        if (keys[i]) {
            data[keys[i]] = $(cell).find('br').replaceWith('\n').end().text().trim();
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

function getMemberUrl($) {
    const $row = $('.table-list-directory tr').not('.table-list-header').eq(1);
    const $cell = $row.find('td').first();
    const member_url = ROOT_URL + $cell.find('a').attr('href');

    return member_url;
}

function parseDetailedMemberData($) {
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
