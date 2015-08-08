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
    this.log = new Logs("User " + steamid);
    this.decayTime = 1000 * 60 * 60 * 8; // 8hrs
    this.last_use_date = new Date();
    events.EventEmitter.call(this);
}

require("util").inherits(User, events.EventEmitter);

User.prototype.getSteamid = function () {
    return this.steamid;
};

User.prototype.getTF2Backpack = function () {
    return this.tf2Backpack;
};

User.prototype.setInTrade = function () {
    this.inTrade = true;
};

User.prototype.isInTrade = function () {
    return this.inTrade === true;
};

User.prototype.getTrade = function () {
    return this.trade;
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