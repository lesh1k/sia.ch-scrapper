/* eslint no-console: 0 */
'use strict';

const phantom = require('phantom');


function* blockResourceLoading(page) {
    yield page.property('onResourceRequested', function(requestData, request) {
        var BLOCKED_RESOURCES = [
            /\.gif/gi,
            /\.png/gi,
            /\.css/gi,
            /^((?!(feuseradmin\.js|tinymce|jquery-)).)*\.js.*/gi
        ];
        var is_blacklisted_resource = BLOCKED_RESOURCES.some(function(r) {
            return r.test(requestData['url']);
        });

        if (is_blacklisted_resource) {
            // console.log('BLOCKED: ', requestData['url']);
            request.abort();
        } else {
            console.log('[RESOURCE ALLOWED]', requestData.url);
        }
    });
}

function* fetchPage(url, instance) {
    let is_local_instance = false;
    if (!instance) {
        instance = yield * initPhantomInstance();
        is_local_instance = true;
    }

    console.log('Phantom createPage');
    const page = yield instance.createPage();
    console.log('Setup selective resource blocking');
    yield * blockResourceLoading(page);

    console.log('Opening URL', url);
    let status = yield page.open(url);
    console.log('URL opened. Status: ', status);
    console.log('Getting page content');
    let html = yield page.property('content');
    console.log('Closing page');
    yield page.close();
    console.log('Page closed');
    if (is_local_instance) {
        instance.exit();
        console.log('Phantom instance exited.');
    }
    return html;
}

function* initPhantomInstance() {
    console.log('Initiate phantom');
    console.log('Storing phantom instance.');
    return yield phantom.create();
}


module.exports = {
    blockResourceLoading: blockResourceLoading,
    fetchPage: fetchPage,
    initPhantomInstance: initPhantomInstance
};
