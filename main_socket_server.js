/**
 * TODO Test when buyer has only keys and when seller has only keys
 */

var Database = require('./lib/database.js');

//>Items rework
var SteamAPI = require('./lib/steamapi.js');
var WebAPI = require('./modules/webApi/webApi.js');
//<

var SfuminatorRequest = require('./modules/requests.js');
var Sfuminator = require('./sfuminator.js');
var MaxRequestsHandler = require('./maxRequestsHandler.js');
var CFG = require("./cfg.js");

var httpListenPort = CFG.getHTTPListenPort(); //dev ***REMOVED*** | main ***REMOVED***

var db = new Database({user: "root", password: "***REMOVED***", database: "my_sfuminator"});

//>Items rework
var db_items = new Database({user: "root", password: "***REMOVED***", database: "my_sfuminator_items"});
var steamAPI = new SteamAPI("***REMOVED***");
var webApi = new WebAPI(db_items, steamAPI);
//<

var reqHandler = new MaxRequestsHandler();

webApi.onceReady(function () {
    var sfuminator = new Sfuminator(webApi, db);
    sfuminator.on("ready", function () {
        var http = require('http');
        http.createServer(function (req, res) {
            var body = "";
            res.writeHead(200, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*'});
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