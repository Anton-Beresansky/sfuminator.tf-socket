module.exports = PriceHistory;

var LogLog = require('log-log');
var TradeConstants = require('../trade/tradeConstants.js');

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
    this._onLoadCallbacks = [];
    this.itemsUIDs = {};
    this.log = LogLog.create({applicationName: "Prices History", color: "magenta", dim: true});
    //this.load();
}

PriceHistory.prototype.load = function () {
    var self = this;
    this.log.debug("Loading...");
    this._makeTables(function () {
        self.loadLatestID(function () {
            self.loadItemsUIDs(function () {
                self.loaded = true;
                self._handleOnLoadCallbacks();
                self.log.debug("Ready " + self.latestID);
            });
        });
    });
};

PriceHistory.prototype.onLoad = function (callback) {
    this.loaded ? callback() : this._onLoadCallbacks.push(callback);
};

PriceHistory.prototype.update = function (callback) {
    var self = this;
    this.loadLatestID(function () {
        var loadedLatestID = self.latestID;
        self.read(function (err, trades) {
            self.insert(trades, function () {
                if (self.latestID > loadedLatestID) {
                    self.saveLatestID();
                }
            });
        });
    });
};

PriceHistory.prototype.loadLatestID = function (callback) {
    var self = this;
    this._fetchLatestID(function (latestID) {
        self.latestID = latestID;
        callback();
    });
};

PriceHistory.prototype.loadItemsUIDs = function (callback) {
    this._fetchItemsUID(function (itemsUIDs) {
        for (var i = 0; i < itemsUIDs.length; i += 1) {
            this.itemsUIDs[itemsUIDs[i].name] = this.itemsUIDs[itemsUIDs[i].uid];
        }
        callback();
    });
};

PriceHistory.prototype.insert = function (trades) {
    var self = this;
    var insertData = this._parseInsertData(trades);
    var finalizeInsert = function () {
        if (insertData.items.length) {
            self.saveItems(insertData.items);
        }
    };
    if (insertData.UIDs.length) {
        this.saveUIDs(insertData.UIDs, function () {
            self.loadItemsUIDs(function () {
                finalizeInsert();
            });
        })
    } else {
        finalizeInsert();
    }
};

PriceHistory.prototype._parseInsertData = function (trades) {
    var itemsToInsert = [], UIDsToInsert = [];
    for (var i = 0; i < trades.length; i += 1) {
        var trade = trades[i];
        if (trade.trade_id === (this.latestID + 1) && trade.status_info === TradeConstants.statusInfo.closed.ACCEPTED) {
            this.latestID = trade.trade_id;
            for (var p = 0; p < trade.items.length; p += 1) {
                var item = trade.items[p];
                var fullName = item.getFullName();
                if (item.shop !== "mine") { //Basically ('if bought')
                    itemsToInsert.push({
                        name: fullName,
                        scrapPrice: item.scrapPrice,
                        last_update_date: new Date(trade.last_update_date)
                    });
                }
                if (!this.itemsUIDs.hasOwnProperty(fullName)) {
                    UIDsToInsert.push(fullName);
                }
            }
        }
    }
    return {items: itemsToInsert, UIDs: UIDsToInsert};
};

PriceHistory.prototype.saveLatestID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.saveLatestID(self.latestID), function () {
            connection.release();
            callback();
        });
    })
};

PriceHistory.prototype.saveItems = function (items, callback) {
    var self = this;
    for (var i = 0; i < items.length; i += 1) {
        items[i].uid = this.itemsUIDs[items[i].name];
    }
    this.db.connect(function (connection) {
        connection.query(self.queries.insertItems(items), function () {
            connection.release();
            callback();
        });
    })
};

PriceHistory.prototype.read = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.read(self.latestID), function (result, isEmpty) {
            connection.release();
            if (isEmpty) {
                callback(null, []);
            } else {
                callback(null, self._parse(result));
            }
        })
    });
};

PriceHistory.prototype._parse = function (result) {
    var i, attributes = [], items = [], trades = [], itemID, tradeID;
    for (i = 0; i < result.length; i += 1) {
        var r = result[i];
        itemID = r.item_id;
        tradeID = r.trade_id;
        attributes.push({
            defindex: r.attr_defindex,
            value: r.value,
            float_value: r.float_value,
            steamid: r.attr_steamid
        });
        if (((i + 1) === result.length) || result[i + 1].item_id !== itemID) {
            if (itemID) {
                var item = new TF2Item(this.backpacksApi.mergeItemWithSchemaItem({
                    id: r.item_id,
                    owner: r.owner,
                    original_id: r.original_id,
                    defindex: r.defindex,
                    level: r.level,
                    quantity: r.quantity,
                    origin: r.origin,
                    flag_cannot_craft: r.flag_cannot_craft,
                    flag_cannot_trade: r.flag_cannot_trade,
                    quality: r.quality,
                    attributes: attributes,
                    scrapPrice: r.scrapPrice,
                    shop: r.shop_type
                }, this.backpacksApi.tf2.schema[r.defindex]), r.owner);
                items.push({
                    id: item.id,
                    owner: item.owner,
                    name: item.name,
                    quality: item.quality,
                    level: item.level,
                    scrapPrice: item.scrapPrice,
                    shop: item.shop,
                    image_url: item.getImageUrl()
                });
            }
            attributes = [];
        }
        if (((i + 1) === result.length) || result[i + 1].trade_id !== tradeID) {
            trades.push({
                trade_id: r.trade_id,
                last_update_date: r.trade_last_update_date,
                partner: r.partner_steamid,
                bot: r.bot_steamid,
                status: r.status,
                status_info: r.status_info,
                trade_type: r.trade_type,
                forced_balance: r.forced_balance,
                items: items
            });
            items = [];
        }
    }
    return trades;
};

