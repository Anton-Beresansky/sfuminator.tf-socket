module.exports = User;

var events = require("events");
var Logs = require('../../lib/logs.js');
var Backpack = require('../backpack.js');
var ShopTrade = require('../shop/shopTrade.js');
var SteamGames = require('../../lib/steamGames.js');
var Wallet = require('./wallet.js');
var Section = require("../shop/shopSection.js");

/**
 * General purpose User class
 * When creating a new instance, user identity is requested to steam api
 * while the other information is gathered from the database
 * Instance will lasts for 8 hours if unused
 *
 * @param {String} steamid User steamid
 * @param {Sfuminator} sfuminator The sfuminator instance
 * @returns {User}
 * @constructor
 */
function User(steamid, sfuminator) {
    this.steamid = steamid;
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.market = this.sfuminator.shop.market;
    this.db = this.sfuminator.db;
    this.webApi = this.sfuminator.webApi;
    this.tf2Backpack = new Backpack(steamid, SteamGames.TF2, this.webApi);
    this.log = new Logs({applicationName: "User " + JSON.stringify(steamid), color: "cyan"});
    this.decayTime = 1000 * 60 * 60 * 8; // 8hrs
    this.last_use_date = new Date();
    this.databaseHasBeenLoaded = false;
    this._onceLoadedCallbacks = [];
    this.updateIdentity();
    this.loadDatabaseInfo();
    this.createMarketerSection();
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
User.prototype.getName = function () {
    return this.personaname;
};

/**
 * Get avatar url (biggest size available)
 * @returns {String}
 */
User.prototype.getAvatar = function () {
    return this.avatarfull;
};

User.prototype.getFirstLogin = function () {
    if (this._canGetDatabaseParameter()) {
        return this.first_login;
    } else {
        return new Date();
    }
};

User.prototype.getLastLogin = function () {
    if (this._canGetDatabaseParameter()) {
        return this.last_login;
    } else {
        return new Date();
    }
};

User.prototype.getLastVisit = function () {
    if (this._canGetDatabaseParameter()) {
        return this.last_visit;
    } else {
        return new Date();
    }
};

User.prototype.getNumberOfTrades = function () {
    if (this._canGetDatabaseParameter()) {
        return this.numberOfTrades;
    } else {
        return 0;
    }
};

/**
 * @returns {Wallet}
 */
User.prototype.getWallet = function () {
    if (this._canGetDatabaseParameter()) {
        return this.wallet;
    } else {
        return new Wallet(this);
    }
};

/**
 * Get TF2 Backpack
 * @returns {Backpack}
 */
User.prototype.getTF2Backpack = function () {
    return this.tf2Backpack;
};

User.prototype.isMarketer = function () {
    return this.market.marketerExists(this.getSteamid());
};

User.prototype.getMarketedShopItems = function () {
    var marketedItems = [];
    var marketItems = this.market.items;
    for (var i = 0; i < marketItems.length; i += 1) {
        if (marketItems[i].getMarketer() === this.steamid && marketItems[i].isAvailable()) {
            marketedItems.push(marketItems[i].getShopItem());
        }
    }
    return marketedItems;
};

User.prototype.createMarketerSection = function () {
    this.marketerSection = new Section(this.shop, "marketer");
    var items = this.getMarketedShopItems();
    for (var i = 0; i < items.length; i += 1) {
        this.marketerSection.add(items[i]);
    }
    this.marketerSection.commit();
};

/**
 * @returns {Section}
 */
User.prototype.getMarketerSection = function () {
    return this.marketerSection;
};

/**
 * @param request {SfuminatorRequest}
 */
User.prototype.setTradeRequestPage = function (request) {
    this.tradeRequestPage = request.getHeader("referer");
};

/**
 * @param request {SfuminatorRequest}
 */
User.prototype.canGetTradeUpdates = function (request) {
    return this.hasActiveShopTrade() && ((request.getHeader("referer") === this.tradeRequestPage) || !this.tradeRequestPage);
};

User.prototype.canTrade = function () {
    return !this.sfuminator.getCannotTradeResponse(this);
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

User.prototype.hasTradeToken = function () {
    return this.tradeToken;
};

User.prototype.getTradeToken = function () {
    return this.tradeToken;
};

User.prototype.setTradeToken = function (token) {
    this.tradeToken = token;
    this._saveTradeToken();
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

User.prototype.onceLoaded = function (callback) {
    this.databaseHasBeenLoaded ? callback(this) : this._onceLoadedCallbacks.push(callback);
};

User.prototype._handleOnceLoadedCallbacks = function () {
    for (var i = 0; i < this._onceLoadedCallbacks.length; i += 1) {
        this._onceLoadedCallbacks[i](this);
    }
    delete this._onceLoadedCallbacks;
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

User.prototype.loadDatabaseInfo = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            self._loadUserInfoFromDatabase(connection, function () {
                self._loadNumberOfTrades(connection, function () {
                    connection.commitRelease();
                    self.databaseHasBeenLoaded = true;
                    self.emit('databaseLoaded');
                });
            });
        });
    });
    this.once('databaseLoaded', this._handleOnceLoadedCallbacks);
};

