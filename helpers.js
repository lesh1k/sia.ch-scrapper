'use strict';

const Table = require('cli-table');


function sum(a, b) {
    return a + b;
}

function computeAverage(values) {
    let count = values.length;
    let total = values.reduce(sum);
    return total / count;
}

function title(text) {
    let table = new Table({
        head: [text]
    });
    return table.toString();
}

module.exports = {
    sum: sum,
    computeAverage: computeAverage,
    title: title
};
