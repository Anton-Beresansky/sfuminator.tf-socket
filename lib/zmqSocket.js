//v1.0.0
module.exports = ZmqSocket;
var zmq = require('zmq');
var events = require("events");
//Options
//connect_address,connect_port,listen_address,listen_port,startOption,application,key
function ZmqSocket(options, callback) {
    if (typeof callback === "function") {
        this._onConnect = callback;
    }
    this._debug = false;
    if (options.hasOwnProperty("debug") && options.debug) {
        this._debug = true;
        if (options.hasOwnProperty("debug_depth")) {
            this._dd = options.debug_depth;
        } else {
            this._dd = 0;
        }
    }
    this.transactionsHandlers = {};
    this.connect_port = ***REMOVED***;
    if (options.hasOwnProperty("connect_port")) {
        this.connect_port = options.connect_port;
    }
    this.listen_port = ***REMOVED***;
    if (options.hasOwnProperty("listen_port")) {
        this.listen_port = options.listen_port;
    }
    var startOption = "client";
    if (options.hasOwnProperty("startOption")) {
        startOption = options.startOption;
    }
    this.applicationPool = "default";
    if (options.hasOwnProperty("application")) {
        this.applicationPool = options.application;
    }
    this.key = "";
    if (options.hasOwnProperty("serverKey")) {
        this.key = options.key;
    }
    var connect_address = options.connect_address;
    if (connect_address === "localhost") {
        connect_address = "127.0.0.1";
    }
    this.connect_address = "tcp://" + connect_address;
    var listen_address = options.listen_address;
    if (listen_address === "localhost") {
        listen_address = "127.0.0.1";
    }
    this.listen_address = "tcp://" + listen_address;
    this.localmachine = "tcp://127.0.0.1";
    this.server = zmq.socket('sub');
    this.client = zmq.socket('pub');
    if (startOption) {
        if (startOption === "client") {
            this.startClient();
        } else if (startOption === "server") {
            this.startServer();
        } else if (startOption === "p2p") {
            this.startServer();
            this.startClient();
        }
    }
    this.instanceID = randomString(32);
    this.acquiredHandshakes = [];
    events.EventEmitter.call(this);
    this._d("Initialized zmqSocket");
}

require("util").inherits(ZmqSocket, events.EventEmitter);

ZmqSocket.prototype.startServer = function () {
    this._d("Starting server on " + this.listen_address + ":" + this.listen_port + " | pool: " + this.applicationPool);
    this.server.bindSync(this.listen_address + ":" + this.listen_port);
    this.server.subscribe(this.applicationPool);

    var self = this;
    this.server.on("message", function (applicationPool, key, _partner_instanceID, _transaction, _message) {
        self._d("Got message", 2);
        if (applicationPool.toString() === self.applicationPool && key.toString() === self.key) {
            self._d("Message is valid", 2);
            var transaction = _transaction.toString();
            var message = _message.toString();
            var partner_instanceID = _partner_instanceID.toString();
            try {
                message = JSON.parse(message);
            } catch (e) {
            }
            if (self.transactionsHandlers.hasOwnProperty(transaction)) {
                self._d("Message has a linked transaction: " + transaction);
                self.transactionsHandlers[transaction](message);
                delete self.transactionsHandlers[transaction];
            } else if (message.hasOwnProperty("_zmqSocket")) {
                self._d("Got zmqSocket command: " + message._zmqSocket);
                if (message._zmqSocket === "handshake") {
                    self._send(transaction, JSON.stringify({result: "success"}));
                } else if (message._zmqSocket === "handshake_aquired") {
                    self._send(transaction, self.instanceID);
                    self.acquireHandshake(partner_instanceID);
                }
            } else if ((typeof self._onMessageHandler === "function") && (self.getHandshakeSessionIndex(partner_instanceID) >= 0)) {
                self._d("Message passed response to handler");
                self._onMessageHandler(message, function (answer) {
                    self._send(transaction, JSON.stringify(answer));
                });
            }
        }
    });
};

ZmqSocket.prototype.startClient = function () {
    var self = this;
    this._d("Starting client on " + this.connect_address + ":" + this.connect_port + " | pool: " + this.applicationPool);
    this.client.connect(this.connect_address + ":" + this.connect_port);
    self.emit("connected");
    self._d("Client connected!");
};

ZmqSocket.prototype.onMessage = function (callback) {
    this._d("Got message handler");
    this._onMessageHandler = callback;
};

ZmqSocket.prototype.acquireHandshake = function (partner_instanceID) {
    var self = this;
    var handshakeIndex = this.getHandshakeSessionIndex(partner_instanceID);
    if (handshakeIndex >= 0) {
        clearTimeout(this.acquiredHandshakes[handshakeIndex].decayTimeout);
    } else {
        this.acquiredHandshakes.push({partner_instanceID: partner_instanceID});
        handshakeIndex = this.acquiredHandshakes.length - 1;
        self.emit("tcp_connected", partner_instanceID);
    }
    var handshakeIndex = this.getHandshakeSessionIndex(partner_instanceID);
    var decay = function (partner_instanceID) {
        self.acquiredHandshakes[handshakeIndex].decayTimeout = setTimeout(function () {
            var handshakeIndex = self.getHandshakeSessionIndex(partner_instanceID);
            self.acquiredHandshakes.splice(handshakeIndex, 1);
            self.emit("tcp_disconnected", partner_instanceID);
        }, 5000);
    };
    decay(partner_instanceID);
};

ZmqSocket.prototype.handshake = function () {
    var self = this;
    this._d("Starting handshake procedure...");
    var poke = function () {
        self._d("Poking...");
        self.send({_zmqSocket: "handshake"}, function (answer) {
            clearInterval(pokeInterval);
            self._d("Server responded to handshake: " + JSON.stringify(answer));
            if (answer.result === "success") {
                self.send({_zmqSocket: "handshake_aquired"}, function (partner_instanceID) {
                    self._d("Three way handshake completed");
                    self.acquireHandshake(partner_instanceID);
                    setTimeout(function () {
                        self.handshake();
                    }, 2000);
                });
            } else {
                self.emit("error", "Unexpected response from server o handshake");
            }
        });
    };
    var pokeInterval = setInterval(poke, 1500);
};

ZmqSocket.prototype.getHandshakeSessionIndex = function (partner_instanceID) {
    for (var i = 0; i < this.acquiredHandshakes.length; i += 1) {
        if (this.acquiredHandshakes[i].partner_instanceID === partner_instanceID) {
            return i;
        }
    }
    return -1;
};

ZmqSocket.prototype.send = function (message, callback) {
    if (typeof callback === "function") {
        var transaction = this._generateTransactionID();
        while (this.transactionsHandlers.hasOwnProperty(transaction)) {
            transaction = this._generateTransactionID();
        }
        this.transactionsHandlers[transaction] = callback;
    }
    this._send(transaction, JSON.stringify(message));
};

ZmqSocket.prototype._send = function (transaction, message) {
    this.client.send([this.applicationPool, this.key, this.instanceID, transaction, message]);
    this._d("Sent message, transaction: " + transaction, 2);
};

ZmqSocket.prototype._generateTransactionID = function () {
    return randomString(8);
};

ZmqSocket.prototype._d = function (message, depth) {
    if (this._debug) {
        if (!depth || depth <= this._dd) {
            console.log("> zmqSocket - " + message);
        }
    }
};

function randomString(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}