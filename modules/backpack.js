module.exports = Backpack;

var events = require("events");
var Logs = require('../lib/logs.js');
var Price = require("../modules/price.js");
var TF2Item = require("./tf2/tf2Item.js");
var SteamGames = require('../lib/steamGames.js');

/**
 * Generic purpose Steam Backpack library
 * @param {String} steamid
 * @param {SteamGame} game
 * @param {Cloud} cloud Cloud connection
 * @returns {Backpack}
 * @construct
 */
function Backpack(steamid, game, cloud) {
    this.cloud = cloud;
    this.log = new Logs({applicationName: "Backpack " + steamid});
    this.log.setLevel(100);
    this.game = game;
    this.owner = steamid;
    this.decayTime = 90000; // 1:30min
    this.last_update_date = new Date(0);
    this.fetching = false;
    this.fetched = false;
    this._onceHasBeenFetchedHandlers = [];
    events.EventEmitter.call(this);
}

require("util").inherits(Backpack, events.EventEmitter);

/**
 * Get last backpack update
 * @returns {Date}
 */
Backpack.prototype.getLastUpdateDate = function () {
    return this.last_update_date;
};

/**
 * Get backpack owner steamid
 * @returns {String}
 */
Backpack.prototype.getOwner = function () {
    return this.owner;
};

/**
 * Get cached backpack<br>
 * Will be fetching a new inventory only if current backpack results outdated
 * @param {Function} callback Self is passed
 */
/*Backpack.prototype.getCached = function (callback) {
    var self = this;
    this.log.debug("Getting cached backpack", 1);
    if (this.isOutdated() || !this.hasBeenFetched()) {
        this.get(function () {
            if (typeof callback === "function") {
                callback(self);
            }
        });
    } else if (this.isFetching()) {
        this.onceHasBeenFetched(function () {
            if (typeof callback === "function") {
                callback(self);
            }
        });
    } else {
        if (typeof callback === "function") {
            callback(this);
        }
    }
};*/
Backpack.prototype.getCached = function (callback) {
    var self = this;
    this.log.debug("Getting cached backpack", 1);
    if (this.isOutdated()) {
        this.get(function () {
            if (typeof callback === "function") {
                callback(self);
            }
        });
    } else {
        if (typeof callback === "function") {
            callback(this);
        }
    }
};

/**
 * Get backpack (will fetch the latest inventory)
 * @param {Function} callback Self is passed
 */
Backpack.prototype.get = function (callback) {
    var self = this;
    this.fetching = true;
    this.cloud.send("getBackpack", {steamid: this.getOwner(), game: this.game.getID()}, function (result) {
        var backpackWillChange = self._willChange(result.items);
        for (var i in result) {
            self[i] = result[i];
        }
        if (self.items) {
            self._createItemsObject();
        }
        self.last_update_date = new Date();
        self._encodeFetchingError(result);
        self.renewExpiration();

        var error_code = self.getErrorCode();
        if (error_code === "#database_backpack") {
            self.log.debug("Fetching has errored: " + error_code, 1);
        } else if (error_code) {
            self.log.warning("Fetching has errored: " + error_code);
        }

        self.fetching = false;
        self.fetched = true;

        //self._manageOnceHasBeenFetchedHandlers();
        if (typeof callback === "function") {
            callback(self);
        }
        if (backpackWillChange) {
            self.emit("newItems", self.items);
        }
    });
};

Backpack.prototype.onceHasBeenFetched = function (callback) {
    this._onceHasBeenFetchedHandlers.push(callback);
};

Backpack.prototype.hasBeenFetched = function () {
    return this.fetched;
};

Backpack.prototype.isFetching = function () {
    return this.fetching;
};

/**
 * Check if given item exist in the inventory
 * @param {Number} itemID
 * @returns {Boolean}
 */
Backpack.prototype.itemExist = function (itemID) {
    return this.getItem(itemID) !== false;
};

/**
 * Get item from id
 * @param {Number} itemID
 * @returns {TF2Item|Boolean} False if item does not exist
 */
Backpack.prototype.getItem = function (itemID) {
    if (this.items instanceof Array) {
        for (var i = 0; i < this.items.length; i += 1) {
            if (this.items[i].getID() === itemID) {
                return this.items[i];
            }
        }
    }
    return false;
};

/**
 * @returns {TF2Item[]}
 */
Backpack.prototype.getItems = function () {
    if (this.items instanceof Array) {
        return this.items;
    }
    return [];
};

