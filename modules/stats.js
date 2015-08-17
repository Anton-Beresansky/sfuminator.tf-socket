module.exports = Stats;

var Logs = require("../lib/logs.js");

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
        fetchNewItems: {every: 2, c: 0}
    };
    this.stats = {};
    this.max_new_items = 10;
    this.log = new Logs("Stats");
    this.load();
}

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
        var sectionItems = this.shop.sections[sectionID].items;
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
        finalList.push(this.shop.getItem(itemList[i].id));
    }
    if (!this.stats.hasOwnProperty("new_items") || (JSON.stringify(finalList) !== JSON.stringify(this.stats.new_items.items))) {
        this.stats.new_items = {items: finalList, last_update_date: new Date().getTime()};
    }
};

Stats.prototype.fetchActiveTradeCount = function () {
    var self = this;
    this.shop.getActiveTrades(function (list) {
        self.stats.active_trade_count = list.length;
    });
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
    return "SELECT COUNT(*) as trade_count FROM `trades`";
};