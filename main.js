/* eslint no-console: 0 */
'use strict';

const co = require('co');
const path = require('path');
const cluster = require('cluster');

const config = require('./config.json');
const targets = config.targets;
const workerWork = require('./worker');
const scrapper = require('./scrapper');
const metrics = require('./metrics');


if (cluster.isMaster) {
    co(function*() {
        for (let i = 0; i < targets.length; i++) {
            let target = targets[i];
            yield * scrapper.scrape(target.url, target.type, metrics);
        }

        if (config.metrics.log_to_console) {
            metrics.logResults();
        }
        if (config.metrics.store) {
            const METRICS_FILE = path.join(__dirname, config.metrics.path, config.metrics.filename);
            metrics.storeResults(METRICS_FILE);
        }
    });
} else {
    workerWork();
}
