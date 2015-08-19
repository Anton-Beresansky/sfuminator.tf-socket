module.exports = ShopTrade;
var events = require("events");
var Logs = require("../../lib/logs.js");
var TF2Price = require("../tf2/tf2Price.js");
var ItemCount = require("./shopItemCount.js");
//Shop Trade Status: hold -> (noFriend) -> active -> sent -> closed/accepted/declined

function ShopTrade(sfuminator, partner) {
    this.partner = partner;
    this.sfuminator = sfuminator;
    this.shop = sfuminator.shop;
    this.ajaxResponses = sfuminator.responses;
    this.response = this.ajaxResponses.error;
    this.database = new TradeDb(this, sfuminator.db);
    this.log = new Logs("Trade offer " + this.partner.getSteamid());
    this.assets = [];
    this._available_modes = ["offer", "manual"];
    this.last_update_date = new Date();
    this.assets_limit = {partner: 20, shop: 20};
    events.EventEmitter.call(this);
}

require("util").inherits(ShopTrade, events.EventEmitter);
ShopTrade.prototype.hasBeenAccepted = function () {
    return this.getStatusInfo() === "accepted";
};
ShopTrade.prototype.isActive = function () {
    return this.status && (this.status !== "closed" || (this.getLastUpdateDate() > new Date(new Date() - this.sfuminator.shopTrade_decay)));
};
ShopTrade.prototype.isClosed = function () {
    return this.status === "closed";
};
ShopTrade.prototype.send = function () {
    if (!this.getMode()) {
        this.log.error("No trade mode set, can't send trade");
    } else if (!this.shop.isBot(this.getBotSteamid())) {
        this.log.error("No bot steamid set, can't send trade");
    } else {
        this.setStatus("hold");
        this.setStatusInfo("open");
        this.database.save();
        this.log.debug("Sent trade: " + JSON.stringify(this.valueOf()));
    }
};
ShopTrade.prototype.cancel = function () {
    this.dereserveItems();
    this.setStatus("closed");
    this.setStatusInfo("cancelled");
    this.commit();
    this.log.debug("Trade " + this.getID() + " has been cancelled");
};
ShopTrade.prototype.accepted = function () {
    this.setStatus("closed");
    this.setStatusInfo("accepted");
    this.commit();
    this.log.debug("Trade " + this.getID() + " has been accepted");
};
ShopTrade.prototype.commit = function (callback) {
    if (isNaN(this.getID())) {
        this.log.error("Can't commit trade changes, no trade id associated");
    } else {
        this.database.update(callback);
    }
};
ShopTrade.prototype.getClientChanges = function (last_update_date) {
    last_update_date = new Date(last_update_date);
    if (last_update_date.toString() !== "Invalid Date") {
        if (this.getLastUpdateDate() > last_update_date) {
            return {status: this.getStatus(), statusInfo: this.getStatusInfo(), last_update_date: this.getLastUpdateDate().getTime()};
        }
    }
    return false;
};
ShopTrade.prototype.valueOf = function () {
    return {
        botSteamid: this.getBotSteamid(),
        partnerID: this.partner.getSteamid(),
        mode: this.getMode(),
        status: this.getStatus(),
        statusInfo: this.getStatusInfo(),
        last_update_date: this.getLastUpdateDate().getTime(),
        items: this.getPlate()
    };
};
ShopTrade.prototype.load = function (callback) {
    var self = this;
    this.database.load(function (rows) {
        var trade = rows[0];
        self.setID(trade.id);
        self.setStatus(trade.status);
        self.setStatusInfo(trade.status_info);
        self.setMode(trade.mode);
        var items = {};
        for (var i = 0; i < rows.length; i += 1) {
            var iRow = rows[i];
            if (items.hasOwnProperty(iRow.shop_type)) {
                items[iRow.shop_type].push(iRow.item_id);
            } else {
                items[iRow.shop_type] = [iRow.item_id];
            }
        }
        self.setItems(items);
        self.log.debug("Loaded items: " + JSON.stringify(items), 3);
        self.verifyItems(function (success) {
            self.log.debug("Loaded trade " + self.getID() + ", verification success: " + ((success) ? success : JSON.stringify(self.response)));
            self.logAssets();
            if (typeof callback === "function") {
                callback(self);
            }
        });
    });
};
ShopTrade.prototype.verifyItems = function (callback) {
    var self = this;
    this.emptyAssets();
    this.log.debug("Verifying items");
    for (var section in this.items) {
        if (this.shop.sectionExist(section) && this.items[section] instanceof Array) {
            for (var i = 0; i < this.items[section].length; i += 1) {
                if (this.verifyShopItem(this.items[section][i], section)) {
                    this.assets.push(this.getAsset(this.shop.inventory.getItem(this.items[section][i])));
                } else {
                    callback(false);
                    return;
                }
            }
        } else if (section !== "mine") {
            this.response = this.ajaxResponses.sectionNotFound;
            this.emit("response", this.response);
            callback(false);
            return;
        }
    }
    if (this.getShopItemCount() > this.assets_limit.shop) {
        this.response = this.ajaxResponses.shopAssetsLimit(this.assets_limit.shop);
        this.emit("response", this.response);
        callback(false);
        return;
    }
    if (this.items.hasOwnProperty("mine") && this.items.mine instanceof Array) {
        this.verifyMineItems(callback, function (item) {
            self.assets.push(self.getAsset(item));
        });
    } else {
        callback(true);
    }
};
ShopTrade.prototype.getPartnerItemCount = function () {
    var count = 0;
    for (var i = 0; i < this.assets.length; i += 1) {
        if (this.assets[i].getItem().getOwner() === this.partner.getSteamid()) {
            count += 1;
        }
    }
    return count;
};
ShopTrade.prototype.getShopItemCount = function () {
    return this.assets.length - this.getPartnerItemCount();
};
ShopTrade.prototype.reserveItems = function () {
    this.log.debug("Reserving items", 3);
    this.logAssets(3);
    for (var i = 0; i < this.assets.length; i += 1) {
        var item = this.assets[i].getItem();
        if (item.getOwner() !== this.partner.getSteamid()) {
            this.shop.reservations.add(this.partner.getSteamid(), item.id);
        }
    }
};
ShopTrade.prototype.dereserveItems = function () {
    this.log.debug("Dereserving items", 3);
    this.logAssets(3);
    for (var i = 0; i < this.assets.length; i += 1) {
        var item = this.assets[i].getItem();
        if (item.getOwner() !== this.partner.getSteamid()) {
            this.shop.reservations.cancel(item.id);
        }
    }
};
ShopTrade.prototype.getPlate = function () {
    var plate = {me: [], them: [], full_list: []};
    for (var i = 0; i < this.assets.length; i += 1) {
        if (this.partner.getSteamid() === this.assets[i].getItem().getOwner()) {
            plate.them.push(this.assets[i].valueOf());
            plate.full_list.push(this.shop.filterMineItems([this.assets[i].getItem()])[0]);
        } else {
            plate.me.push(this.assets[i].valueOf());
            plate.full_list.push(this.shop.getItem(this.assets[i].getItem().id));
        }
    }
    return plate;
};
ShopTrade.prototype.getPartner = function () {
    return this.partner;
};
ShopTrade.prototype.setBotSteamid = function (steamid) {
    this.botSteamid = steamid;
};
ShopTrade.prototype.getBotSteamid = function () {
    return this.botSteamid;
};
ShopTrade.prototype.getID = function () {
    return this.id;
};
ShopTrade.prototype.getStatus = function () {
    return this.status;
};
ShopTrade.prototype.getStatusInfo = function () {
    return this.status_info;
};
ShopTrade.prototype.getMode = function () {
    return this.mode;
};
ShopTrade.prototype.setID = function (id) {
    this.id = id;
};
ShopTrade.prototype.setStatus = function (status) {
    this.status = status;
    this.setLastUpdateDate(new Date());
};
ShopTrade.prototype.setStatusInfo = function (status_info) {
    this.status_info = status_info;
    this.setLastUpdateDate(new Date());
};
ShopTrade.prototype.setMode = function (mode) {
    if (this.modeExist(mode)) {
        this.mode = mode;
    }
};
ShopTrade.prototype.modeExist = function (mode) {
    for (var i = 0; i < this._available_modes.length; i += 1) {
        if (this._available_modes[i] === mode) {
            return true;
        }
    }
    return false;
};
ShopTrade.prototype.setItems = function (items) {
    this.items = items;
};
ShopTrade.prototype.setLastUpdateDate = function (updateDate) {
    updateDate = new Date(updateDate);
    if (updateDate.toString() !== "Invalid Date") {
        this.last_update_date = updateDate;
        if (this.hasBeenAccepted()) { //Force refresh user backpack if trade has been accepted
            var self = this;
            setTimeout(function () {
                self.partner.getTF2Backpack().get();
            }, 10000);
        }
    }
};
ShopTrade.prototype.getLastUpdateDate = function () {
    return this.last_update_date;
};
ShopTrade.prototype.verifyShopItem = function (idToCheck, section) {
    if (!this.shop.sections[section].itemExist(idToCheck)) {
        this.response = this.ajaxResponses.itemsSelectedNotFound;
        this.emit("response", this.response);
        return false;
    }
    if (this.shop.reservations.exist(idToCheck) && this.shop.reservations.get(idToCheck).getHolder() !== this.partner.getSteamid()) {
        this.response = this.ajaxResponses.itemIsAlreadyReserved;
        this.emit("response", this.response);
        return false;
    }
    return true;
};
ShopTrade.prototype.verifyMineItems = function (callback, onAcceptedItem) {
    var self = this;
    var itemCount = new ItemCount();
    this.partner.tf2Backpack.getCached(function (backpack) {
        for (var i = 0; i < self.items.mine.length; i += 1) {
            var itemID = self.items.mine[i];
            var item = backpack.getItem(itemID);
            if (!backpack.itemExist(itemID)) {
                self.response = self.ajaxResponses.itemNotFound;
                self.emit("response", self.response);
                callback(false);
                return;
            } else if (!self.shop.canBeSold(item)) {
                self.response = self.ajaxResponses.itemCantBeSold;
                self.emit("response", self.response);
                callback(false);
                return;
            } else {
                onAcceptedItem(item);
                itemCount.add(item);
                var netCount = (itemCount.get(item) + self.shop.count.get(item)) - self.shop.countLimit;
                if (netCount > 0) {
                    self.response = self.ajaxResponses.itemExceedCount(item, netCount);
                    self.emit("response", self.response);
                    callback(false);
                    return;
                }
            }
        }
        if (self.getPartnerItemCount() > self.assets_limit.partner) {
            self.response = self.ajaxResponses.partnerAssetsLimit(self.assets_limit.partner);
            self.emit("response", self.response);
            callback(false);
            return;
        }
        callback(true);
    });
};
ShopTrade.prototype.emptyAssets = function () {
    this.assets = [];
};
ShopTrade.prototype.getAssets = function () {
    return this.assets;
};
ShopTrade.prototype.getAsset = function (item) {
    var itemPrice;
    if (this.shop.isBot(item.getOwner())) {
        itemPrice = item.getPrice();
    } else {
        itemPrice = this.shop.adjustMinePrice(item);
    }
    return new ShopTradeAsset(item, itemPrice);
};
ShopTrade.prototype.logAssets = function (level) {
    var self = this;
    this.log.debug("Assets: " + (function () {
        var result = "";
        for (var i = 0; i < self.assets.length; i += 1) {
            result += JSON.stringify(self.assets[i].valueOf()) + "\n";
        }
        return result;
    }()), level);
};
function ShopTradeAsset(item, itemPrice) {
    this.item = item;
    this.price = itemPrice;
}

