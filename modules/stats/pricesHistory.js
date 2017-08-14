module.exports = PriceHistory;

var LogLog = require('log-log');

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
    this.log = LogLog.create({applicationName: "Prices History", color: "magenta", dim: true});
    this.load();
}

PriceHistory.prototype.load = function () {
    var self = this;
    this.log.debug("Loading...");
    this._makeTables(function () {
        self._fetchLatestID(function (latestID) {
            self.latestID = latestID;
            self.loaded = true;
            self._handleOnLoadCallbacks();
            self.log.debug("Ready " + self.latestID);
        });
    });
};

PriceHistory.prototype.onLoad = function (callback) {
    this.loaded ? callback() : this._onLoadCallbacks.push(callback);
};

PriceHistory.prototype.read = function (callback) {

};

PriceHistory.prototype._handleOnLoadCallbacks = function () {
    for (var i = 0; i < this._onLoadCallbacks.length; i += 1) {
        this._onLoadCallbacks[i]();
    }
};

PriceHistory.prototype._fetchLatestID = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.readLatestID(), function (result, isEmpty) {
            connection.release();
            if (isEmpty) {
                callback(0);
            } else {
                callback(self.latestID);
            }
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
    readLatestID: function () {
        return "SELECT `version` as `latestID` FROM `tasks` WHERE `of`='pHistory_tradeid'";
    },
    read: function (latestID) {
        return "SELECT "
            + "trades.id as trade_id,"
            + "trades.last_update_date as trade_last_update_date,"
            + "trades.steamid as partner_steamid,"
            + "trades.bot_steamid,"
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
            + "AND my_sfuminator.shop_trades.status_info='accepted' "
            + (latestID ? ("AND my_sfuminator.shop_trades.id>" + latestID) : "")
            + "ORDER BY "
            + "my_sfuminator.shop_trades.id DESC LIMIT 100000"
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
    }
};