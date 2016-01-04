module.exports = User;

var events = require("events");
var Logs = require('../../lib/logs.js');
var Backpack = require('../backpack.js');
var ShopTrade = require('../shop/shopTrade.js');
var SteamGames = require('../../lib/steamGames.js');

/**
 * General purpose User class
 * @param {String} steamid User steamid
 * @param {Sfuminator} sfuminator The sfuminator instance
 * @returns {User}
 * @constructor
 */
function User(steamid, sfuminator) {
    this.steamid = steamid;
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.db = this.sfuminator.db;
    this.cloud = this.sfuminator.cloud;
    this.tf2Backpack = new Backpack(steamid, SteamGames.TF2, this.cloud);
    this.log = new Logs({applicationName: "User " + JSON.stringify(steamid), color: "cyan"});
    this.decayTime = 1000 * 60 * 60 * 8; // 8hrs
    this.last_use_date = new Date();
    this.update();
    this.tf2Backpack.getCached();
    events.EventEmitter.call(this);
}

require("util").inherits(User, events.EventEmitter);

/**
 * Get steamid
 * @returns {String}
 */
User.prototype.getSteamid = function () {
    return this.steamid;
};
/**
 * Get name
 * @returns {String}
 */
User.prototype.getName = function(){
    return this.personaname;
};

/**
 * Get avatar url (biggest size available)
 * @returns {String}
 */
User.prototype.getAvatar = function(){
    return this.avatarfull;
};

/**
 * Get TF2 Backpack
 * @returns {Backpack}
 */
User.prototype.getTF2Backpack = function () {
    return this.tf2Backpack;
};

/**
 * Check if user has a Shop Trade in progress
 * @returns {Boolean}
 */
User.prototype.hasShopTrade = function () {
    return this.shopTrade instanceof ShopTrade;
};

/**
 * Check if user has a Shop Trade in progress and is active
 * @returns {Boolean}
 */
User.prototype.hasActiveShopTrade = function () {
    return this.hasShopTrade() && this.shopTrade.isActive();
};

/**
 * Get user Shop Trade
 * @returns {ShopTrade} 
 */
User.prototype.getShopTrade = function () {
    return this.shopTrade;
};

/**
 * Make Shop Trade for this user
 * @param {Object} items List of item ids indexed by shop section type
 * @returns {ShopTrade}
 */
User.prototype.makeShopTrade = function (items) {
    this.shopTrade = new ShopTrade(this.sfuminator, this);
    this.shopTrade.setItems(items);
    return this.shopTrade;
};

/**
 * Check if user instance is expired (user data set is outdated / user instance is obsolete)
 * @returns {Boolean}
 */
User.prototype.isExpired = function () {
    return new Date() - this.last_use_date > this.decayTime;
};

/**
 * Extend user instance decay
 */
User.prototype.renewExpiration = function () {
    this._cancelDecay();
    this._startDecay();
};

/**
 * Cancel current user decay status
 */
User.prototype._cancelDecay = function () {
    if (this._decayTimeout) {
        clearTimeout(this._decayTimeout);
    }
};

/**
 * Start user decay
 */
User.prototype._startDecay = function () {
    var self = this;
    this._decayTimeout = setTimeout(function () {
        self.emit("expired", self.steamid);
    }, this.decayTime);
};

/**
 * Update user data set (Name, Avatar)
 */
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

/**
 * Fetch user data set from cloud
 * @param {Function} callback Will pass steam web api response
 */
User.prototype.fetchInfo = function (callback) {
    this.cloud.send("getPlayerSummaries", {steamid: this.steamid}, function (result) {
        if (result && result.hasOwnProperty("players") && result.players.length > 0) {
            callback(result.players);
        } else {
            callback([]);
        }
    });
};

/**
 * Update user data set stored on database
 */
User.prototype.updateDatabase = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.getUpdateUserQuery(connection), function () {
            connection.release();
        });
    });
};

/**
 * Get database update user data set query
 * @param {DatabaseConnection} connection
 * @returns {String}
 */
User.prototype.getUpdateUserQuery = function (connection) {
    return "UPDATE `users` SET `name`=" + (connection.c.escape(this.personaname.toString())) + ", `avatar`='" + this.avatarfull.toString() + "' WHERE steam_id='" + this.steamid + "' LIMIT 1";
};
