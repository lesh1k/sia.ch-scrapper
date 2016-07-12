'use strict';

const Table = require('cli-table');


const makeMetric = function() {
    const template_metric = {
        time: {
            __entries_count: 0,
            total: 0,
            min: 0,
            max: 0,
            get avg() {
                let avg = this.total / this.__entries_count;
                return avg.toFixed(2);
            }
        },
        get total() {
            return this.__total;
        },
        set total(val) {
            this.__total = val;
            this.time.__entries_count = val;
        },
        __total: 0,
        parsed: 0,
    };

    return Object.create(template_metric);
};

const METRICS = {
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


module.exports = {
    data: METRICS,
    formatPerformanceResults: formatPerformanceResults
};
