'use strict';

module.exports = (function createTimer() {
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
})();
