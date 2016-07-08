const urls = require('./urls.json');
const phantom = require('phantom');
const timer = createTimer();

timer('app').start();

let instance;
let promises=[];

phantom.create()
    .then(inst => {
        instance = inst;
        try {
            urls.forEach((url, i) => {
                timer(url).start();
                let page;
                promises.push(
                    instance.createPage()
                    .then(pg => {
                        page = pg;
                        return page.open(url);
                    })
                    .then(status => {
                        return page.property('content');
                    })
                    .then(body => {
                        console.log(`[${i}] Body for url(${url}) received!`);
                        timer(url).stop();
                        console.log(timer(url).result());
                        page.close();
                        // instancew.exit();
                    })
                    .catch(e => {
                        throw e;
                    })
                );
            });

        } catch (e) {
            console.error(e);
        }

        // Promise.all(promises)
        //     .then(results => {
        //         // console.log(results);
        //         console.log('ALL DONE!');
        //         timer('app').stop();
        //         console.log(timer('app').result());
        //     });
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