/**
 * Update user data set (Name, Avatar)
 */
User.prototype.updateIdentity = function () {
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
 * Fetch user data set from webApi
 * @param {Function} callback Will pass steam web api response
 */
User.prototype.fetchInfo = function (callback) {
    this.webApi.steamApi.getPlayerSummaries(this.steamid, function (result) {
        if (result && result.hasOwnProperty("response") && result.response.hasOwnProperty("players") && result.response.players.length > 0) {
            callback(result.response.players);
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
        connection.query(self._getUpdateUserQuery(connection), function () {
            connection.release();
        });
    });
};

User.prototype._canGetDatabaseParameter = function () {
    if (this.databaseHasBeenLoaded) {
        return true;
    } else {
        this.log.error("Requesting parameter that hasn't been loaded from database yet")
    }
};

User.prototype._loadUserInfoFromDatabase = function (connection, callback) {
    var self = this;
    connection.query(this._getFetchUserInfoQuery(), function (result, isEmpty) {
        if (!isEmpty) {
            var dbUser = result[0];
            self.first_login = new Date(dbUser.first_login);
            self.last_login = new Date(dbUser.last_login);
            self.last_visit = new Date(dbUser.last_visit);
            self.tradeToken = dbUser.trade_token;
            self.wallet = new Wallet(self, dbUser.wallet);
        } else {
            self.first_login = new Date();
            self.last_login = new Date();
            self.last_visit = new Date();
            self.tradeToken = null;
            self.wallet = new Wallet(self, 0);
        }
        callback();
    });
};

User.prototype._loadNumberOfTrades = function (connection, callback) {
    var self = this;
    connection.query(this._getFetchNumberOfTradesQuery(), function (result, isEmpty) {
        if (!isEmpty) {
            self.numberOfTrades = result[0].numberOfTrades;
        } else {
            self.numberOfTrades = 0;
        }
        callback();
    });
};

User.prototype._saveTradeToken = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getSaveTradeTokenQuery(), function () {
            connection.release();
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};

/**
 * Get database update user data set query
 * @param {DatabaseConnection} connection
 * @returns {String}
 */
User.prototype._getUpdateUserQuery = function (connection) {
    return "UPDATE `users` SET `name`=" + (connection.c.escape(this.personaname.toString())) + ", `avatar`='" + this.avatarfull.toString() + "' WHERE steam_id='" + this.steamid + "' LIMIT 1";
};

User.prototype._getSaveTradeTokenQuery = function () {
    return "UPDATE `users` SET `trade_token`='" + this.tradeToken + "' WHERE `steam_id`='" + this.steamid + "'";
};

User.prototype._getFetchUserInfoQuery = function () {
    return "SELECT `first_login`,`last_login`,`last_visit`,`trade_token`,`wallet` FROM `users` where `steam_id`='" + this.steamid + "'";
};

User.prototype._getFetchNumberOfTradesQuery = function () {
    return "SELECT count(*) AS numberOfTrades FROM shop_trades WHERE steamid='" + this.steamid + "' AND status_info='accepted'";
};