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

/**
 * @param db
 * @param steam
 * @param tf2
 * @param options
 * @constructor
 */
function BackpacksApi(db, steam, tf2, options) {
    var self = this;
    this.db = db;
    this.steam = steam;
    this.tf2 = tf2;
    this.debug = ((options && options.hasOwnProperty("debug")) ? options.debug : false);
    events.EventEmitter.call(this);
}

require("util").inherits(BackpacksApi, events.EventEmitter);

BackpacksApi.prototype.get = function (owner, callback, options) {
    this.emit("debug", "Getting backpack " + owner);
    var self = this;
    this.db.connect(function (connection) {
        connection.query("SELECT `last_update_date` FROM `backpacks` WHERE `owner`='" + owner + "'", function (result) {
            connection.release();
            if (result[0] && result[0].hasOwnProperty("last_update_date")) { //Backpack is stored in database
                var lastUpdateSecondsAgo = (new Date() - result[0].last_update_date) / 1000;
                if (lastUpdateSecondsAgo < 2) {
                    self.read(owner, callback, options);
                } else {
                    self.fetch(owner, callback, options);
                }
            } else {
                self.fetch(owner, callback, options);
            }
        });
    });
};

BackpacksApi.prototype.fetch = function (steamid, callback, options) {
    this.emit("debug", "Fetching backpack...");
    var self = this;
    this.steam.getPlayerItems(steamid, function (response) {
        if (response.hasOwnProperty("result") && response.result.hasOwnProperty("status")) {
            var backpack = response.result;
            callback(self.mergeWithSchema(backpack));
            self.storeBackpack(steamid, backpack);
            backpack = null;
        } else {
            callback({result: "error", message: "Couldn't fetch backpack", code: "#steam_api_down"});
        }
    });
};

BackpacksApi.prototype.read = function (owner, callback, options) {
    this.emit("debug", "Reading backpack...");
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query("SELECT `status`,`num_backpack_slots`,`last_update_date` as `last_update_date` FROM backpacks WHERE `owner`='" + owner + "' LIMIT 1", function (backpack_array) {
                if (typeof backpack_array === "object" && backpack_array.length === 1) {
                    var backpack = backpack_array[0];
                    self.readItems(owner, backpack.last_update_date, function (items) {
                        if (items.hasOwnProperty("result") && items.result === "error") {
                            connection.rollbackRelease();
                            callback({result: "error", message: "Wasn't able to read backpack items", code: "#reading_items"});
                        } else {
                            backpack.last_update_time = parseInt(backpack.last_update_date.getTime() / 1000);
                            backpack.items = items;
                            connection.commitRelease();
                            callback(self.mergeWithSchema(backpack));
                        }
                    }, connection, options);
                } else {
                    connection.rollbackRelease();
                    callback({result: "error", message: "No backpack on database for specified owner", code: "#no_database_backpack"});
                }
            });
        });
    });
};

BackpacksApi.prototype.readItems = function (owner, date, callback, connection, options) {
    var mode = "full";
    if (options && options.hasOwnProperty("mode")) {
        mode = options.mode;
    }
    switch (mode) {
        case "full":
            this._getFullItems(owner, date, function (items) {
                callback(items);
            }, connection);
            break;
        case "simple":
            this._getSimpleItems(owner, date, function (items) {
                callback(items);
            }, connection);
            break;
        case "noob":
            var self = this;
            var mysql_formatted_date = _dateJStoMysql(date);
            connection.query("SELECT `id`,`original_id`,`defindex`,`level`,`quantity`,`origin`,`flag_cannot_trade`,`flag_cannot_craft`,`quality` FROM `items` WHERE `owner`='" + owner + "' AND `last_update_date`='" + mysql_formatted_date + "'", function (items) {
                var row_pointer = 0;
                var nextRow = function () {
                    self.getItemAttributes(items[row_pointer].id, function (attributes) {
                        items[row_pointer].attributes = attributes;
                        row_pointer += 1;
                        if (row_pointer < items.length) {
                            nextRow();
                        } else {
                            callback(items);
                        }
                    }, connection);
                };
                if (typeof items === "object" && items.length > 0) {
                    nextRow();
                } else {
                    callback(items);
                }
            });
            break;
        default:
            callback({result: "error", message: "Unknown item mode selection", code: "#wrong_mode_item_selection"});
    }
};

