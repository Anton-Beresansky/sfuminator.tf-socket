module.exports = Users;

var events = require("events");
var Logs = require('../lib/logs.js');
var User = require("./user/user.js");

function Users(sfuminator) {
    this.sfuminator = sfuminator;
    this.db = this.sfuminator.db;
    this.cloud = this.sfuminator.cloud;
    this.log = new Logs("Users");
    this.log.setLevel(0);
    this._users = {};
    events.EventEmitter.call(this);
}

require("util").inherits(Users, events.EventEmitter);

//Will callback only if steamid associated to token has been found
Users.prototype.getFromToken = function (token, callback) {
    var self = this;
    this.getSteamidFromToken(token, function (steamid) {
        if (steamid) {
            callback(self.get(steamid));
        } else {
            callback(null);
        }
    });
};

Users.prototype.get = function (steamid) {
    var self = this;
    var myUser = null;
    if (!this.steamidExist(steamid)) {
        this.log.debug("Getting user (new): " + steamid, 3);
        myUser = new User(steamid, this.sfuminator);
        myUser.on("expired", function (steamid) {
            delete self._users[steamid];
        });
        this._users[steamid] = myUser;
    } else {
        this.log.debug("Getting user (found): " + steamid, 3);
        myUser = this._users[steamid];
    }
    myUser.renewExpiration();
    return myUser;
};

Users.prototype.getSteamidFromToken = function (token, callback) {
    var self = this;
    var steamid = this.getLocalSteamidFromToken(token);
    if (steamid) {
        callback(steamid);
    } else {
        this.getOnlineStamidFromToken(token, function (steamid) {
            if (steamid) {
                callback(steamid);
            } else {
                self.log.warning("Specified token has no users associated (" + token + ")");
                callback("");
            }
        });
    }
};

Users.prototype.getOnlineStamidFromToken = function (token, callback) {
    this.db.connect(function (connection) {
        connection.query("SELECT steam_id as steamid FROM users WHERE token=" + connection.c.escape(token) + " LIMIT 1", function (result) {
            connection.release();
            if (result[0] && result[0].hasOwnProperty("steamid")) {
                callback(result[0].steamid);
            } else {
                callback(null);
            }
        });
    });
};

Users.prototype.getLocalSteamidFromToken = function (token) {
    for (var i in this._users) {
        if (this._users[i].token === token) {
            return i;
        }
    }
    return false;
};

Users.prototype.steamidExist = function (steamid) {
    return this._users.hasOwnProperty(steamid);
};