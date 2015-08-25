module.exports = SfuminatorRequest;

var events = require("events");
var qs = require("querystring");
var Logs = require("../lib/logs.js");

function SfuminatorRequest(req, body) {
    this.log = new Logs("Sfuminator Request");
    this.log.setLevel(0);
    this.log.debug("Got new request", 3);
    this.log.debug(body, 3);
    this.req = req;
    this.body = body;
    this.requester = {privilege: "", id: ""};
    this._rootKey = "9x7797qtujacli7l89ku58cyc7oxmtay43";
    this._validHeaderParameters = {
        host: function (value) {
            return value === 'sfuminator.tf' || value === "dev.sfuminator.tf";
        },
        'content-length': function (value) {
            try {
                return parseInt(value) < 4096;
            } catch (e) {
                return false;
            }
        },
        'x-requested-with': 'XMLHttpRequest'
    };
    this._parseCookies();
    this._readable = this.isReadable();
    this._valid = this.isValid();
    this._action = this.getAction();
    events.EventEmitter.call(this);
}

require("util").inherits(SfuminatorRequest, events.EventEmitter);

SfuminatorRequest.prototype.getRequesterSteamid = function () {
    if (this.requester && this.requester.privilege === "user") {
        return this.requester.id;
    }
    return null;
};

SfuminatorRequest.prototype.getRequester = function () {
    if (this.requester) {
        return this.requester;
    }
    return null;
};

SfuminatorRequest.prototype.parseRequester = function (users, callback) {
    var self = this;
    if (this.hasRootKey()) {
        this.requester.privilege = "root";
        callback();
    } else if (this.getToken()) {
        users.getFromToken(this.getToken(), function (user) {
            if (user) {
                self.requester.privilege = "user";
                self.requester.id = user.steamid;
            } else {
                self.requester.privilege = "guest";
            }
            callback();
        });
    } else {
        this.requester.privilege = "guest";
        callback();
    }
};

SfuminatorRequest.prototype.getData = function () {
    if (this.data) {
        return this.data;
    } else {
        this.isReadable();
        return this.data;
    }
};

SfuminatorRequest.prototype.getToken = function () {
    return this.getCookie("token");
};

SfuminatorRequest.prototype.getAction = function () {
    if (this._action) {
        return this._action;
    } else if (this.isValid()) {
        return this.data.action;
    } else {
        return false;
    }
};

SfuminatorRequest.prototype.getIP = function () {
    return this.req.headers["x-forwarded-for"];
};

SfuminatorRequest.prototype.isValid = function () {
    if (this._valid) {
        return true;
    } else if (this.isReadable()) {
        this._valid = true;
        if (!this.hasRootKey()) {
            for (var parameter in this._validHeaderParameters) {
                if (typeof this._validHeaderParameters[parameter] === "function") {
                    if (!this._validHeaderParameters[parameter](this.req.headers[parameter])) {
                        this.log.debug("Invalid " + parameter + ": " + this.req.headers[parameter]);
                        this._valid = false;
                        break;
                    }
                } else {
                    if (this._validHeaderParameters[parameter] !== this.req.headers[parameter]) {
                        this.log.debug("Invalid " + parameter + ": " + this.req.headers[parameter]);
                        this._valid = false;
                        break;
                    }
                }
            }
        }
        return this._valid;
    } else {
        return false;
    }
};

SfuminatorRequest.prototype.isReadable = function () {
    if (this._readable) {
        return true;
    } else {
        this.data = null;
        try {
            this.data = JSON.parse(this.body);
        } catch (e) {
            try {
                this.data = qs.parse(this.body);
            } catch (e) {
                this.log.error(e);
            }
        }
        if (this.data) {
            return true;
        } else {
            return false;
        }
    }
};

SfuminatorRequest.prototype.hasRootKey = function () {
    return this.data.hasOwnProperty("rootKey") && this.data.rootKey === this._rootKey;
};

SfuminatorRequest.prototype.getCookie = function (cname) {
    return this._cookies[cname];
};

SfuminatorRequest.prototype._parseCookies = function () {
    var list = {};
    var rc = this.req.headers.cookie;
    rc && rc.split(';').forEach(function (cookie) {
        var parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    this._cookies = list;
};