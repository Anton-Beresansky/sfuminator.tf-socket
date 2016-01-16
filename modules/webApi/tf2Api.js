module.exports = TF2Api;
var events = require("events");
var API = require("../../lib/api.js");
var Logs = require("../../lib/logs.js");

/**
 * @param db
 * @param steam
 * @param backpacktf_key
 * @param options
 * @constructor
 */
function TF2Api(db, steam, backpacktf_key, options) {
    var self = this;
    this.db = db;
    this.log = new Logs("TF2 update");
    this.updateInterval = (options && options.hasOwnProperty("update_interval")) ? options.update_interval : (4 * 60 * 60000); //default 4 hours
    this.debug = (options && options.hasOwnProperty("debug")) ? options.debug : false; //default false  
    this.steam = steam;
    this.bptfApi = new API("backpack.tf");
    this.bptftf_key = backpacktf_key;
    events.EventEmitter.call(this);
    this.on("steam_error", function () {
        self.emit("debug", "Steam api returned error, retrying update in 5 minutes");
        setTimeout(function () {
            self.update();
        }, 5 * 60000); //Retry in 5 minutes
    });
    this.on("debug", function (message) {
        if (self.debug) {
            self.log.debug(message);
        }
    });
    this.loadSchema(function () {
        self.emit("schema_loaded");
    });
}

require("util").inherits(TF2Api, events.EventEmitter);

TF2Api.prototype.loadSchema = function (callback) {
    var self = this;
    this.loadItemSchema(function () {
        self.loadCurrencies(function () {
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};

TF2Api.prototype.loadCurrencies = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query("SELECT * FROM `currency`", function (result) {
            if (result && result.length > 0) {
                var currencies = {};
                for (var i = 0; i < result.length; i += 1) {
                    var row = result[i];
                    currencies[row.currency_type] = {usd: row.usd, metal: row.metal, keys: row.keys, earbuds: row.earbuds};
                }
                self.currencies = currencies;
            }
            callback(self.currencies);
        });
    });
};

TF2Api.prototype.loadItemSchema = function (callback) {
    this.emit("debug", "Loading schema...");
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getSelectFullSchemaQuery(), function (schema) {
            connection.release();
            var finalSchema = {};
            for (var i = 0; i < schema.length; i += 1) {
                var thisItem = schema[i];
                if (finalSchema.hasOwnProperty(thisItem.defindex)) {
                    if (finalSchema[thisItem.defindex].price.hasOwnProperty(thisItem.quality)) {
                        finalSchema[thisItem.defindex].price[thisItem.quality].push(self._getPriceObject_Load(thisItem));
                    } else {
                        finalSchema[thisItem.defindex].price[thisItem.quality] = [self._getPriceObject_Load(thisItem)];
                    }
                } else {
                    finalSchema[thisItem.defindex] = self._getSchemaObject_Load(thisItem);
                    if (typeof thisItem.quality === "number") {
                        finalSchema[thisItem.defindex].price[thisItem.quality] = [self._getPriceObject_Load(thisItem)];
                    }
                }
            }
            self.schema = finalSchema;
            if (typeof callback === "function") {
                callback(finalSchema);
            }
        });
    });
};

TF2Api.prototype._getSchemaObject_Load = function (thisItem) {
    var schemaObject = {};
    for (var property in thisItem) {
        if (
            property !== "quality" &&
            property !== "flag_cannot_craft" &&
            property !== "flag_cannot_trade" &&
            property !== "additional" &&
            property !== "currency"
        )
        {
            schemaObject[property] = thisItem[property];
        }
    }
    schemaObject.price = {};
    return schemaObject;

};

TF2Api.prototype._getPriceObject_Load = function (thisItem) {
    return {
        flag_cannot_craft: (thisItem.flag_cannot_craft) ? true : false,
        flag_cannot_trade: (thisItem.flag_cannot_trade) ? true : false,
        additional: (thisItem.additional === "") ? "normal" : thisItem.additional,
        price: thisItem.price,
        currency: thisItem.currency
    };
};

TF2Api.prototype.startAutoUpdate = function () {
    this.emit("debug", "Starting auto update tf2 procedure");
    var self = this;
    self.update();
    this._autoUpdateInterval = setInterval(function () {
        self.update();
    }, self.updateInterval);
};

