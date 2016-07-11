module.exports = {
    blockResourceLoading: blockResourceLoading,
    getPerformanceResults: getPerformanceResults,
    formatPerformanceResults: formatPerformanceResults,
    fetchPage: fetchPage,
    initPhantomInstance: initPhantomInstance
};


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

function getPerformanceResults() {
    let results = {
        pages: {},
        members: {}
    };

    results.pages.count = PAGES_PARSED;
    results.pages.total_time = PAGES_PARSE_TIMES.reduce(sum, 0);
    results.pages.average_time = results.pages.total_time / results.pages.count;

    results.members.count = MEMBERS_PARSED;
    results.members.total_time = MEMBERS_PARSE_TIMES.reduce(sum, 0);
    results.members.average_time = results.members.total_time / results.members.count;

    return results;
}

function formatPerformanceResults(results) {
    let text = '';
    text += `Nr. of pages parsed: ${results.pages.count}\n`;
    text += `Total time for parsing pages: ${results.pages.total_time}ms\n`;
    text += `Average parse time per page: ${results.pages.average_time}ms\n`;
    text += '\n';
    text += `Nr. of members parsed: ${results.members.count}\n`;
    text += `Total time for parsing members: ${results.members.total_time}ms\n`;
    text += `Average parse time per member: ${results.members.average_time}ms\n`;

    return text;
}

function sum(a, b) {
    return a + b;
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
