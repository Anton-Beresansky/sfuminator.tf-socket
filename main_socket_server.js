process.on('warning', function (warning) {
    console.warn(warning.name);    // Print the warning name
    console.warn(warning.message); // Print the warning message
    console.warn(warning.stack);   // Print the stack trace
});

var Database = require('./lib/database.js');
var SteamAPI = require('./lib/steamapi.js');
var WebAPI = require('./modules/webApi.js');
var SfuminatorRequest = require('./modules/requests.js');
var Sfuminator = require('./sfuminator.js');
var MaxRequestsHandler = require('./maxRequestsHandler.js');
var CFG = require("./cfg.js");

var httpListenPort = CFG.getHTTPListenPort();

var db = new Database(CFG.getDatabaseCredentials('my_sfuminator'));
var db_items = new Database(CFG.getDatabaseCredentials('my_sfuminator_items'));
var steamAPI = new SteamAPI(CFG.getApiKey('steam'));
var webApi = new WebAPI(db_items, steamAPI);
var reqHandler = new MaxRequestsHandler();

webApi.onceReady(function () {
    var sfuminator = new Sfuminator(webApi, db);
    sfuminator.on("ready", function () {
        var http = require('http');
        http.createServer(function (req, res) {
            var body = "";
            res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
            req.on('data', function (chunk) {
                body += chunk;
            });
            req.on('end', function () {
                var request = new SfuminatorRequest(req, body);
                if (reqHandler.allowRequest(request) && request.isReadable()) {
                    sfuminator.onRequest(request, function (result) {
                        res.end(JSON.stringify(result));
                        request = null;
                    });
                } else {
                    res.end("");
                }
            });
        }).listen(httpListenPort, "127.0.0.1");
        console.log('Sfuminator ready, server is running at http://127.0.0.1:/' + httpListenPort);
    });
});