TF2Api.prototype.stopAutoUpdate = function () {
    this.emit("debug", "Stopped auto update tf2 procedure");
    if (this._autoUpdateInterval) {
        clearInterval(this._autoUpdateInterval);
    }
};

TF2Api.prototype.update = function (callback) {
    this.emit("debug", "Updating tf2...");
    var self = this;
    this.updateSchema(function () {
        self.emit("debug", "Updated schema");
        self.updatePrices(function () {
            self.emit("debug", "Updated prices");
            self.loadSchema(function () {
                self.emit("debug", "Loaded schema");
                if (typeof callback === "function") {
                    callback();
                }
            });
        });
    });
};

TF2Api.prototype.updatePrices = function (callback) {
    this.emit("debug", "Updating tf2 prices...");
    var self = this;
    this.iGetPrices(function (response) {
        self.emit("debug", "Got backpack.tf prices...");
        if (response.hasOwnProperty("response") && response.response.hasOwnProperty("success") && response.response.success === 1) {
            var result = response.response;
            self.saveItemPrices(result.items, function () {
                self.saveTF2Currency(result, function () {
                    callback();
                });
            });
        } else {
            self.emit("steam_error");
        }
    });
};

TF2Api.prototype.updateSchema = function (callback) {
    this.emit("debug", "Updating tf2 schema...");
    var self = this;
    this.isSchemaUpToDate(function (newVersion) {
        self.emit("debug", "New version is: " + newVersion);
        if (newVersion > 0) {
            self.downloadSchema(newVersion, function () {
                if (typeof callback === "function") {
                    callback();
                }
            });
        } else {
            if (typeof callback === "function") {
                callback();
            }
        }
    });
};

TF2Api.prototype.saveItemPrices = function (items, callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getInsertItemPricesQuery(items), function () {
            connection.release();
            callback();
        });
    });
};

TF2Api.prototype.saveTF2Currency = function (result, callback) {
    this.emit("debug", "Saving tf2 currencies...");
    var self = this;
    var currencies = this._convertCurrencyFormat(result);
    this.db.connect(function (connection) {
        connection.query(self._getInsertCurrencyQuery(currencies), function () {
            connection.release();
            callback();
        });
    });
};

TF2Api.prototype.iGetPrices = function (callback) {
    this.emit("debug", "iGetting backpack.tf prices");
    var self = this;
    var myInterface = {
        name: "api",
        method: {
            name: "IGetPrices",
            version: 4,
            httpmethod: "GET",
            parameters: {
                key: self.bptftf_key,
                compress: 1
            }
        }
    };
    this.bptfApi.callAPI(myInterface, function (result) {
        callback(result);
    });
};

TF2Api.prototype.downloadSchema = function (newVersion, callback) {
    this.emit("debug", "Downloading tf2 schema...");
    var self = this;
    this.steam.getSchema(function (schema) {
        self.emit("debug", "Downloaded new schema");
        if (schema.hasOwnProperty("result") && schema.result.hasOwnProperty("status") && schema.result.status === 1) {
            self.saveSchema(newVersion, schema, function () {
                self.emit("debug", "Saved new schema");
                callback(schema);
            });
        } else {
            self.emit("steam_error");
        }
    });
};

TF2Api.prototype.saveSchema = function (newVersion, schema, callback) {
    this.emit("debug", "Saving schema (" + newVersion + ") ...");
    var self = this;
    var items = schema.result.items;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query(self._getInsertItemsQuery(connection, items), function () {
                connection.query(self._getInsertSchemaVersionQuery(newVersion), function () {
                    connection.commitRelease();
                    callback();
                });
            });
        });
    });
};

TF2Api.prototype.isSchemaUpToDate = function (callback) {
    this.emit("debug", "Checking if tf2 schema is up to date...");
    var self = this;
    this.getLocalSchemaVersion(function (local_version) {
        self.emit("debug", "Local tf2 version is: " + local_version);
        self.steam.upToDateCheck(440, local_version, function (response) {
            if (response.hasOwnProperty("response") && response.response.hasOwnProperty("success") && response.response.success === true) {
                var result = response.response;
                if (result.up_to_date) {
                    callback(0);
                } else {
                    callback(result.required_version);
                }
            } else {
                self.emit("steam_error");
            }
        });
    });
};