ShopTradeAsset.prototype.valueOf = function () {
    return {
        id: this.item.id,
        name: this.item.name,
        level: this.item.level,
        quality: this.item.quality,
        defindex: this.item.defindex,
        scrapPrice: this.getPrice().toScrap(),
        section: this.getShopType()
    };
};
ShopTradeAsset.prototype.getItem = function () {
    return this.item;
};
ShopTradeAsset.prototype.getShopType = function () {
    if (this.item.hasOwnProperty("shopType") && this.item.shopType) {
        return this.item.shopType;
    } else {
        return "mine";
    }
};
ShopTradeAsset.prototype.getPrice = function () {
    return this.price;
};
function TradeDb(trade, db) {
    this.trade = trade;
    this.db = db;
    this.log = new Logs("TradeDB " + this.trade.partner.getSteamid());
}

TradeDb.prototype.load = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getLoadQuery(), function (result) {
            connection.release();
            if (result && result instanceof Array && result[0]) {
                self.log.debug("Loading trade...");
                callback(result);
            }
        });
    });
};
TradeDb.prototype.save = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query(self._getSaveQuery(), function (result) {
                self.trade.setID(result.insertId);
                self.log.debug("Saving trade: " + self.trade.getID());
                connection.query(self._getSaveItemsQuery(), function () {
                    connection.commitRelease();
                });
            });
        });
    });
};
TradeDb.prototype.update = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getUpdateQuery(), function () {
            connection.release();
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};
TradeDb.prototype._getUpdateQuery = function () {
    return "UPDATE `shop_trades` SET "
            + "status='" + this.trade.getStatus() + "',"
            + "status_info='" + this.trade.getStatusInfo() + "' WHERE id=" + this.trade.getID();
};
TradeDb.prototype._getLoadQuery = function () {
    var additionalIdentifier = "";
    if (!isNaN(this.trade.getID())) {
        additionalIdentifier = "AND id=" + this.trade.getID();
    }
    return "SELECT `id`,`steamid`,`bot_steamid`,`mode`,`status`,`status_info`, `item_id`, `shop_type`, `scrapPrice`, `last_update_date` FROM "
            + "(SELECT `id`,`steamid`,`mode`,`status`,`status_info`,`last_update_date`,`bot_steamid` FROM shop_trades WHERE steamid='" + this.trade.partner.getSteamid() + "' " + additionalIdentifier + " ORDER BY last_update_date DESC LIMIT 1) as myTrade "
            + "JOIN shop_trade_items ON myTrade.id=shop_trade_items.trade_id ";
};
TradeDb.prototype._getSaveQuery = function () {
    return "INSERT INTO `shop_trades` (`steamid`,`mode`,`status`,`status_info`,`bot_steamid`) VALUES ("
            + "'" + this.trade.partner.getSteamid() + "',"
            + "'" + this.trade.getMode() + "',"
            + "'" + this.trade.getStatus() + "',"
            + "'" + this.trade.getStatusInfo() + "',"
            + "'" + this.trade.getBotSteamid() + "'"
            + ");";
};
TradeDb.prototype._getSaveItemsQuery = function () {
    if (!isNaN(this.trade.getID())) {
        var query = "INSERT INTO `shop_trade_items` (`trade_id`,`item_id`,`shop_type`,`scrapPrice`) VALUES ";
        var assets = this.trade.getAssets();
        for (var i = 0; i < assets.length; i += 1) {
            var asset = assets[i];
            query += "(" + this.trade.getID() + "," + asset.getItem().id + ",'" + asset.getShopType() + "'," + asset.getPrice().toScrap() + "), ";
        }
        return query.slice(0, query.length - 2) + " ON DUPLICATE KEY UPDATE item_id=item_id";
    } else {
        this.log.error("Can't save trade items on database, missing trade_id");
    }
};