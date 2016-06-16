'use strict';

const request = require('request');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const URLS = [
    'http://www.sia.ch/en/membership/member-directory/honorary-members/',
    'http://www.sia.ch/en/membership/member-directory/individual-members/',
    'http://www.sia.ch/en/membership/member-directory/corporate-members/',
    'http://www.sia.ch/en/membership/member-directory/student-members/'
];
const TARGET_FILE = path.join(__dirname, 'data.json');


const promises = URLS.map(url => {
    return new Promise((resolve, reject) => {
        console.log(`Fetching page at ${url}`);
        request(url, (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                resolve(body);
            }
        });
    });
});

const p = Promise.all(promises);

p.then(pages => {
    console.log(pages, pages.length);
})
.catch(err => {
    throw err;
});


// p.then((body) => {
//     console.log('Parsing page...');
//     let genres = [];
//     let $ = cheerio.load(body);
//     let $contents = $('#toc');
//
//
//     return genres;
// })
// .then((genres) => {
//     console.log(`Writing parsed data to ${TARGET_FILE}`);
//     fs.writeFile(TARGET_FILE, JSON.stringify(genres), (err) => {
//         if (err) throw err;
//     });
//     console.log('Done!');
// })
// .catch(err => {
//     throw err;
// });