TF2Api.prototype.getLocalSchemaVersion = function (callback) {
    this.emit("debug", "Getting local tf2 schema version...");
    this.db.connect(function (connection) {
        connection.query("SELECT `version` FROM `versioning` WHERE id='tf2_schema'", function (version) {
            connection.release();
            if (typeof version !== "undefined" && version[0] && version[0].hasOwnProperty("version")) {
                callback(version[0].version);
            } else {
                callback(0);
            }
        });
    });
};

TF2Api.prototype._convertItemPricesFormat = function (items) {
    var finalItems = {};
    for (var i in items) {
        var additional = "";
        if (i.slice(0, 10) === "Australium") {
            additional = "australium";
        }
        var final_prices = [];
        var prices = items[i].prices;
        for (var quality in prices) {
            for (var tradable in prices[quality]) {
                for (var craftable in prices[quality][tradable]) {
                    if (typeof prices[quality][tradable][craftable][0] === "object") { // This is unusual object OMG NOOB
                        var this_price = prices[quality][tradable][craftable][0];
                        final_prices.push({
                            quality: quality,
                            flag_cannot_craft: !(craftable === "Craftable"),
                            flag_cannot_trade: !(tradable === "Tradable"),
                            price: this_price.value,
                            currency: this_price.currency,
                            additional: additional
                        });
                    } else {
                        for (var unusualParticle in prices[quality][tradable][craftable]) {
                            var this_price = prices[quality][tradable][craftable][unusualParticle];
                            final_prices.push({
                                quality: quality,
                                flag_cannot_craft: !(craftable === "Craftable"),
                                flag_cannot_trade: !(tradable === "Tradable"),
                                price: this_price.value,
                                currency: this_price.currency,
                                additional: unusualParticle
                            });
                        }
                    }
                }
            }
        }
        var defindexes = items[i]["defindex"];
        for (var p = 0; p < defindexes.length; p += 1) {
            if (finalItems.hasOwnProperty(defindexes[p])) {
                for (var c = 0; c < final_prices.length; c += 1) {
                    finalItems[defindexes[p]].push(final_prices[c]);
                }
            } else {
                finalItems[defindexes[p]] = final_prices;
            }
        }

    }
    return finalItems;
};

TF2Api.prototype._getInsertItemPricesQuery = function (_items) {
    var items = this._convertItemPricesFormat(_items);
    var insertConstruction = "INSERT INTO `prices` (`defindex`,`quality`,`flag_cannot_craft`,`flag_cannot_trade`,`price`,`currency`,`additional`) VALUES ";
    var values = "";
    for (var i in items) {
        var prices = items[i];
        var filteredDefindexes = this._filterBackpackTF(i);
        for (var c = 0; c < filteredDefindexes.length; c += 1) {
            var defindex = filteredDefindexes[c];
            for (var p = 0; p < prices.length; p += 1) {
                var price = prices[p];
                values += "(" + defindex + "," + price.quality + ","
                    + price.flag_cannot_craft + "," + price.flag_cannot_trade + ","
                    + price.price + ",'" + price.currency + "',"
                    + "'" + ((price.hasOwnProperty("additional")) ? price.additional : "") + "'), ";
            }
        }
    }
    return insertConstruction + values.slice(0, values.length - 2) + " ON DUPLICATE KEY UPDATE"
        + " `price`=VALUES(`price`),"
        + " `currency`=VALUES(`currency`)";
};

TF2Api.prototype._filterBackpackTF = function (defindex) {
    if (defindex === "116") {
        return ["116", "584"];
    }
    return [defindex];
};

TF2Api.prototype._getInsertCurrencyQuery = function (currencies) {
    var insertConstruction = "INSERT INTO `currency` (`currency_type`,`usd`,`metal`,`keys`,`earbuds`) VALUES ";
    var values = "";
    for (var i in currencies) {
        values += "('" + i + "'," + currencies[i].usd + "," + currencies[i].metal + "," + currencies[i].keys + "," + currencies[i].earbuds + "), ";
    }
    return insertConstruction + values.slice(0, values.length - 2) + " ON DUPLICATE KEY UPDATE"
        + " `usd`=VALUES(`usd`),"
        + " `metal`=VALUES(`metal`),"
        + " `keys`=VALUES(`keys`),"
        + " `earbuds`=VALUES(`earbuds`)";
};

