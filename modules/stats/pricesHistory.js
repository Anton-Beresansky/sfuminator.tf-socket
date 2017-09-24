module.exports = PriceHistory;

var LogLog = require('log-log');
var Callbacks = require('../../lib/callbacks.js');
var TradeConstants = require('../trade/tradeConstants.js');
var TF2Item = require('../tf2/tf2Item.js');

/**
 * @parameter stats {Stats}
 * @constructor
 */
function PriceHistory(stats) {
    this.stats = stats;
    /**
     * @type Sfuminator
     */
    this.sfuminator = this.stats.sfuminator;
    /**
     * @type {Shop}
     */
    this.shop = this.sfuminator.shop;
    /**
     * @type {Database}
     */
    this.db = this.stats.db;
    /**
     * @type {BackpacksApi}
     */
    this.backpacksApi = this.shop.webApi.backpacks;
    this.queries = PriceHistory.QUERIES;
    this._callbacks = new Callbacks();
    this._longUpdateIterations = 0;
    this._isLongUpdate = false;
    this.itemsHistory = {};
    this.log = LogLog.create({applicationName: "Prices History", color: "magenta", dim: true});
}

PriceHistory.prototype.getLatestHistoryScrapPriceFor = function (uid) {
    return this.itemsHistory.hasOwnProperty(uid) ? this.itemsHistory[uid].scrapPrice : false;
};

PriceHistory.prototype.load = function (callback) {
    var self = this;
    this.log.debug("Loading...");
    this.onLoad(callback);
    this._makeTables(function () {
        self.loadLatestTradeID(function () {
            self.loadItemsPrices(function () {
                self.update(function () {
                    self._callbacks.fire("onLoad");
                    self.log.debug("Ready " + self.latestID);
                });
            });
        });
    });
};

PriceHistory.prototype.onLoad = function (callback) {
    this._callbacks.stack("onLoad", callback);
};

PriceHistory.prototype.update = function (callback, forcedTradeCount) {
    var self = this;
    this.log.debug("Updating...");
    this.loadLatestTradeID(function () {
        var loadedLatestID = self.latestID;
        self.log.debug("Loaded latest trade id to: " + loadedLatestID);
        self.readItems(function (items) {
            self.saveItems(items, function () {
                if (self._isLongUpdate) {
                    self._longUpdateIterations += 1;
                    self.update(callback, forcedTradeCount);
                } else {
                    if (self.latestID > loadedLatestID) {
                        self.saveLatestTradeID();
                    }
                    self._callbacks.stack("onUpdate", callback);
                    self._callbacks.fire("onUpdate");
                }
            });
        });
    }, forcedTradeCount);
};

PriceHistory.prototype.loadLatestTradeID = function (callback, forcedTradeCount) {
    var self = this;
    this._fetchLatestTradeID(function (latestID) {
        self.latestID = latestID;
        if (forcedTradeCount) {
            self._injectWantedStartingTradeID(forcedTradeCount);
        }
        callback();
    });
};

PriceHistory.prototype.loadItemsPrices = function (callback) {
    var self = this;
    this.log.debug("Loading items prices...");
    this._fetchItemsPrices(function (err, result) {
        for (var i = 0; i < result.length; i += 1) {
            var row = result[i];
            self.itemsHistory[row.item_uid] = {
                uid: row.item_uid,
                scrapPrice: row.scrapPrice,
                last_update_date: new Date(row.sell_date)
            };
        }
        callback();
    });
};

PriceHistory.prototype.saveLatestTradeID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.saveLatestTradeID(self.latestID), function () {
            connection.release();
            if (typeof callback === "function") {
                callback();
            }
        });
    })
};

PriceHistory.prototype.saveItems = function (items, callback) {
    var self = this;
    if (items.length === 0) {
        this.log.debug("No items to save");
        callback();
        return;
    }
    this.log.debug("Saving items... (" + items.length + ")");
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var uid = item.uid;
        if (!this.itemsHistory.hasOwnProperty(uid)) {
            this.itemsHistory[uid] = item;
        } else if (this.itemsHistory[uid].last_update_date < item.last_update_date) {
            this.itemsHistory[uid].last_update_date = item.last_update_date;
            this.itemsHistory[uid].scrapPrice = item.scrapPrice;
        }
    }
    this.db.connect(function (connection) {
        connection.query(self.queries.insertItemsPrices(items), function () {
            connection.release();
            callback();
        });
    });
};

PriceHistory.prototype.readItems = function (callback) {
    var self = this;
    this.backpacksApi.fetchItems(this.queries.readTradedItems(this.latestID), function (items) {
        callback(self._parseItemsToInsert(items));
    });
};

/**
 * @param uid
 * @param [limit]
 * @param callback
 */
PriceHistory.prototype.readItemHistory = function (uid, limit, callback) {
    if (typeof limit === "function") {
        callback = limit;
    }
    var self = this;
    this.db.singleQuery(self.queries.readItemHistory(uid, !isNaN(limit) ? limit : null), function (result) {
        callback(result);
    });
};

