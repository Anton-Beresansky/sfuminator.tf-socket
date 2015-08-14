var Database = require('./lib/database.js');
var zmqSocket = require('./lib/zmqSocket.js');
var Cloud = require('./modules/cloud.js');
var SfuminatorRequest = require('./modules/requests.js');
var Sfuminator = require('./sfuminator.js');
var MaxRequestsHandler = require('./maxRequestsHandler.js');

var httpListenPort = 3191; //dev 3191 | main 3190
var socketPorts = {connect: 3002, listen: 3003}; //dev 3002,3003 | main 3000,3001

var db = new Database({user: "root", password: "1bonnica2", database: "my_sfuminator"});
var socket = new zmqSocket({
    connect_address: "104.131.217.119",
    connect_port: socketPorts.connect,
    listen_address: "0.0.0.0",
    listen_port: socketPorts.listen,
    key: "comxz8yoisyc98calxiu48yxdulh4",
    application: "cloud",
    startOption: "p2p"
});
var cloud = new Cloud(socket);
var reqHandler = new MaxRequestsHandler();

cloud.on("cloud_connected", function () {
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