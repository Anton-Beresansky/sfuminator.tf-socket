//> get: (owner, callback, options)
//- owner: steamid
//- callback: steam backpack object + last_update_date property
//if read from database. If error will return {result: "error", message, code}
//- options: {mode: full(default)/simple(-attributes)}
//
//Will fetch backpack from steam, but checks if backpack has been already
//fetched within 2 seconds, if so, will return the backpack read from the
//database.
//
//  error codes:
//      - #steam_api_down
//      - #no_database_backpack


//> fetch: (owner, callback)
//Same as get
//Will fetch backpack from steam.
//
// error codes:
//      - #steam_api_down


//> read: (owner, callback, options)
//Same as get
//Will read backpack from database
//
// error codes:
//      - #no_database_backpack
//      - #wrong_item_selection <- should never occur
//      - #reading_items <- should never occur

module.exports = BackpacksApi;
var events = require("events");
var ItemsDatabase = require('./itemsDatabase.js');
var Loglog = require('log-log');

/**
 * @param db {Database}
 * @param steam {SteamAPI}
 * @param tf2 {TF2Api}
 * @param options
 * @constructor
 */
function BackpacksApi(db, steam, tf2, options) {
    this.db = db;
    this.steam = steam;
    this.tf2 = tf2;
    this.itemsDatabase = new ItemsDatabase(db);
    this.log = Loglog.create({applicationName: "BackpacksApi", color: 'magenta'});
    this.log.disableDebug();
    events.EventEmitter.call(this);
}

require("util").inherits(BackpacksApi, events.EventEmitter);

BackpacksApi.FETCH_ANTI_SPAM_INTERVAL = ***REMOVED***;

/**
 * @param currentBackpack {Backpack}
 * @param callback {[function]}
 * @param options {[object]}
 */
BackpacksApi.prototype.get = function (currentBackpack, callback, options) {
    var owner = currentBackpack.getOwner();
    this.log.debug("Getting backpack " + owner);
    var self = this;
    this.db.connect(function (connection) {
        connection.query("SELECT `last_update_date` FROM `backpacks` WHERE `owner`='" + owner + "'", function (result) {
            connection.release();
            if (result[0] && result[0].hasOwnProperty("last_update_date")) { //Backpack is stored in database
                if (self.fetchAntiSpam(result[0].last_update_date)) {
                    self.fetch(currentBackpack, callback, options);
                } else {
                    self.log.debug("Preventing fetch spam. Backpack stored is less than " + BackpacksApi.FETCH_ANTI_SPAM_INTERVAL + "ms old.");
                    callback(new Error("anti_spam"));
                }
            } else {
                self.fetch(currentBackpack, callback, options);
            }
        });
    });
};

BackpacksApi.prototype.fetchAntiSpam = function (databaseLastStoredImage) {
    return (new Date() - databaseLastStoredImage) > BackpacksApi.FETCH_ANTI_SPAM_INTERVAL;
};

BackpacksApi.prototype.read = function (owner, callback, options) {
    this.emit("debug", "Reading backpack...");
    var self = this;
    this.itemsDatabase.readInventory(owner, function (err, backpack) {
        callback(err, self.mergeWithSchema(backpack));
    }, options);
};

/**
 * @param currentBackpack {Backpack}
 * @param callback
 * @param options
 */
BackpacksApi.prototype.fetch = function (currentBackpack, callback, options) {
    var steamid = currentBackpack.getOwner();
    this.log.debug(steamid + ": Fetching backpack...");
    var self = this;
    this.steam.getPlayerItems(steamid, function (response) {
        if (response.hasOwnProperty("result") && response.result.hasOwnProperty("status")) {
            var backpack = response.result;
            var itemsStoringNeeded = backpack.hasOwnProperty("items") && currentBackpack.willChange(backpack.items);
            callback(null, self.mergeWithSchema(backpack));
            self.itemsDatabase.saveBackpackStatus(steamid, backpack, function () {
                if (itemsStoringNeeded) {
                    self.storeBackpack(steamid, backpack);
                    self.itemsDatabase.saveInventory(steamid, backpack);
                } else {
                    self.log.debug("Skipping backpack store, no changes occurred");
                }
            });
        } else {
            callback(new Error("steam_api_down"), {
                result: "error",
                message: "Couldn't fetch backpack",
                code: "#steam_api_down"
            });
        }
    });
};

BackpacksApi.prototype.storeBackpack = function (owner, backpack) {
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query("SELECT @now := NOW()", function () {
                //  connection.query(self._getInsertIntoBackpacksQuery(owner, backpack), function () {
                if (backpack.hasOwnProperty("items") && backpack.items.length > 0) {
                    connection.query(self._getInsertIntoItemsQuery(owner, backpack.items), function () {
                        var attributes_query = self._getInsertIntoAttributesQuery(connection, backpack.items);
                        if (attributes_query) {
                            connection.query(attributes_query, function () {
                                connection.commitRelease();
                                backpack = null;
                                connection = null;
                            });
                        } else {
                            connection.commitRelease();
                            backpack = null;
                            connection = null;
                        }
                    });
                } else {
                    connection.commitRelease();
                    backpack = null;
                    connection = null;
                }
                //  });
            });
        });
    });
};

BackpacksApi.prototype._getInsertIntoBackpacksQuery = function (owner, backpack) {
    return "INSERT INTO `backpacks`"
        + " (`owner`, `status`, `num_backpack_slots`, `last_update_date`)"
        + " VALUES ('" + owner + "'," + backpack.status + ","
        + (backpack.hasOwnProperty("num_backpack_slots") ? backpack.num_backpack_slots : null) + "," + "@now)"
        + " ON DUPLICATE KEY UPDATE "
        + " `status`=" + backpack.status
        + ",`num_backpack_slots`=" + (backpack.hasOwnProperty("num_backpack_slots") ? backpack.num_backpack_slots : null)
        + ",`last_update_date`=@now";
};

