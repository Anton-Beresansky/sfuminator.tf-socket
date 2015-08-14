module.exports = MaxRequestsHandler;

var Logs = require("./lib/logs.js");

function MaxRequestsHandler() {
    this.log = new Logs("Max requests handler");
    this.whitelist = [
        "107.170.135.170"
    ];
    this.requests = {};
    this.banned = {};
    this.ban_window_mls = 120000;
    this.requests_window_seconds = 10;
    this.max_requests_per_second = 3;
    var self = this;
    setInterval(function () {
        self.cleanOldRequests();
    }, this.requests_window_seconds * 3000);
}

MaxRequestsHandler.prototype.cleanOldRequests = function () {
    var limit = (this.requests_window_seconds * 1000) - new Date();
    for (var ip in this.requests) {
        var length = this.requests[ip].length;
        for (var i = 0; i < length; i += 1) {
            if (this.requests[ip][i] > limit) {
                this.requests[ip].splice(i, 1);
                length -= 1;
            }
        }
    }
};

MaxRequestsHandler.prototype.allowRequest = function (request) {
    var ip = request.getIP();
    if (this.isIpWhitelisted(ip)) {
        return true;
    }
    if (this.ipIsBanned(ip)) {
        return false;
    }
    this.add(ip);
    var count = this.getCountSince(new Date() - (this.requests_window_seconds * 1000), ip);
    if ((count / this.requests_window_seconds) > this.max_requests_per_second) {
        this.banIP(ip);
        return false;
    } else {
        return true;
    }
};

MaxRequestsHandler.prototype.ipIsBanned = function (ip) {
    if (this.banned.hasOwnProperty(ip)) {
        if (this.banned[ip] > (new Date() - this.ban_window_mls)) {
            return true;
        } else {
            delete this.banned[ip];
        }
    }
    return false;
};

MaxRequestsHandler.prototype.banIP = function (ip) {
    this.log.warning("OMG! Banned ip " + ip);
    this.banned[ip] = new Date();
};

MaxRequestsHandler.prototype.add = function (ip) {
    if (!this.requests.hasOwnProperty(ip)) {
        this.requests[ip] = [new Date()];
    } else {
        this.requests[ip].push(new Date());
    }
};

MaxRequestsHandler.prototype.getCountSince = function (date, ip) {
    var requests = this.requests[ip];
    var counter = 0;
    for (var i = 0; i < requests.length; i += 1) {
        if (requests[i] > date) {
            counter += 1;
        }
    }
    return counter;
};
MaxRequestsHandler.prototype.isIpWhitelisted = function (ip) {
    for (var i = 0; i < this.whitelist.length; i += 1) {
        if (this.whitelist[i] === ip) {
            return true;
        }
    }
    return false;
};