TF2Api.prototype._convertCurrencyFormat = function (result) {
    var metal_price = result.raw_usd_value;
    var key_price = result.items["Mann Co. Supply Crate Key"]["prices"]["6"]["Tradable"]["Craftable"][0]["value"];
    var earbuds_price = result.items["Earbuds"]["prices"]["6"]["Tradable"]["Craftable"][0]["value"];
    return {
        usd: {usd: 1, metal: 1 / metal_price, keys: 1 / (key_price * metal_price), earbuds: 1 / (earbuds_price * key_price * metal_price)},
        metal: {usd: metal_price, metal: 1, keys: 1 / key_price, earbuds: 1 / (earbuds_price * key_price)},
        keys: {usd: key_price * metal_price, metal: key_price, keys: 1, earbuds: 1 / earbuds_price},
        earbuds: {usd: earbuds_price * key_price * metal_price, metal: earbuds_price * key_price, keys: earbuds_price, earbuds: 1}
    };
};

TF2Api.prototype._getInsertItemsQuery = function (connection, items) {
    var insertConstruction = "INSERT INTO `schema` (`name`,`defindex`,`item_class`,`item_type_name`,`item_name`,`proper_name`,`item_slot`,`image_url`,`image_url_large`,`holiday_restriction`,`craft_material_type`,`used_by_classes`) VALUES ";
    var values = "";
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        values += "(" + connection.c.escape(item.name) + ","
            + "" + item.defindex + ",'" + item.item_class + "',"
            + "" + connection.c.escape(item.item_type_name) + "," + connection.c.escape(item.item_name) + ","
            + "" + item.proper_name + ","
            + "'" + ((item.item_slot) ? item.item_slot : "") + "',"
            + "'" + item.image_url + "','" + item.image_url_large + "',"
            + "'" + ((item.holiday_restriction) ? item.holiday_restriction : "") + "',"
            + "'" + ((item.craft_material_type) ? item.craft_material_type : "") + "',"
            + "'" + ((item.used_by_classes) ? item.used_by_classes : "") + "'), ";
    }
    return insertConstruction + values.slice(0, values.length - 2) + " ON DUPLICATE KEY UPDATE"
        + " `name`=VALUES(`name`),"
        + " `item_class`=VALUES(`item_class`),"
        + " `item_type_name`=VALUES(`item_type_name`),"
        + " `item_name`=VALUES(`item_name`),"
        + " `item_slot`=VALUES(`item_slot`),"
        + " `proper_name`=VALUES(`proper_name`),"
        + " `image_url`=VALUES(`image_url`),"
        + " `image_url_large`=VALUES(`image_url_large`),"
        + " `holiday_restriction`=VALUES(`holiday_restriction`),"
        + " `craft_material_type`=VALUES(`craft_material_type`),"
        + " `used_by_classes`=VALUES(`used_by_classes`)";
};

TF2Api.prototype._getInsertSchemaVersionQuery = function (newVersion) {
    return "INSERT INTO `versioning` (`id`, `version`) VALUES('tf2_schema', " + newVersion + ") ON DUPLICATE KEY UPDATE version=" + newVersion;
};

TF2Api.prototype._getSelectFullSchemaQuery = function () {
    return "SELECT `schema`.`name`,`schema`.`defindex`, `schema`.`item_class`, `schema`.`item_type_name`, `schema`.`item_name`, `schema`.`proper_name`, `schema`.`item_slot`, `schema`.`image_url`, `schema`.`image_url_large`, `schema`.`holiday_restriction`, `schema`.`craft_material_type`, `schema`.`used_by_classes`, `prices`.`quality`, `prices`.`flag_cannot_craft`, `prices`.`flag_cannot_trade`, `prices`.`additional`, `prices`.`price`, `prices`.`currency` from `schema` LEFT JOIN `prices` ON `schema`.`defindex`=`prices`.`defindex`";
};