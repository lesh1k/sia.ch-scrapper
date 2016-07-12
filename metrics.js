'use strict';

const Table = require('cli-table');


const METRICS = {
    pages: {
        __total: 0,
        set total(val) {
            this.__total = val;
            this.time.__total_count = val;
        },
        get total() {
            return this.__total;
        },
        parsed: 0,
        time: {
            __total_count: 0,
            total: 0,
            min: 0,
            max: 0,
            get avg() {
                let avg = this.total / this.__total_count;
                return avg.toFixed(2);
            }
        }
    },
    members: {
        __total: 0,
        set total(val) {
            this.__total = val;
            this.time.__total_count = val;
        },
        get total() {
            return this.__total;
        },
        parsed: 0,
        time: {
            __total_count: 0,
            total: 0,
            min: 0,
            max: 0,
            get avg() {
                let avg = this.total / this.__total_count;
                return avg.toFixed(2);
            }
        }
    }
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
