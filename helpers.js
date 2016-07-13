/* eslint no-console: 0 */
'use strict';

const Table = require('cli-table');
const fs = require('fs');


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

function writeToFile(file, data) {
    let fd = fs.openSync(file, 'a+');
    fs.writeSync(fd, data);
    fs.closeSync(fd);
}

function cleanFile(file) {
    let fd = fs.openSync(file, 'w+');
    fs.writeSync(fd, '');
    fs.closeSync(fd);
}

function makeFnToSortBy(property_name) {
    return function (obj1, obj2) {
        if (obj1[property_name] < obj2[property_name]) {
            return -1;
        } else if (obj1[property_name] === obj2[property_name]) {
            return 0;
        } else {
            return 1;
        }
    };
}

module.exports = {
    sum: sum,
    computeAverage: computeAverage,
    title: title,
    writeToFile: writeToFile,
    cleanFile: cleanFile,
    makeFnToSortBy: makeFnToSortBy
};
