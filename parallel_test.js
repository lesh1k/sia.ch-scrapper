/* eslint-env node */

'use strict';

const phantom = require('phantom');
const cheerio = require('cheerio');
const co = require('co');
const stringifyObject = require('stringify-object');
const cluster = require('cluster');
const num_of_CPUs = require('os').cpus().length;


const ROOT_URL = 'http://www.sia.ch';
const URL = 'http://www.sia.ch/en/membership/member-directory/honorary-members/';
const timer = require('./timer.js');

let instance;
let pages = [];
let promises = [];
let root_page;

if (cluster.isMaster) {
    timer('app').start();
    // for (let i = 0; i < num_of_CPUs; i++) {
    //     cluster.fork();
    //     console.log('Spawn worker #', i);
    // }
    //
    // Object.keys(cluster.workers).forEach((id) => {
    //     cluster.workers[id].on('message', workerMessageHandler);
    // });

    phantom.create()
        .then(inst => {
            instance = inst;
            return instance.createPage();
        })
        .then(page => {
            root_page = page;
            return root_page.open(URL);
        })
        .then(status => {
            console.log(`URL(${URL}) status: ${status}`);
            return root_page.property('content');
        })
        .then(html => {
            let $root = cheerio.load(html);
            let $rows = $root('.table-list-directory tr').not('.table-list-header');
            let urls = Array.prototype.slice.call($rows).map(row => {
                return getMemberUrl($root(row));
            });

            let keys = parseColumnNames($root);
            delegateParsingToWorkers(urls, $rows, keys);
        })
        .catch(err => {
            console.error(err);
        });
} else {
    // WORKER code here
    process.send('I am alive');
    let member = parseMember();
    process.send({
        member: member,
        done: true
    });
    process.send('I\'m done!');
}


function delegateParsingToWorkers(urls, $rows, keys) {
    Object.keys(cluster.workers).forEach((id) => {
        let cb = workerMessageHandlerThunk(id);
        cluster.workers[id].on('message', cb);
    });

    urls.forEach((url, i) => {
        cluster.fork({
            url: url,
            $row: $rows.eq(i),
            keys: keys
        });
        console.log('Spawn worker #', i);
        timer(`member #${i}`).start();
        instance.createPage()
            .then(page => {
                pages.push(page);
                return page.open(url);
            })
            .then(status => {
                console.log(`URL(${url}) status: ${status}`);
                let p = pages[i].property('content');
                promises.push(p);
                if (i === promises.length - 1) {
                    Promise.all(promises)
                        .then(htmls => {
                            timer('app').stop();
                            timer('app').result();
                        })
                        .catch(err => {
                            console.error(err);
                        });
                }
                return p;
            })
            .then(html => {
                console.log(`[CONTENT RECEIVED] URL(${url})`);
                timer(`member #${i}`).stop();
                timer(`member #${i}`).result();
            })
            .catch(err => {
                console.error(err);
            });
    });
}


function workerMessageHandlerThunk(id, urls, keys, $rows) {
    let iter_urls = urls[Symbol.iterator]();
    return function(msg) {
        return workerMessageHandler.call(null, id, msg);
    };
}

function workerMessageHandler(id, urls, msg) {
    console.log('[WORKER ID: ', id, '] ', msg);
    console.log('cluster.workers ', cluster.workers);
    if (msg.member) {
        console.log('Received data on member: ', msg.member.name);
    }

    if (msg.done && urls.length) {
        cluster.workers[id].send({url: urls.shift()});
    } else {
        console.log('All urls should be processed');
    }
    // MEMBERS.push(msg.member);
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
