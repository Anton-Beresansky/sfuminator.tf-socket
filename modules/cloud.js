module.exports = Cloud;

var events = require("events");

function Cloud(socket, options) {
    var self = this;
    this.socket = socket;
    this._d("Looking for cloud...");
    this.socket.handshake();
    this.socket.on("tcp_connected", function (id) {
        self._d("Connected with partner: " + id);
        self.emit("cloud_connected");
    });
    this.socket.on("tcp_disconnected", function (id) {
        self._d("Lost connection with partner: " + id);
        self.emit("cloud_disconnected");
    });
    this.ping = 0;
    this._debug = false;
    this._dd = 0;
    if (options && options.hasOwnProperty("debug")) {
        if (options.hasOwnProperty("debug_depth")) {
            this._dd = options.debug_depth;
        }
        this._debug = options.debug;
    }
    events.EventEmitter.call(this);
}
require("util").inherits(Cloud, events.EventEmitter);

Cloud.prototype.query = function (query, callback) {
    this.send("query", query, function (result) {
        callback(result);
    });
};

Cloud.prototype.send = function (action, data, callback) {
    var self = this;
    var time_beforeSending = new Date();
    this.socket.send({action: action, parameters: data}, function (result) {
        callback(result.data);
        var total_timing = new Date() - time_beforeSending;
        self._d("> Cloud action: " + action + " | Total timing: " + total_timing + "ms, cloud timing: " + result.timingInfo);
        self.updatePing(total_timing - result.timingInfo);
    });
};

Cloud.prototype.onMessage = function (callback) {
    this.socket.onMessage(function (message, answer) {
        var timeOnMessage = new Date();
        callback(message.action, message.parameters, function (response) {
            answer({data: response, timingInfo: new Date() - timeOnMessage});
        });
    });
};

Cloud.prototype._d = function (message, depth) {
    if (this._debug) {
        if (!depth || depth <= this._dd) {
            console.log("> zmqSocket - " + message);
        }
    }
};

Cloud.prototype.updatePing = function (newPing) {
    this.ping = parseInt((this.ping * 0.7) + (newPing * 0.3));
};