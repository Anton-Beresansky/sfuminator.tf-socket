module.exports = Stats;

var Logs = require("../lib/logs.js");

/**
 * General purpose Stats class
 * @param {Sfuminator} sfuminator The Sfuminator instance
 * @returns {Stats}
 */
function Stats(sfuminator) {
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.db = this.sfuminator.db;
    this.cloud = this.sfuminator.cloud;
    this.ticks = {
        getStockCount: {every: 1, c: 0},
        fetchActiveTradeCount: {every: 5, c: 0},
        fetchTradeCount: {every: 5, c: 0},
        fetchScannedProfiles: {every: 30, c: 0},
        fetchNewItems: {every: 2, c: 0},
        storePricedStock: {every: (60 * 15), c: 0}
    };
    this.stats = {};
    this.max_new_items = 10;
    this.log = new Logs({applicationName: "Stats"});
}

/**
 * Get client formatted stats
 * @param {Date|Number} last_update_date Get stats from a given time
 * @returns {Object}
 */
Stats.prototype.get = function (last_update_date) {
    if (!last_update_date || isNaN(last_update_date) || !last_update_date instanceof Date) {
        last_update_date = new Date(0).getTime();
    }
    var result = {};
    for (var property in this.stats) {
        if (this.stats[property].hasOwnProperty("last_update_date")) {
            if (this.stats[property].last_update_date > last_update_date) {
                result[property] = this.stats[property];
            }
        }
        else {
            result[property] = this.stats[property];
        }
    }
    return result;
};

/**
 * Update stats
 */
Stats.prototype.update = function () {
    for (var method in this.ticks) {
        var tick = this.ticks[method];
        tick.c += 1;
        if (tick.c >= tick.every) {
            tick.c = 0;
            this.log.debug("Updating " + method, 3);
            this[method]();
        }
    }
};

/**
 * Load stats
 */
Stats.prototype.load = function () {
    this.log.debug("Loading");
    for (var method in this.ticks) {
        this[method]();
    }
};

Stats.prototype.getStockCount = function () {
    for (var sectionID in this.shop.sections) {
        this.stats["stock_" + sectionID] = this.shop.sections[sectionID].items.length;
    }
};

Stats.prototype.fetchNewItems = function () {
    var itemList = [];
    for (var sectionID in this.shop.sections) {
        var sectionItems = [];
        if (!this.shop.sections[sectionID].isHidden()) {
            sectionItems = this.shop.sections[sectionID].getItems();
        }
        itemList = itemList.concat(sectionItems.slice(sectionItems.length - this.max_new_items, sectionItems.length));
    }
    itemList.sort(function (a, b) {
        if (a.id > b.id)
            return -1;
        if (a.id < b.id)
            return 1;
        return 0;
    });
    var finalList = [];
    var cycleTill = itemList.length;
    if (itemList.length > this.max_new_items) {
        cycleTill = this.max_new_items;
    }
    for (var i = 0; i < cycleTill; i += 1) {
        finalList.push(itemList[i].valueOf());
    }
    if (!this.stats.hasOwnProperty("new_items") || (JSON.stringify(finalList) !== JSON.stringify(this.stats.new_items.items))) {
        this.stats.new_items = {items: finalList, last_update_date: new Date().getTime()};
    }
};

Stats.prototype.fetchActiveTradeCount = function () {
    this.stats.active_trade_count = this.sfuminator.activeTrades.length;
};

Stats.prototype.fetchScannedProfiles = function () {
    var self = this;
    this.cloud.send("query", "SELECT COUNT(*) as bp_count FROM backpacks", function (result) {
        var count = result[0].bp_count;
        if (count) {
            self.stats.scanned_profiles = count;
        }
    });
};

Stats.prototype.fetchTradeCount = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getOldTradeCountQuery(), function (result, errored) {
            var count = 0;
            if (!errored) {
                count += result[0].trade_count;
            }
            connection.query(self._getTradeCountQuery(), function (result, errored) {
                if (!errored) {
                    count += result[0].trade_count;
                }
                connection.release();
                self.stats.trade_count = count;
            });
        });
    });
};

Stats.prototype._getTradeCountQuery = function () {
    return "SELECT COUNT(*) as trade_count FROM `shop_trade_items` JOIN (SELECT `id` FROM `shop_trades` WHERE `status_info`='accepted') as `ids` ON `shop_trade_items`.trade_id=`ids`.id";
};

Stats.prototype._getOldTradeCountQuery = function () {
    return "SELECT COUNT(*) as trade_count FROM `trades` WHERE `when`<1439827244";
};

Stats.prototype.storePricedStock = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getStoreStockQuery(), function () {
            connection.release();
        });
    });
};

Stats.prototype.getPricedStockCount = function () {
    var pricedStockCount = {};
    for (var type in this.shop.sections) {
        for (var i = 0; i < this.shop.sections[type].items.length; i += 1) {
            var item = this.shop.sections[type].items[i].getItem();
            var metalPrice = item.getPrice().toMetal();
            var owner = item.getOwner();
            if (!pricedStockCount.hasOwnProperty(owner)) {
                pricedStockCount[owner] = {};
            }
            if (!pricedStockCount[owner].hasOwnProperty(type)) {
                pricedStockCount[owner][type] = {};
            }
            if (!pricedStockCount[owner][type].hasOwnProperty(metalPrice)) {
                pricedStockCount[owner][type][metalPrice] = 0;
            }
            pricedStockCount[owner][type][metalPrice] += 1;
        }
    }
    return pricedStockCount;
};

Stats.prototype._getStoreStockQuery = function () {
    var pricedStockCount = this.getPricedStockCount();
    var query = "INSERT INTO `shop_stock` (`bot_steamid`,`shop_type`,`price`,`count`) VALUES ";
    for (var owner in pricedStockCount) {
        for (var type in pricedStockCount[owner]) {
            for (var metalPrice in pricedStockCount[owner][type]) {
                query += "('" + owner + "','" + type + "'," + metalPrice + "," + pricedStockCount[owner][type][metalPrice] + "), ";
            }
        }
    }
    return query.slice(0, query.length - 2) + " ON DUPLICATE KEY UPDATE `count`=VALUES(`count`)";
};
/*
 * {
 *      bot_steamid:
 *      shop_type:
 *      price:
 *      count:
 *      store_date:
 * }
 * 
 */