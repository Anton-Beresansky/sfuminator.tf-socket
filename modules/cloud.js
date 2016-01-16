module.exports = Cloud;

var events = require("events");

/**
 * General purpose Cloud interface class
 * @param {ZmqSocket} socket
 * @param {Object} options
 * @returns {Cloud}
 * @construct
 */
function Cloud(socket, options) {
    var self = this;
    this.socket = socket;
    this.firstConnection = true;
    this._d("Looking for cloud...");
    this.socket.handshake();
    this.socket.on("tcp_connected", function (id) {
        self._d("Connected with partner: " + id);
        self.emit("cloud_connected");
        if (self.firstConnection) {
            self.firstConnection = false;
            self.emit("cloud_first_connection");
        }
    });
    this.socket.on("tcp_disconnected", function (id) {
        self.sending = false;
        self._d("Lost connection with partner: " + id);
        self.emit("cloud_disconnected");
    });
    this.ping = 0;
    this.sending = false;
    /**
     * @type {CloudRequest[]}
     * @private
     */
    this._stack = [];
    this._debug = true;
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

/**
 * Request query execution from cloud database
 * @param {String} query
 * @param {Function} callback Will pass query result
 */
Cloud.prototype.query = function (query, callback) {
    this.send("query", query, function (result) {
        callback(result);
    });
};

/**
 * Send data packet to cloud
 * @param {String} action Defines the action
 * @param {Object} data Action parameters
 * @param {Function} callback Will pass cloud response
 */
Cloud.prototype.send = function (action, data, callback) {
    var self = this;
    var time_beforeSending = new Date();
    /*if (this.isSending()) {
        this._d("Stacking request");
        this._stack.push(new CloudRequest(action, data, callback));
        return;
    }*/

    this.sending = true;
    this.socket.send({action: action, parameters: data}, function (result) {
        self.sending = false;
        callback(result.data);
        var total_timing = new Date() - time_beforeSending;
        self._d("> Cloud action: " + action + " | Total timing: " + total_timing + "ms, cloud timing: " + result.timingInfo);
        self.updatePing(total_timing - result.timingInfo);
        self.processNextRequest();
    });
};

Cloud.prototype.processNextRequest = function () {
    if (this._stack.length > 0) {
        var request = this._stack[0];
        this._d("Processing stacked request");
        this.send(request.action, request.data, request.callback);
        this._stack.splice(0, 1);
    }
};

Cloud.prototype.isSending = function () {
    return this.sending;
};

/**
 * Will execute given function on incoming cloud message
 * @param {Function} callback(Action,Parameters,Answer())
 */
Cloud.prototype.onMessage = function (callback) {
    this.socket.onMessage(function (message, answer) {
        var timeOnMessage = new Date();
        callback(message.action, message.parameters, function (response) {
            answer({data: response, timingInfo: new Date() - timeOnMessage});
        });
    });
};

/**
 * Debug
 * @param {String} message
 * @param {Number} depth
 */
Cloud.prototype._d = function (message, depth) {
    if (this._debug) {
        if (!depth || depth <= this._dd) {
            console.log("> zmqSocket - " + message);
        }
    }
};

/**
 * Update local<->cloud ping
 * @param {Number} newPing
 */
Cloud.prototype.updatePing = function (newPing) {
    this.ping = parseInt((this.ping * 0.7) + (newPing * 0.3));
};

/**
 * Get current local<->cloud ping
 * @returns {Number} ping
 */
Cloud.prototype.getPing = function () {
    return this.ping;
};

/**
 *
 * @constructor
 */
function CloudRequest(action, data, callback) {
    this.action = action;
    this.data = data;
    this.callback = callback;
}

