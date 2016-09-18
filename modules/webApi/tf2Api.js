module.exports = TF2Api;

var events = require("events");
var API = require("../../lib/api.js");
var VDF = require("vdf");
var FS = require("fs");
var Logs = require("../../lib/logs.js");
var request = require("request");
var cheerio = require("cheerio");

/**
 * @param webApi {WebApi}
 * @param backpacktf_key
 * @param options
 * @constructor
 */
function TF2Api(webApi, backpacktf_key, options) {
    var self = this;
    this.webApi = webApi;
    this.db = webApi.db_items;
    this.steam = webApi.steamApi;
    this.bptftf_key = backpacktf_key;

    this.fetchingItemsGame = false;
    this.updateInterval = (options && options.hasOwnProperty("update_interval")) ? options.update_interval : (4 * 60 * 60000); //default 4 hours
    this.log = new Logs({applicationName: "TF2 Api"});
    this.debug = (options && options.hasOwnProperty("debug")) ? options.debug : false; //default false
    this.bptfApi = new API("backpack.tf");
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

TF2Api.BPTF_DECAY_TIME = 5 * 60; //5 minutes (seconds)

TF2Api.prototype.loadSchema = function (callback) {
    var self = this;
    this.loadItemSchema(function () {
        self.loadCurrencies(function () {
            self.readItemsGame(function () {
                if (typeof callback === "function") {
                    callback();
                }
            });
        });
    });
};

TF2Api.prototype.loadCurrencies = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query("SELECT * FROM `currency`", function (result) {
            connection.release();
            if (result && result.length > 0) {
                var currencies = {};
                for (var i = 0; i < result.length; i += 1) {
                    var row = result[i];
                    currencies[row.currency_type] = {
                        usd: row.usd,
                        metal: row.metal,
                        hat: row.hat,
                        keys: row.keys,
                        earbuds: row.earbuds
                    };
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
                if (thisItem.image_url[0] === "[") {
                    finalSchema[thisItem.defindex].image_url = JSON.parse(thisItem.image_url);
                    finalSchema[thisItem.defindex].image_url_large = JSON.parse(thisItem.image_url_large);
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
        ) {
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
    this.arePricesOutdated(function (outdated) {
        if (outdated) {
            self.log.debug("Prices are outdated");

            self.emit("debug", "Getting backpack.tf currencies...");
            self.iGetCurrencies(function (response) {
                if (response.hasOwnProperty("response") && response.response.hasOwnProperty("success") && response.response.success === 1) {
                    response = self._injectActualKeyPriceToBackpackTFResponse(response);
                    self.saveTF2Currency(response.response.currencies, function () {
                        self.iGetPrices(function (response) {
                            self.emit("debug", "Got backpack.tf prices...");
                            if (response.hasOwnProperty("response") && response.response.hasOwnProperty("success") && response.response.success === 1) {
                                //To avoid price discordance due to actual key price
                                response.response.items = self._convertBackpackTFPricesToMetal(response.response.items);
                                self.saveItemPrices(response.response.items, function () {
                                    callback();
                                });
                            }
                        });
                    });
                }
            });

        } else {
            self.log.debug("Prices are already up to date");
            callback();
        }
    });
};

TF2Api.prototype.arePricesOutdated = function (callback) {
    this.db.connect(function (connection) {
        connection.query("SELECT version FROM versioning WHERE id='bptf'", function (result, empty) {
            connection.release();
            var outdated = true;
            if (!empty) {
                if (result[0].version + TF2Api.BPTF_DECAY_TIME > parseInt(new Date().getTime() / 1000)) {
                    outdated = false;
                }
            }
            callback(outdated);
        })
    })
};

TF2Api.prototype.updateSchema = function (callback) {
    this.emit("debug", "Updating tf2 schema...");
    var self = this;
    this.isSchemaUpToDate(function (newVersion) {
        self.emit("debug", "New version is: " + newVersion);
        if (newVersion > 0) {
            self.downloadSchema(newVersion, function () {
                self.fetchItemsGame(function () {
                    if (typeof callback === "function") {
                        callback();
                    }
                });
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
            connection.query(self._getBpTfVersioningUpdateQuery(), function () {
                connection.release();
                callback();
            });
        });
    });
};

TF2Api.prototype.saveTF2Currency = function (result, callback) {
    this.emit("debug", "Saving tf2 currencies...");
    var self = this;
    var currencies = this._convertCurrencyFormat(result);
    console.log(currencies);
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

TF2Api.prototype.iGetCurrencies = function (callback) {
    var self = this;
    var myInterface = {
        name: "api",
        method: {
            name: "IGetCurrencies",
            version: 1,
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

TF2Api.prototype.stiScemiDiBackpackTF = function (callback) {
    var swapApi = new API("www.tf2swap.com");
    var myInterface = {
        name: "cdn",
        method: {
            httpmethod: "GET",
            predata: "prices.json"
        }
    };
    swapApi.callAPI(myInterface, function (result) {
        callback(result);
    });
};

TF2Api.prototype.downloadSchema = function (newVersion, callback) {
    this.emit("debug", "Downloading tf2 schema...");
    var self = this;
    this.steam.getSchema(function (schema) {
        self.emit("debug", "Downloaded new schema");
        if (schema.hasOwnProperty("result") && schema.result.hasOwnProperty("status") && schema.result.status === 1) {
            self._injectMarketData(schema, function (modifiedSchema) {
                self.saveSchema(newVersion, modifiedSchema, function () {
                    self.emit("debug", "Saved new schema");
                    callback(modifiedSchema);
                });
            });
        } else {
            self.emit("steam_error");
        }
    });
};

TF2Api.ITEMS_GAME_PATH = "./items_game.txt";
TF2Api.FETCH_ITEMS_GAME_TIMEOUT = 5000 * 20;
TF2Api.prototype.fetchItemsGame = function (callback) {
    var self = this;
    if (!this.fetchingItemsGame) {
        setTimeout(function () {
            if (self.fetchingItemsGame) {
                self.fetchingItemsGame = false;
                callback();
            }
        }, TF2Api.FETCH_ITEMS_GAME_TIMEOUT);
    }
    this.fetchingItemsGame = true;
    var request = require("request");
    request('http://git.optf2.com/schema-tracking/plain/Team%20Fortress%202%20Client%20Schema?h=teamfortress2', function (error, response, body) {
        if (!error && response.statusCode === 200) {
            self.fetchingItemsGame = false;
            self.items_game = VDF.parse(body).items_game;
            self._parseDecoratedRarities();
            FS.writeFile(TF2Api.ITEMS_GAME_PATH, JSON.stringify(self.items_game), callback);
        } else {
            self.log.error("Something went wrong fetching the defindex page (actually their fault)");
            if (self.fetchingItemsGame) {
                self.fetchItemsGame(callback);
            }
        }
    });
};

TF2Api.prototype.readItemsGame = function (callback) {
    var self = this;
    FS.exists(TF2Api.ITEMS_GAME_PATH, function (exist) {
        if (exist) {
            self.log.debug("Loading local items_game...");
            FS.readFile(TF2Api.ITEMS_GAME_PATH, function (err, file) {
                self.items_game = JSON.parse(file);
                self._parseDecoratedRarities();
                callback();
            });
        } else {
            self.log.debug("Local items_game not present, will fetch and save");
            self.fetchItemsGame(function () {
                callback();
            });
        }
    });
};

TF2Api.prototype._parseDecoratedRarities = function () {
    var decoratedRarities = {};
    var item_collections = this.items_game.item_collections;
    for (var collection in item_collections) {
        for (var rarity in item_collections[collection].items) {
            for (var item_name in item_collections[collection].items[rarity]) {
                decoratedRarities[item_name] = rarity;
            }
        }
    }
    this.decoratedRarities = decoratedRarities;
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

TF2Api.prototype._injectMarketData = function (schema, callback) {
    var self = this;
    var items = schema.result.items;
    this._injectMarketNames(items, function (injectedItems1) {
        self._injectMarketImages(injectedItems1, function (injectedItems2) {
            schema.result.items = injectedItems2;
            callback(schema);
        });
    });
};

TF2Api.prototype._injectMarketNames = function (items, callback) {
    this._fetchNameLookup(function (nameLookup) {
        for (var i = 0; i < items.length; i += 1) {
            if (nameLookup.hasOwnProperty(items[i].name)) {
                items[i].item_name = nameLookup[items[i].name];
                if (items[i].item_name.slice(-items[i].item_type_name.length) !== items[i].item_type_name) {
                    items[i].item_name += " " + items[i].item_type_name;
                }
            }
        }
        callback(items);
    });
};

TF2Api.prototype._fetchNameLookup = function (callback) {
    var self = this;
    var request = require("request");
    request('https://wiki.teamfortress.com/w/images/c/cf/Tf_english.txt', function (error, response, body) {
        if (!error && response.statusCode === 200) {
            var result = VDF.parse(body);
            for (var i in result) {
                var lookupTable = result[i].Tokens;
                break;
            }
            callback(lookupTable);
        } else {
            self.log.error("Something went wrong fetching the defindex page (actually their fault)");
            callback(null);
        }
    });
};

TF2Api.prototype._injectMarketImages = function (items, callback) {
    var self = this;
    var i = -1;
    var nextItem = function () {
        i += 1;
        if (i < items.length) {
            if ((items[i].hasOwnProperty("tool") && items[i].tool.type == "paint_can" && items[i].item_name !== "Paint Can")
                || items[i].item_quality == 15
            ) {
                self._getMarketImageInjectedItem(items[i], function (item) {
                    items[i] = item;
                    nextItem();
                });
            } else {
                nextItem();
            }
        } else {
            callback(items);
        }
    };
    nextItem();
};

TF2Api.prototype._getMarketImageInjectedItem = function (item, callback) {
    var self = this;
    this._hasItemMarketImage(item.defindex, function (dbUrl, dbUrlLarge) {
        if (dbUrl) {
            item.image_url = dbUrl;
            item.image_url_large = dbUrlLarge;
            callback(item);
        } else {
            self.log.debug("URL for item: " + item.item_name + " not saved, updating...");
            self._fetchMarketItemImageURL(item, function (url) {
                item.image_url = url;
                item.image_url_large = url;
                callback(item);
            });
        }
    });
};

TF2Api.prototype._hasItemMarketImage = function (defindex, callback) {
    this.db.connect(function (connection) {
        connection.query("SELECT `image_url`,`image_url_large` FROM `schema` WHERE defindex=" + defindex, function (result, isEmpty) {
            connection.release();
            if (!isEmpty) {
                if (result[0].image_url[0] === "[" && result[0].image_url_large[0] === "["
                    && result[0].image_url[1] !== "]" && result[0].image_url_large[1] !== "]") {
                    callback(result[0].image_url, result[0].image_url_large);
                } else {
                    callback(false);
                }
            } else {
                callback(false);
            }
        });
    });
};

TF2Api.DECORATED_WEARING = [
    "Factory New",
    "Minimal Wear",
    "Field-Tested",
    "Well-Worn",
    "Battle Scarred"
];

TF2Api.prototype._fetchMarketItemImageURL = function (schemaItem, callback) {
    var self = this;
    var names = [], images = [];

    if (schemaItem.hasOwnProperty("tool") && schemaItem.tool.type == "paint_can" && schemaItem.item_name !== "Paint Can") {
        names.push(schemaItem.item_name);
    } else if (schemaItem.item_quality == 15) {
        for (var i = 0; i < TF2Api.DECORATED_WEARING.length; i += 1) {
            names.push(schemaItem.item_name + " (" + TF2Api.DECORATED_WEARING[i] + ")");
        }
    }

    var fetchImages = function (names) {
        var i = -1;
        var fetch = function (name, callback) {
            request('http://steamcommunity.com/market/listings/440/' + encodeURIComponent(name.trim()), function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    try {
                        var $ = cheerio.load(body);
                        callback($(".market_listing_largeimage > img").attr("src").slice(0, -10));
                    } catch (e) {
                        self.log.error("Something went wrong fetching the item page (" + name + ") " + schemaItem.defindex);
                        console.log(e);
                        callback("");
                    }
                } else {
                    self.log.error("Something went wrong fetching the item page (actually steam fault) (" + name + ") " + schemaItem.defindex);
                    self.log.debug("Steam si angry we shall finish here...");
                    callback("steam_angry");
                }
            });
        };
        var next = function () {
            i += 1;
            if (i < names.length) {
                fetch(names[i], function (url) {
                    if (url === "steam_angry") {
                        i = names.length;
                        callback("[]");
                    } else {
                        images.push(url);
                        setTimeout(function () {
                            next();
                        }, 15000);
                    }
                });
            } else {
                callback(JSON.stringify(images))
            }
        };
        next();
    };
    fetchImages(names);
};

TF2Api.prototype._injectActualKeyPriceToBackpackTFResponse = function (response) {
    this.backpackTFKeyPrice = response.response.currencies.keys.price.value;
    response.response.currencies.keys.price.value = this.webApi.keyPricer.getMarketPrice().toMetal();  //Inject actual key price
    return response;
};

TF2Api.prototype._convertBackpackTFPricesToMetal = function (items) {
    //Remember to apply our key price first
    items["Mann Co. Supply Crate Key"].prices["6"].Tradable.Craftable[0].value = this.webApi.keyPricer.getMarketPrice().toMetal();
    //Go on
    for (var i in items) {
        var prices = items[i].prices;
        for (var quality in prices) {
            for (var tradable in prices[quality]) {
                for (var craftable in prices[quality][tradable]) {
                    if (typeof prices[quality][tradable][craftable][0] === "object") { // This is unusual object OMG NOOB
                        var this_price = prices[quality][tradable][craftable][0];
                        if (this_price.currency === "keys") {
                            prices[quality][tradable][craftable][0].currency = "metal";
                            prices[quality][tradable][craftable][0].value = prices[quality][tradable][craftable][0].value * this.backpackTFKeyPrice;
                        }
                    } else {
                        for (var unusualParticle in prices[quality][tradable][craftable]) {
                            var this_price = prices[quality][tradable][craftable][unusualParticle];
                            if (this_price.currency === "keys") {
                                prices[quality][tradable][craftable][unusualParticle].currency = "metal";
                                prices[quality][tradable][craftable][unusualParticle].value = prices[quality][tradable][craftable][unusualParticle].value * this.backpackTFKeyPrice;
                            }
                        }
                    }
                }
            }
        }
    }
    return items;
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
        if (defindexes && defindexes.length > 0) {
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
    var insertConstruction = "INSERT INTO `currency` (`currency_type`,`usd`,`metal`,`keys`,`hat`,`earbuds`) VALUES ";
    var values = "";
    for (var i in currencies) {
        values += "('" + i + "',"
            + currencies[i].usd + ","
            + currencies[i].metal + ","
            + currencies[i].keys + ","
            + currencies[i].hat + ","
            + currencies[i].earbuds + "), ";
    }
    return insertConstruction + values.slice(0, values.length - 2) + " ON DUPLICATE KEY UPDATE"
        + " `usd`=VALUES(`usd`),"
        + " `metal`=VALUES(`metal`),"
        + " `keys`=VALUES(`keys`),"
        + " `hat`=VALUES(`hat`),"
        + " `earbuds`=VALUES(`earbuds`)";
};

TF2Api.prototype._convertCurrencyFormat = function (result) {
    var metal_usd_price = result.metal.price.value;
    var hat_usd_price = result.hat.price.value * metal_usd_price;
    var key_usd_price = result.keys.price.value * metal_usd_price;
    var earbuds_usd_price = result.earbuds.price.value * key_usd_price;
    return {
        usd: {
            usd: 1,
            metal: 1 / metal_usd_price,
            hat: 1 / hat_usd_price,
            keys: 1 / key_usd_price,
            earbuds: 1 / earbuds_usd_price
        },
        metal: {
            usd: metal_usd_price,
            metal: 1,
            hat: metal_usd_price / hat_usd_price,
            keys: metal_usd_price / key_usd_price,
            earbuds: metal_usd_price / earbuds_usd_price
        },
        hat: {
            usd: hat_usd_price,
            metal: hat_usd_price / metal_usd_price,
            hat: 1,
            keys: hat_usd_price / key_usd_price,
            earbuds: hat_usd_price / earbuds_usd_price
        },
        keys: {
            usd: key_usd_price,
            metal: key_usd_price / metal_usd_price,
            hat: key_usd_price / hat_usd_price,
            keys: 1,
            earbuds: key_usd_price / earbuds_usd_price
        },
        earbuds: {
            usd: earbuds_usd_price,
            metal: earbuds_usd_price / metal_usd_price,
            hat: earbuds_usd_price / hat_usd_price,
            keys: earbuds_usd_price / key_usd_price,
            earbuds: 1
        }
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

TF2Api.prototype._getBpTfVersioningUpdateQuery = function () {
    return "INSERT INTO versioning (id,version) VALUES('bptf'," + parseInt(new Date().getTime() / 1000) + ") ON DUPLICATE KEY UPDATE version=VALUES(version)";
};