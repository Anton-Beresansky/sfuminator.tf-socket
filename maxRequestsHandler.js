module.exports = MaxRequestsHandler;

var Logs = require("./lib/logs.js");

/**
 * General purpose Max Requests Handler class
 * @returns {MaxRequestsHandler}
 */
function MaxRequestsHandler() {
    this.log = new Logs({applicationName: "Max requests handler", color: "gray"});
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

/**
 * Clean from memory outdated requests
 */
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

/**
 * Establish if request is allowed
 * @param {SfuminatorRequest} request
 * @returns {Boolean}
 */
MaxRequestsHandler.prototype.allowRequest = function (request) {
    var ip = request.getIP();
    if (this.isIpWhitelisted(ip)) {
        return true;
    }
    if (this.ipIsBanned(ip)) {
        return false;
    }
    this.track(request);
    var count = this.getCountSince(new Date() - (this.requests_window_seconds * 1000), ip);
    if ((count / this.requests_window_seconds) > this.max_requests_per_second) {
        this.banIP(ip);
        return false;
    } else {
        return true;
    }
};

/**
 * Establish if given ip is currently banned
 * @param {String} ip
 * @returns {Boolean}
 */
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

/**
 * Ban given ip
 * @param {String} ip
 * @returns {undefined}
 */
MaxRequestsHandler.prototype.banIP = function (ip) {
    this.log.warning("OMG! Banned ip " + ip);
    this.banned[ip] = new Date();
};

/**
 * Track request
 * @param {SfuminatorRequest} request
 */
MaxRequestsHandler.prototype.track = function (request) {
    var ip = request.getIP();
    if (!this.requests.hasOwnProperty(ip)) {
        this.requests[ip] = {date: [new Date()], req: request};
    } else {
        this.requests[ip].date.push(new Date());
    }
};

/**
 * Get number of requests from a given IP starting from a given date
 * @param {Date} date
 * @param {String} ip
 * @returns {Number}
 */
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

/**
 * Establish if given IP is whitelisted
 * @param {String} ip
 * @returns {Boolean}
 */
MaxRequestsHandler.prototype.isIpWhitelisted = function (ip) {
    for (var i = 0; i < this.whitelist.length; i += 1) {
        if (this.whitelist[i] === ip) {
            return true;
        }
    }
    return false;
};