PriceHistory.prototype._parseItemsToInsert = function (items) {
    var itemsToInsert = [];
    items.sort(function (a, b) {
        if (a._dbRow.trade_id > b._dbRow.trade_id) {
            return 1;
        } else {
            return -1;
        }
    });
    for (var i = 0; i < items.length; i += 1) {
        var item = new TF2Item(items[i]);
        var dbRow = item._dbRow;
        if (dbRow.status_info === TradeConstants.statusInfo.closed.ACCEPTED) {
            this.latestID = dbRow.trade_id;
            if (dbRow.shop_type !== "mine") { //Basically ('if bought')
                itemsToInsert.push({
                    uid: item.getUID(),
                    name: item.getFullName(),
                    scrapPrice: dbRow.scrapPrice,
                    last_update_date: new Date(dbRow.trade_last_update_date)
                });
            }
        }
    }
    if (items.length) {
        this.log.debug("Parsed trades from " + new Date(items[0]._dbRow.trade_last_update_date)
            + " to " + new Date(items[items.length - 1]._dbRow.trade_last_update_date));
    }
    return itemsToInsert;
};

PriceHistory.prototype._injectWantedStartingTradeID = function (forcedTradeCount) {
    var actualLatestID = this.latestID;
    this.latestID = this.latestID - forcedTradeCount + (this._longUpdateIterations * PriceHistory.DB.readLimit);
    this._isLongUpdate = true;
    if (this.latestID > actualLatestID) {
        this._isLongUpdate = false;
        this.latestID = actualLatestID;
    }
};

PriceHistory.prototype._fetchLatestTradeID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.loadLatestTradeID(), function (result, isEmpty) {
            connection.release();
            if (isEmpty) {
                callback(0);
            } else {
                callback(result[0].latestID || 0);
            }
        });
    })
};

PriceHistory.prototype._fetchItemsPrices = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.readItemsPrices(), function (result, isEmpty) {
            connection.release();
            if (!isEmpty) {
                callback(null, result);
            } else {
                callback(null, []);
            }
        });
    });
};

PriceHistory.prototype._makeTables = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.makePricesHistoryTable(), function () {
            connection.release();
            callback();
        });
    });
};

PriceHistory.DB = {
    tableName: "`prices_history`",
    readLimit: 20000
};
PriceHistory.QUERIES = {
    makePricesHistoryTable: function () {
        return "CREATE TABLE IF NOT EXISTS " + PriceHistory.DB.tableName + " ("
            + "`id` INT NOT NULL AUTO_INCREMENT, "
            + "`item_uid` INT,"
            + "`scrapPrice` INT,"
            + "`sell_date` DATETIME,"
            + "PRIMARY KEY (`id`),"
            + "INDEX (`item_uid`)"
            + ") "
            + "ENGINE = InnoDB "
            + "DEFAULT CHARACTER SET = utf8 "
            + "COLLATE = utf8_bin"
    },
    loadLatestTradeID: function () {
        return "SELECT `version` as `latestID` FROM `tasks` WHERE `of`='pHistory_tradeid'";
    },
    saveLatestTradeID: function (latestID) {
        return "UPDATE `tasks` set `version`=" + latestID + " WHERE `of`='pHistory_tradeid'";
    },
    readItemsPrices: function () {
        return "SELECT item_uid,scrapPrice,max(sell_date) as sell_date FROM " + PriceHistory.DB.tableName + " GROUP BY item_uid";
    },
    insertItemsPrices: function (items) {
        var query = "INSERT IGNORE INTO " + PriceHistory.DB.tableName + " (`item_uid`,`scrapPrice`,`sell_date`) VALUES ";
        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            query += "(" + item.uid + "," + item.scrapPrice + ",'" + item.last_update_date.toMysqlFormat() + "'),";
        }
        return query.slice(0, -1);
    },
    readItemHistory: function (uid, length) {
        return "SELECT * FROM " + PriceHistory.DB.tableName + " WHERE item_uid=" + uid + " ORDER BY id DESC" + (length ? (" LIMIT " + length) : "");
    },
    readTradedItems: function (latestID) {
        return "SELECT trades.id as trade_id, trades.last_update_date as trade_last_update_date, "
            + "trades.steamid as partner_steamid, trades.bot_steamid, trades.status_info,  "
            + "trade_items.scrapPrice, trade_items.shop_type, trade_items.item_id "
            + "FROM ("
            + "SELECT * FROM my_sfuminator.shop_trades WHERE my_sfuminator.shop_trades.trade_type=0 "
            + "AND my_sfuminator.shop_trades.status='closed' "
            + (latestID ? ("AND my_sfuminator.shop_trades.id>" + (latestID - 50) + " ") : "")
            + "ORDER BY "
            + "my_sfuminator.shop_trades.id LIMIT " + PriceHistory.DB.readLimit
            + ") "
            + "as trades "
            + "JOIN "
            + "my_sfuminator.shop_trade_items as trade_items "
            + "ON trade_items.trade_id = trades.id "
    }
};