BackpacksApi.prototype._getInsertIntoItemsQuery = function (owner, items) {
    var insertConstruction = "INSERT INTO `items` (`owner`,`id`,`original_id`,`defindex`,`level`,`quantity`,`origin`,`flag_cannot_trade`,`flag_cannot_craft`,`quality`,`last_update_date`) VALUES ";
    var values = "";
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        values += "('" + owner + "'," + item.id + ","
            + item.original_id + "," + item.defindex + "," + item.level + "," + item.quantity + ","
            + (item.hasOwnProperty("origin") ? item.origin : null) + ","
            + (item.hasOwnProperty("flag_cannot_trade") ? item.flag_cannot_trade : null) + ","
            + (item.hasOwnProperty("flag_cannot_craft") ? item.flag_cannot_craft : null) + ","
            + item.quality + ","
            + "@now), ";
    }
    return insertConstruction + values.slice(0, values.length - 2) + " ON DUPLICATE KEY UPDATE"
        + " `last_update_date`=@now";
};

BackpacksApi.prototype._getInsertIntoAttributesQuery = function (connection, items) {
    var insertConstruction = "INSERT IGNORE INTO `attributes` (`id`,`defindex`,`value`,`float_value`,`steamid`) VALUES";
    var values = "";
    for (var i = 0; i < items.length; i += 1) {
        if (items[i].hasOwnProperty("attributes")) {
            for (var p = 0; p < items[i].attributes.length; p += 1) {
                var attribute = items[i].attributes[p];
                values += "(" + items[i].id + "," + attribute.defindex + ","
                    + "" + connection.c.escape(attribute.value) + ","
                    + (attribute.hasOwnProperty("float_value") ? attribute.float_value : null) + ","
                    + (attribute.hasOwnProperty("account_info") ? attribute.account_info.steamid : null) + "), ";
            }
        }
    }
    if (values !== "") {
        return insertConstruction + values.slice(0, values.length - 2);
    } else {
        return null;
    }
};

function _dateJStoMysql(dbDate) {
    return dbDate.getFullYear() + "-"
        + ("0" + (dbDate.getMonth() + 1)).slice(-2) + "-"
        + ("0" + (dbDate.getDate())).slice(-2) + " "
        + ("0" + dbDate.getHours()).slice(-2) + ":"
        + ("0" + dbDate.getMinutes()).slice(-2) + ":"
        + ("0" + dbDate.getSeconds()).slice(-2);
}

BackpacksApi.prototype.mergeWithSchema = function (backpack) {
    if (backpack && backpack.hasOwnProperty("items")) {
        var items = backpack.items;
        var schema = this.tf2.schema;
        for (var i = 0; i < items.length; i += 1) {
            var schemaItem = schema[items[i].defindex];
            if (schemaItem) {
                items[i] = this.mergeItemWithSchemaItem(items[i], schemaItem);
            } else {
                items.splice(i, 1);
                i -= 1;
            }

        }
    }
    return backpack;
};

BackpacksApi.prototype.mergeItemWithSchemaItem = function (item, schemaItem) {
    for (var schemaAttr in schemaItem) {
        if (schemaAttr !== "price" && (schemaItem[schemaAttr])) {
            item[schemaAttr] = schemaItem[schemaAttr];
        }
    }

    var prices = schemaItem.price[item.quality];
    var additional = "normal";
    if (item.quality === 5 && this._itemHasAttribute(134, item)) {
        var attribute = this._getItemAttribute(134, item);
        additional = attribute.float_value;
    } else if (item.quality === 11 && this._itemHasAttribute(2027, item)) {
        additional = "australium";
    } else if (this._itemHasAttribute(187, item)) {
        var attribute = this._getItemAttribute(187, item);
        additional = attribute.float_value;
    }
    if (item.quality === 15) {
        item.decorated_grade = this.tf2.decoratedRarities[item.name];
    }
    var right_price = null;
    if (prices && prices.length > 0) {
        for (var i = 0; i < prices.length; i += 1) {
            var thisPrice = prices[i];
            if (
                (thisPrice.flag_cannot_craft === (item.hasOwnProperty("flag_cannot_craft") ? item.flag_cannot_craft : false)) &&
                (thisPrice.flag_cannot_trade === (item.hasOwnProperty("flag_cannot_trade") ? item.flag_cannot_trade : false)) &&
                (thisPrice.additional.toString() === additional.toString())
            ) {
                right_price = {price: thisPrice.price, currency: thisPrice.currency};
                break;
            }
        }
        if (right_price && right_price.price) {
            item.relative_price = right_price.price;
            item.currency = right_price.currency;
            item.absolute_price = this.tf2.currencies[item.currency]["usd"] * item.relative_price;
        } else {
            item.relative_price = null;
            item.currency = null;
            item.absolute_price = null;
        }
    } else {
        item.relative_price = null;
        item.currency = null;
        item.absolute_price = null;
    }
    return item;
};

BackpacksApi.prototype._itemHasAttribute = function (defindex, item) {
    if (this._getItemAttribute(defindex, item)) {
        return true;
    }
    return false;
};

BackpacksApi.prototype._getItemAttribute = function (defindex, item) {
    if (item.hasOwnProperty("attributes")) {
        var attributes = item.attributes;
        for (var i = 0; i < attributes.length; i += 1) {
            if (attributes[i].defindex === defindex) {
                return attributes[i];
            }
        }
    }
    return false;
};