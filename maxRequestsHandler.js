module.exports = MaxRequestsHandler;

var Logs = require("./lib/logs.js");

function MaxRequestsHandler() {
    this.log = new Logs("Max requests handler");
    this.whitelist = [
        "***REMOVED***"
    ];
    this.requests = {};
    this.banned = {};
    this.ban_window_mls = 120000;
    this.requests_window_seconds = 10;
    this.max_requests_per_second = 5;
    var self = this;
    setInterval(function () {
        self.cleanOldRequests();
    }, this.requests_window_seconds * ***REMOVED***);
    setInterval(function () {
        var clients = 0;
        var users = 0;
        for (var ip in self.requests) {
            if (self.requests.hasOwnProperty(ip)) {
                clients += 1;
                if (self.requests[ip].req.getRequesterSteamid()) {
                    users += 1;
                }
            }
        }
        self.log.debug("Currently dealing with: " + clients + " clients (" + users + " users)");
    }, 15000);
}

MaxRequestsHandler.prototype.cleanOldRequests = function () {
    var limit = new Date() - (this.requests_window_seconds * 1000);
    for (var ip in this.requests) {
        var length = this.requests[ip].date.length;
        for (var i = 0; i < length; i += 1) {
            if (this.requests[ip].date[i] < limit) {
                this.requests[ip].date.splice(i, 1);
                length -= 1;
            }
        }
        if (length === 0) {
            delete this.requests[ip];
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
    this.add(request);
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

MaxRequestsHandler.prototype.add = function (request) {
    var ip = request.getIP();
    if (!this.requests.hasOwnProperty(ip)) {
        this.requests[ip] = {date: [new Date()], req: request};
    } else {
        this.requests[ip].date.push(new Date());
    }
};

MaxRequestsHandler.prototype.getCountSince = function (date, ip) {
    var requests = this.requests[ip];
    var counter = 0;
    for (var i = 0; i < requests.date.length; i += 1) {
        if (requests.date[i] > date) {
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