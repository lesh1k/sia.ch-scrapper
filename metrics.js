/* eslint no-console: 0 */
'use strict';

const Table = require('cli-table');

const helpers = require('./helpers');


const makeMetric = function() {
    let entries_count = 0;
    let parsed_entries_count = 0;

    const time = {
        total: 0,
        min: 0,
        max: 0,
        get avg() {
            let avg = this.total / parsed_entries_count;
            return avg.toFixed(2);
        }
    };

    const metric = {
        time: time,
        get total() {
            return entries_count;
        },
        set total(val) {
            entries_count = val;
        },
        get parsed() {
            return parsed_entries_count;
        },
        set parsed(val) {
            parsed_entries_count = val;
        }
    };

    return metric;
};

const METRICS = {
    created_on: new Date(),
    number_of_CPUs: 0,
    number_of_workers: 0,
    pages: makeMetric(),
    members: makeMetric()
};

function formatPerformanceResults(results, unit) {
    let text = `[${unit}:Count]\n`;

    let table = new Table({
        head: ['Total', 'Parsed']
    });
    table.push([results.total, results.parsed]);
    text += table.toString();

    text += `\n[${unit}:Time]\n`;
    table = new Table({
        head: ['Total (ms)', 'Avg (ms)', 'Min (ms)', 'Max (ms)']
    });
    table.push([results.time.total, results.time.avg, results.time.min, results.time.max]);
    text += table.toString();
    text += '\n\n';

    return text;
}

function logResults() {
    console.log(helpers.title('Performance analysis'));
    let formatted_results = this.formatPerformanceResults(this.data.pages, 'PAGE(s)');
    formatted_results += this.formatPerformanceResults(this.data.members, 'MEMBER(s)');
    console.log(formatted_results);
}

function storeResults(file) {
    let metrics_list = [];
    try {
        let existing_data = require(file);
        metrics_list = existing_data;
    } catch(e) {
        console.log(`${file} either empty or does not exist`);
    }

    metrics_list.push(this.data);
    helpers.cleanFile(file);
    helpers.writeToFile(file, JSON.stringify(metrics_list));
}


module.exports = {
    data: METRICS,
    formatPerformanceResults: formatPerformanceResults,
    logResults: logResults,
    storeResults: storeResults
};