PriceHistory.prototype._handleOnLoadCallbacks = function () {
    for (var i = 0; i < this._onLoadCallbacks.length; i += 1) {
        this._onLoadCallbacks[i]();
    }
};

PriceHistory.prototype._fetchLatestID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.loadLatestID(), function (result, isEmpty) {
            connection.release();
            if (isEmpty) {
                callback(0);
            } else {
                callback(self.latestID);
            }
        });
    })
};

PriceHistory.prototype._fetchItemsUID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.readUIDs(), function (result, isEmpty) {
            connection.release();
            var UIDs = [];
            if (!isEmpty) {
                UIDs = result;
            }
            callback(UIDs);
        });
    })
};

PriceHistory.prototype._makeTables = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.makeNameTable(), function () {
            connection.query(self.queries.makePricesHistoryTable(), function () {
                connection.release();
                callback();
            });
        });
    });
};

PriceHistory.QUERIES = {
    makeNameTable: function () {
        return "CREATE TABLE IF NOT EXISTS my_sfuminator_items.`unique_items_id` ("
            + "`uid` INT NOT NULL AUTO_INCREMENT,"
            + "`name` VARCHAR(100),"
            + "PRIMARY KEY (`uid`)"
            + ") "
            + "ENGINE = InnoDB "
            + "DEFAULT CHARACTER SET = utf8 "
            + "COLLATE = utf8_bin";
    },
    makePricesHistoryTable: function () {
        return "CREATE TABLE IF NOT EXISTS `prices_history` ("
            + "`id` INT NOT NULL AUTO_INCREMENT, "
            + "`item_uid` INT,"
            + "`scrapPrice` INT,"
            + "`sell_date` DATETIME,"
            + "PRIMARY KEY (`id`),"
            + "KEY (`item_uid`)"
            + ") "
            + "ENGINE = InnoDB "
            + "DEFAULT CHARACTER SET = utf8 "
            + "COLLATE = utf8_bin"
    },
    loadLatestID: function () {
        return "SELECT `version` as `latestID` FROM `tasks` WHERE `of`='pHistory_tradeid'";
    },
    saveLatestID: function (latestID) {
        return "UPDATE `tasks` set `version`=" + latestID + " WHERE `of`='pHistory_tradeid'";
    },
    readUIDs: function () {
        return "SELECT `name`,`uid` FROM my_sfuminator_items.`unique_items_id`";
    },
    read: function (latestID) {
        return "SELECT "
            + "trades.id as trade_id,"
            + "trades.last_update_date as trade_last_update_date,"
            + "trades.steamid as partner_steamid,"
            + "trades.bot_steamid,"
            + "trades.status_info,"
            + "my_sfuminator.shop_trade_items.item_id,"
            + "my_sfuminator.shop_trade_items.scrapPrice,"
            + "my_sfuminator.shop_trade_items.shop_type,"
            + "my_sfuminator_items.items.owner,"
            + "my_sfuminator_items.items.original_id,"
            + "my_sfuminator_items.items.defindex,"
            + "my_sfuminator_items.items.level,"
            + "my_sfuminator_items.items.quantity,"
            + "my_sfuminator_items.items.origin,"
            + "my_sfuminator_items.items.flag_cannot_craft,"
            + "my_sfuminator_items.items.flag_cannot_trade,"
            + "my_sfuminator_items.items.quality,"
            + "my_sfuminator_items.attributes.defindex as attr_defindex,"
            + "my_sfuminator_items.attributes.value,"
            + "my_sfuminator_items.attributes.float_value,"
            + "my_sfuminator_items.attributes.steamid as attr_steamid "
            + "FROM "
            + "("
            + "SELECT "
            + "* "
            + "FROM "
            + "my_sfuminator.shop_trades WHERE my_sfuminator.shop_trades.trade_type=0 "
            + "AND my_sfuminator.shop_trades.status='closed' "
            + (latestID ? ("AND my_sfuminator.shop_trades.id>" + latestID) : "")
            + "ORDER BY "
            + "my_sfuminator.shop_trades.id ASC LIMIT 100000"
            + ") "
            + "as trades "
            + "JOIN "
            + "my_sfuminator.users partner "
            + "ON partner.steam_id = trades.steamid "
            + "JOIN "
            + "my_sfuminator.shop_trade_items "
            + "ON my_sfuminator.shop_trade_items.trade_id = trades.id "
            + "JOIN "
            + "my_sfuminator_items.items "
            + "ON my_sfuminator.shop_trade_items.item_id = my_sfuminator_items.items.id "
            + "JOIN "
            + "my_sfuminator_items.attributes "
            + "ON my_sfuminator.shop_trade_items.item_id = my_sfuminator_items.attributes.id"
    },
    insertItems: function (items) {
        var query = "INSERT IGNORE `item_uid`,`scrapPrice`,`sell_date` VALUES ";
        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            query += "(" + item.uid + "," + item.scrapPrice + ",'" + item.last_update_date.toMysqlFormat() + "'),";
        }
        return query.slice(0, -1);
    }
};