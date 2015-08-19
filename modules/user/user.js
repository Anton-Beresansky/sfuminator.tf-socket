module.exports = User;

var events = require("events");
var Logs = require('../../lib/logs.js');
var Backpack = require('../backpack.js');
var ShopTrade = require('../shop/shopTrade.js');

function User(steamid, sfuminator) {
    this.steamid = steamid;
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.db = this.sfuminator.db;
    this.cloud = this.sfuminator.cloud;
    this.tf2Backpack = new Backpack(steamid, 440, this.cloud);
    this.log = new Logs("User " + JSON.stringify(steamid));
    this.decayTime = 1000 * 60 * 60 * 8; // 8hrs
    this.last_use_date = new Date();
    this.update();
    this.tf2Backpack.getCached();
    events.EventEmitter.call(this);
}

require("util").inherits(User, events.EventEmitter);

User.prototype.getSteamid = function () {
    return this.steamid;
};

User.prototype.getName = function(){
    return this.personaname;
};

User.prototype.getAvatar = function(){
    return this.avatarfull;
};

User.prototype.getTF2Backpack = function () {
    return this.tf2Backpack;
};

User.prototype.getTrade = function () {
    return this.trade;
};

User.prototype.hasShopTrade = function () {
    return this.shopTrade instanceof ShopTrade;
};

User.prototype.hasActiveShopTrade = function () {
    return this.hasShopTrade() && this.shopTrade.isActive();
};

User.prototype.getShopTrade = function () {
    return this.shopTrade;
};

User.prototype.makeShopTrade = function (items) {
    this.shopTrade = new ShopTrade(this.sfuminator, this);
    this.shopTrade.setItems(items);
    return this.shopTrade;
};

User.prototype.isExpired = function () {
    return new Date() - this.last_use_date > this.decayTime;
};

User.prototype.renewExpiration = function () {
    this._cancelDecay();
    this._startDecay();
};

User.prototype._cancelDecay = function () {
    if (this._decayTimeout) {
        clearTimeout(this._decayTimeout);
    }
};

User.prototype._startDecay = function () {
    var self = this;
    this._decayTimeout = setTimeout(function () {
        self.emit("expired", self.steamid);
    }, this.decayTime);
};

User.prototype.update = function () {
    var self = this;
    this.fetchInfo(function (_info) {
        for (var i = 0; i < _info.length; i += 1) {
            var info = _info[i];
            if (info && info.hasOwnProperty("personaname") && info.hasOwnProperty("avatarfull") && info.hasOwnProperty("steamid")) {
                self.log.debug("Updating: " + info.personaname);
                for (var property in info) {
                    self[property] = info[property];
                }
                self.updateDatabase();
            }
        }
    });
};

User.prototype.fetchInfo = function (callback) {
    this.cloud.send("getPlayerSummaries", {steamid: this.steamid}, function (result) {
        if (result && result.hasOwnProperty("players") && result.players.length > 0) {
            callback(result.players);
        } else {
            callback([]);
        }
    });
};

User.prototype.updateDatabase = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.getUpdateUserQuery(connection), function () {
            connection.release();
        });
    });
};

User.prototype.getUpdateUserQuery = function (connection) {
    return "UPDATE `users` SET `name`=" + (connection.c.escape(this.personaname.toString())) + ", `avatar`='" + this.avatarfull.toString() + "' WHERE steam_id='" + this.steamid + "' LIMIT 1";
};