Backpack.prototype.getCurrencyItems = function () {
    var currencyItems = [];
    if (this.items instanceof Array) {
        for (var i = 0; i < this.items.length; i += 1) {
            if (this.items[i].isCurrency()) {
                currencyItems.push(this.items[i]);
            }
        }
    }
    return currencyItems;
};

/**
 * @returns {Price}
 */
Backpack.prototype.getCurrencyAmount = function () {
    var currencyItems = this.getCurrencyItems();
    var value = 0;
    for (var i = 0; i < currencyItems.length; i += 1) {
        value += currencyItems[i].getPrice();
    }
    return new Price(value, "scrap");
};

Backpack.prototype.hasTF2Items = function () {
    return this.game.getID() === SteamGames.TF2.getID();
};

/**
 * Establish if last backpack fetch has errored
 * @returns {Boolean}
 */
Backpack.prototype.hasErrored = function () {
    return this.error === true;
};

/**
 * Get last backpack fetch error code
 * @returns {String}
 */
Backpack.prototype.getErrorCode = function () {
    if (this.hasErrored()) {
        return this._error_code;
    }
    return "";
};

/**
 * Get last backpack fetch error message
 * @returns {String}
 */
Backpack.prototype.getErrorMessage = function () {
    if (this.hasErrored() && this.error_message) {
        return this.error_message;
    }
    return "";
};

/**
 * Encode backpack fetching error
 * @param {Object} newBackpack Result from cloud fetching
 */
Backpack.prototype._encodeFetchingError = function (newBackpack) {
    this.error = false;
    if (newBackpack.hasOwnProperty("result") && newBackpack.result === "error") {
        if (newBackpack.code === "#steam_api_down") {
            this.error = true;
            this._error_code = newBackpack.code;
            this.error_message = "Sorry, steam servers didn't respond, we couldn't retrive your backpack. Try again later";
        }
    } else if (newBackpack.hasOwnProperty("last_update_date")) {
        this.last_update_date = new Date(newBackpack.last_update_date);
        this.error = true;
        this._error_code = "#database_backpack";
        this.error_message = "Steam servers didn't respond, this is the last known image of your backpack (~timestamp)";
    } else if (newBackpack.hasOwnProperty("status")) {
        if (newBackpack.status !== 1) {
            this.error = true;
            this._error_code = "#backpack_status_" + newBackpack.status;
            this.error_message = "Sorry, but we couldn't retrive your backpack. It seems that your backpack is set to private, you can set it to public in your steam privacy settings.";
        }
    }
};

/**
 * Procedure to check if backpack will change, fired right after a new fetch request
 * @param {Object[]} newItems
 * @returns {boolean}
 * @private
 */
Backpack.prototype._willChange = function (newItems) {
    if (newItems instanceof Array) {
        if (this.items instanceof Array) {
            if (newItems.length !== this.items.length) {
                this.log.debug("Length is different, it will change");
                return true;
            } else {
                for (var p = 0; p < newItems.length; p += 1) {
                    var found = false;
                    for (var i = 0; i < this.items.length; i += 1) {
                        if (this.items[i].getID() === newItems[p].id) {
                            found = true;
                        }
                    }
                    if (!found) {
                        this.log.debug("There's a different item, it will change");
                        return true;
                    }
                }
                return false;
            }
        } else {
            return true;
        }
    } else {
        return false;
    }
};

/**
 * Will instance the new items
 */
Backpack.prototype._createItemsObject = function () {
    if (this.game.getID() === SteamGames.TF2.getID()) {
        for (var i = 0; i < this.items.length; i += 1) {
            this.items[i] = new TF2Item(this.items[i], this.getOwner());
        }
    }
};

Backpack.prototype._manageOnceHasBeenFetchedHandlers = function () {
    for (var i = 0; i < this._onceHasBeenFetchedHandlers.length; i += 1) {
        this._onceHasBeenFetchedHandlers[i]();
    }
    this._onceHasBeenFetchedHandlers = [];
};

/**
 * Establish if current inventory is outdated
 * @returns {Boolean}
 */
Backpack.prototype.isOutdated = function () {
    return new Date() - this.last_update_date > this.decayTime;
};

/**
 * Extend backpack instance decay
 */
Backpack.prototype.renewExpiration = function () {
    this._cancelDecay();
    this._startDecay();
};

/**
 * Cancel instance decay
 */
Backpack.prototype._cancelDecay = function () {
    if (this._decayTimeout) {
        clearTimeout(this._decayTimeout);
    }
};

/**
 * Start instance decay
 */
Backpack.prototype._startDecay = function () {
    var self = this;
    this._decayTimeout = setTimeout(function () {
        self.emit("expired", self.owner);
    }, this.decayTime);
};