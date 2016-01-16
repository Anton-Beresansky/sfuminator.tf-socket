var Database = require('./lib/database.js');
var zmqSocket = require('./lib/zmqSocket.js');
var Cloud = require('./modules/cloud.js');

//>Items rework
var SteamAPI = require('./lib/steamapi.js');
var WebAPI = require('./modules/webApi/webApi.js');
//<

var SfuminatorRequest = require('./modules/requests.js');
var Sfuminator = require('./sfuminator.js');
var MaxRequestsHandler = require('./maxRequestsHandler.js');
var CFG = require("./cfg.js");

var httpListenPort = CFG.getHTTPListenPort(); //dev ***REMOVED*** | main ***REMOVED***
var socketPorts = {connect: CFG.getConnectCloudPort(), listen: CFG.getListenCloudPort()}; //main ***REMOVED***,***REMOVED*** | dev ***REMOVED***,***REMOVED***

var db = new Database({user: "root", password: "***REMOVED***", database: "my_sfuminator"});

//>Items rework
var db_items = new Database({user: "root", password: "***REMOVED***", database: "my_sfuminator_items"});
var steamAPI = new SteamAPI("***REMOVED***");
//var webApi = new WebAPI(db_items, steamAPI);
//<

var socket = new zmqSocket({
    connect_address: "***REMOVED***",
    connect_port: socketPorts.connect,
    listen_address: "0.0.0.0",
    listen_port: socketPorts.listen,
    key: "***REMOVED***",
    application: "cloud",
    startOption: "p2p"
});

var cloud = new Cloud(socket);
var reqHandler = new MaxRequestsHandler();

cloud.on("cloud_first_connection", function () {
    console.log("Cloud connected");
    sfuminator = new Sfuminator(cloud, db);
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