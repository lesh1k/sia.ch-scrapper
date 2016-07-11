'use strict';

const co = require('co');
const cluster = require('cluster');

const CONFIG = require('./config.json');
const workerWork = require('./worker');
const scrapper = require('./scrapper');


if (cluster.isMaster) {
    CONFIG.targets.forEach(target => {
        co(scrapper.scrape(target.url, target.type));
    });
} else {
    workerWork();
}
