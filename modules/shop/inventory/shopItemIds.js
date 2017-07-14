module.exports = ShopItemIDs;

var LogLog = require("log-log");

/**
 * ShopItemIds class
 * @constructor
 * @parameter {Database} db Database instance
 * @returns {ShopItemIDs}
 */
function ShopItemIDs(db) {
    this.db = db;
    /**
     * Lookup list for item ids: game -> item_id -> shop_id
     * @type {Object}
     */
    this.lookupTable = {};
    this.currentID = 0;
    this.log = new LogLog.create({applicationName: "ShopItemIDs", color: "grey", dim: true});
}

/**
 * Make a new id
 * Method will automatically evaluate the given id
 * If given item id is not linked with a shop id it will be stored
 * If given item id has already a shop id associated this will be returned
 * @param {ShopItem} shopItem Shop Item to generate id for
 * @returns {Number} shop id associated
 */
ShopItemIDs.prototype.make = function (shopItem) {
    var unique_id = shopItem.getUniqueItemID();
    var game_code = shopItem.getGameCode();
    this.log.debug("Making id for unique_id: " + unique_id + ", game: " + game_code, 1);

    if (this.exist(unique_id, game_code)) {
        return this.lookup(unique_id, game_code);
    } else {
        this.increase();
        this.link(shopItem);
        return this.currentID;
    }
};

ShopItemIDs.prototype.hasLookup = function (shopItem) {
    return this.exist(shopItem.getUniqueItemID(), shopItem.getGameCode());
};

/**
 * Link current shop id with given item id
 * @param {ShopItem} shopItem
 */
ShopItemIDs.prototype.link = function (shopItem) {
    var unique_id = shopItem.getUniqueItemID();
    var game_code = shopItem.getGameCode();
    this.log.debug("Linking unique_id: " + unique_id + ", game: " + game_code, 1);
    this._linkLocal(unique_id, game_code);
    this._saveLink(unique_id, game_code);
};

/**
 * Unlink give shop item
 * @param {ShopItem} shopItem
 */
ShopItemIDs.prototype.unlink = function (shopItem) {
    var unique_id = shopItem.getUniqueItemID();
    var game_code = shopItem.getGameCode();
    this.log.debug("Unlinking unique_id: " + unique_id + ", game: " + game_code, 1);
    this._unlinkLocal(unique_id, game_code);
    this._saveUnlink(shopItem.getID());
};

/**
 * Get shop id from item id, MUST check before with method ShopItemIDs.exist
 * @param {Number} unique_id
 * @param {Number} game_code
 * @returns {Number} Shop id
 */
ShopItemIDs.prototype.lookup = function (unique_id, game_code) {
    return this.lookupTable[game_code][unique_id];
};

/**
 * Check if item id has already a shop id associated to it
 * @param {Number} unique_id
 * @param {Number} game_code
 * @returns {Boolean}
 */
ShopItemIDs.prototype.exist = function (unique_id, game_code) {
    return this.lookupTable.hasOwnProperty(game_code) && this.lookupTable[game_code].hasOwnProperty(unique_id);
};

/**
 * Increase shop id counter
 */
ShopItemIDs.prototype.increase = function () {
    var self = this;
    this.currentID += 1;
    this.db.connect(function (connection) {
        connection.query(self._getIncreaseIDQuery(), function () {
            connection.release();
        });
    });
};

ShopItemIDs.prototype.updateCurrentID = function () {
    var self = this;
    this.getDatabaseCurrentID(function (id) {
        if (id > self.currentID) {
            self.log.debug("Updated current id from database " + self.currentID + " to " + id);
            self.currentID = id;
        }
    });
};

/**
 * Load id system
 * @param {Function} callback
 */
ShopItemIDs.prototype.load = function (callback) {
    this.log.debug("Loading...");
    var self = this;
    this.loadCurrentID(function () {
        self.loadLookup(callback);
    });
};

/**
 * Load latest ID
 * @param {Function} callback
 */
ShopItemIDs.prototype.loadCurrentID = function (callback) {
    var self = this;
    this.getDatabaseCurrentID(function (id) {
        self.currentID = id;
        self.log.debug("Loaded current id to: " + self.currentID);
        callback();
    });
};

/**
 * Load database lookup
 * @param {Function} callback
 */
ShopItemIDs.prototype.loadLookup = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getLoadLookupQuery(), function (rows) {
            connection.release();
            if (rows instanceof Array && rows.length >= 0) {
                for (var i = 0; i < rows.length; i += 1) {
                    self._linkLocal(rows[i].item_id, rows[i].game, rows[i].shop_id);
                }
                self.log.debug("Loaded lookup table");
                callback();
            } else {
                self.log.error("Load lookup query returned empty");
            }
        });
    })
};

ShopItemIDs.prototype.getDatabaseCurrentID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getLoadCurrentIDQuery(), function (rows, empty) {
            connection.release();
            if (!empty) {
                callback(rows[0].version);
            } else {
                self.log.error("Couldn't load latest id")
            }
        });
    });
};

/**
 * Locally link unique id and game code to current shop id
 * @param {Number} unique_id
 * @param {Number} game_code
 * @param {Number} [shop_id]
 * @private
 */
ShopItemIDs.prototype._linkLocal = function (unique_id, game_code, shop_id) {
    if (!this.lookupTable.hasOwnProperty(game_code)) {
        this.lookupTable[game_code] = {};
    }
    if (!shop_id) {
        shop_id = this.currentID;
    }
    this.lookupTable[game_code][unique_id] = shop_id;
};

/**
 * Database link unique id and game code to current shop id
 * @param unique_id
 * @param game_code
 * @private
 */
ShopItemIDs.prototype._saveLink = function (unique_id, game_code) {
    var self = this;
    var id = this.currentID;
    this.db.connect(function (connection) {
        connection.query(self._getSaveLinkQuery(id, unique_id, game_code), function () {
            connection.release();
        });
    });
};

/**
 * Locally unlink unique id and game code from shop id
 * @param {Number} unique_id
 * @param {Number} game_code
 * @private
 */
ShopItemIDs.prototype._unlinkLocal = function (unique_id, game_code) {
    if (this.exist(unique_id, game_code)) {
        delete this.lookupTable[game_code][unique_id];
    }
};

/**
 * Database link unique id and game code to current shop id
 * @param shop_id
 * @private
 */
ShopItemIDs.prototype._saveUnlink = function (shop_id) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getDeleteLinkQuery(shop_id), function () {
            connection.release();
        });
    });
};

ShopItemIDs.prototype._getLoadLookupQuery = function () {
    return "SELECT shop_id,item_id,game FROM shop_inventory_ids";
};

ShopItemIDs.prototype._getLoadCurrentIDQuery = function () {
    return "SELECT version FROM tasks where `of`='shopInventory_id' LIMIT 1";
};

ShopItemIDs.prototype._getIncreaseIDQuery = function () {
    return "UPDATE tasks SET version=version+1 where `of`='shopInventory_id'";
};

ShopItemIDs.prototype._getSaveLinkQuery = function (id, unique_id, game_code) {
    return "INSERT INTO `shop_inventory_ids` (shop_id,item_id,game) "
        + "VALUES(" + id + "," + unique_id + "," + game_code + ") "
        + "ON DUPLICATE KEY UPDATE item_id=" + unique_id + ", game=" + game_code;
};

ShopItemIDs.prototype._getDeleteLinkQuery = function (shop_id) {
    return "DELETE FROM `shop_inventory_ids` WHERE shop_id=" + shop_id + " LIMIT 1";
};