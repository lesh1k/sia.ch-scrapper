const urls = require('./urls.json');
const fetch = require('node-fetch');
const timer = createTimer();

timer('app').start();

let promises = urls.map(url => {
    timer(url).start();
    return fetch(url)
        .then(res => res.text())
        .then(body => {
            console.log(`Body for url(${url}) received!`);
            timer(url).stop();
            console.log(timer(url).result());
        });
});

Promise.all(promises)
    .then(results => {
        // console.log(results);
        console.log('ALL DONE!');
        timer('app').stop();
        console.log(timer('app').result());
    });


function createTimer() {
    const timers = {};
    return function(name) {
        if (!timers[name]) {
            timers[name] = {
                start: function() {
                    this._start = new Date();
                },
                stop: function() {
                    this._end = new Date();
                },
                result: function(cb) {
                    let time = this._end - this._start;
                    if (typeof cb === 'function') {
                        return cb(time);
                    }

                    return `Execution time for "${name}": ${time}ms`;
                }
            };
        }

        return timers[name];
    };
}