BackpacksApi.prototype.getItemAttributes = function (id, callback, connection) {
    var query = function (connection, destroy) {
        connection.query("SELECT `defindex`,`value`,`float_value`,`steamid` FROM `attributes` WHERE id=" + id, function (attributes) {
            if (destroy) {
                connection.release();
            }
            callback(attributes);
        });
    };
    if (connection) {
        query(connection);
    } else {
        this.db.connect(function (connection) {
            query(connection, true);
        });
    }
};

BackpacksApi.prototype.storeBackpack = function (owner, backpack) {
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query("SELECT @now := NOW()", function () {
                connection.query(self._getInsertIntoBackpacksQuery(owner, backpack), function () {
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
                });
            });
        });
    });
};

BackpacksApi.prototype._getSimpleItems = function (owner, date, callback, connection) {
    var mysql_formatted_date = _dateJStoMysql(date);
    connection.query("SELECT `id`,`original_id`,`defindex`,`level`,`quantity`,`origin`,`flag_cannot_trade`,`flag_cannot_craft`,`quality` FROM `items` WHERE `owner`='" + owner + "' AND `last_update_date`='" + mysql_formatted_date + "'", function (items) {
        callback(items);
    });
};
BackpacksApi.prototype._getFullItems = function (owner, date, callback, connection) {
    var self = this;
    var mysql_formatted_date = _dateJStoMysql(date);
    connection.query("SELECT items.`id`,items.`original_id`,items.`defindex`,items.`level`,items.`quantity`,items.`origin`,items.`flag_cannot_trade`,items.`flag_cannot_craft`,items.`quality`,attributes.`defindex` as `attr_defindex`,attributes.`value`,attributes.`float_value`,attributes.`steamid` FROM `items` LEFT JOIN `attributes` ON items.`id`=attributes.`id` WHERE items.`owner`='" + owner + "' AND items.`last_update_date`='" + mysql_formatted_date + "'", function (dbItems) {
        var items = [];
        for (var i = 0; i < dbItems.length; i += 1) {
            var itemIndex = self._getItemIndex(dbItems[i].id, items);
            var thisAttribute = null;
            if (dbItems[i].attr_defindex) {
                thisAttribute = {defindex: dbItems[i].attr_defindex, value: dbItems[i].value};
                if (dbItems[i].float_value) {
                    thisAttribute.float_value = dbItems[i].float_value;
                }
                if (dbItems[i].steamid) {
                    thisAttribute.steamid = dbItems[i].steamid;
                }
            }
            if (itemIndex >= 0 && dbItems[i].attr_defindex) {
                if (items[itemIndex].hasOwnProperty("attributes")) {
                    items[itemIndex].attributes.push(thisAttribute);
                } else {
                    items[itemIndex].attributes = [thisAttribute];
                }
            } else {
                items.push(self._compressItem(dbItems[i], thisAttribute));
            }
        }
        callback(items);
    });
};
BackpacksApi.prototype._compressItem = function (item, attribute) {
    var cmxItem = {
        id: item.id,
        original_id: item.original_id,
        defindex: item.defindex,
        level: item.level,
        quantity: item.quantity,
        quality: item.quality
    };
    var optionalValues = ["origin", "flag_cannot_trade", "flag_cannot_craft"];
    for (var i = 0; i < optionalValues.length; i += 1) {
        var property = optionalValues[i];
        if (item[property]) {
            cmxItem[property] = item[property];
        }
    }
    if (attribute) {
        cmxItem.attributes = [attribute];
    }
    return cmxItem;
};
BackpacksApi.prototype._getItemIndex = function (id, list) {
    for (var i = 0; i < list.length; i += 1) {
        if (list[i].id === id) {
            return i;
        }
    }
    return -1;
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
    if (backpack.hasOwnProperty("items")) {
        var items = backpack.items;
        var schema = this.tf2.schema;
        for (var i = 0; i < items.length; i += 1) {
            var schemaItem = schema[items[i].defindex];
            if(schemaItem) {
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
        if (right_price) {
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