module.exports = Market;

var Price = require('./price.js');
var LogLog = require('log-log');
var events = require("events");

/*

 TODO Add market guidelines to help section
 > Keys and metal are subject to TF2 economy. When the item will be sold you will get the stated amount of metal (not keys).
 > Price priority and price bands
 > Withdraw "we don't have enough currency"

 TODO Add price priority handler

 TODO Check items quantity limits -> might be messed up since many types have been added

 TODO LIMITS
 > prevent from having more than 10 marketed items per user
 > set a maximum market price
 > check that market prices don't interfere with the maximum 6 keys thing when shopping

 TODO Maybe we can change trade offer message for market trades?

 */

// REMEMBER! item_id is the item id at the time it has been marketed.
// This will link the only owner at the time of trade


/**
 * @param shop {Shop}
 * @constructor
 */
function Market(shop) {
    /**
     * @type {Shop}
     */
    this.shop = shop;
    /**
     * @type {Sfuminator}
     */
    this.sfuminator = this.shop.sfuminator;
    this.db = this.shop.db;
    this.queries = Market.QUERIES;
    /**
     * @type {MarketItem[]}
     */
    this.items = [];
    this.log = LogLog.create({applicationName: "market", color: "cyan", dim: true});
    events.EventEmitter.call(this);
}

require("util").inherits(Market, events.EventEmitter);

Market.prototype.load = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.createTable(), function () {
            self.loadItems(connection, function () {
                connection.release();
                callback();
            });
        });
    });
};

Market.prototype.loadItems = function (connection, callback) {
    var self = this;
    connection.query(this.queries.loadItems(), function (result) {
        for (var i = 0; i < result.length; i += 1) {
            self.items.push(new MarketItem(self.shop, result[i]));
        }
        callback();
    });
};

Market.prototype.marketerExists = function (steamid) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].getMarketer() === steamid) {
            return true;
        }
    }
    return false;
};

Market.prototype.itemExists = function (shopId) {
    return this.getItem(shopId) !== false;
};

/**
 * @param shopId
 * @returns {MarketItem}
 */
Market.prototype.getItem = function (shopId) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].shop_id === shopId) {
            return this.items[i];
        }
    }
    return false;
};

/**
 * @param shopItem {ShopItem}
 */
Market.prototype.setItemAsSold = function (shopItem) {
    if (shopItem.isMarketed()) { //Just as precaution :3
        this.updateItemStatus(shopItem, Market.ITEM_STATUS.SOLD);
        var marketItem = this.getItem(shopItem.getID());
        var user = this.sfuminator.users.get(shopItem.getMarketer());
        user.getWallet().updateBalance(marketItem.getTaxedPrice().toScrap());
        user.getMarketerSection().remove(shopItem).commit();
    }
};

Market.prototype.setItemAsWithdrawn = function (shopItem) {
    if (shopItem.isMarketed()) {
        this.updateItemStatus(shopItem, Market.ITEM_STATUS.WITHDRAWN);
        var user = this.sfuminator.users.get(shopItem.getMarketer());
        user.getMarketerSection().remove(shopItem).commit();
    }
};

Market.prototype.setItemAsAvailable = function (shopItem) {
    //When setting item as available we have to make sure that item has a shop id
    //If it's still a partner item we can get the loaded market item, if not we can link a new shop id
    shopItem = this.shop.inventory.makeShopItem(shopItem.getItem())
        || this.shop.inventory.getItem(this.shop.inventory.ids.make(shopItem));
    if (shopItem.isMarketed()) {
        this.updateItemStatus(shopItem, Market.ITEM_STATUS.AVAILABLE);
        var user = this.sfuminator.users.get(shopItem.getMarketer());
        user.getMarketerSection().add(shopItem).commit();
    }
};

Market.prototype.updateItemStatus = function (shopItem, status) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].shop_id === shopItem.getID()) {
            this.items[i].status = status;
            break;
        }
    }
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.updateItemStatus(shopItem.getID(), status), function () {
            connection.release();
        });
    })
};

/**
 * @param tradeAssets {ShopItem[]}
 * @param itemsStatus {[number]}
 */
Market.prototype.importItems = function (tradeAssets, itemsStatus) {
    var shopItems = [];
    for (var i = 0; i < tradeAssets.length; i += 1) {
        if (!tradeAssets[i].isMarketItem()) {
            this.log.error(tradeAssets[i].getItem().getID() + " is not market item!?!?!?");
        }
        shopItems.push(this.shop.inventory.makeShopItem(tradeAssets[i].getItem())
            || this.shop.inventory.getItem(this.shop.inventory.ids.make(tradeAssets[i])));
        shopItems[i].getItem().injectPrice(tradeAssets[i].getPrice()); //Inject market price
    }
    if (shopItems.length) {
        this.log.debug("Importing " + shopItems.length + " assets to Market for " + shopItems[0].getOwner());
        this._databaseImport(shopItems, itemsStatus);
        this._localImport(shopItems, itemsStatus);
    }
};

Market.prototype.cancelInTransitItems = function (assets) {
    this.log.debug("Cancelling in transit items...");
    for (var i = 0; i < assets.length; i += 1) {
        var itemId = assets[i].getItem().getID();
        for (var p = 0; p < this.items.length; p += 1) {
            if (this.items[p].item_id === itemId) {
                if (this.items[p].status !== Market.ITEM_STATUS.IN_TRANSIT) {
                    this.log.error(itemId + " Item is not market as in transit?!");
                } else {
                    this.items.splice(p, 1);
                }
                break;
            }
        }
    }
    var self = this;
    if (assets.length) {
        this.db.connect(function (connection) {
            connection.query(self.queries.cancelInTransitItems(assets), function () {
                connection.release();
            });
        });
    }
};

Market.prototype.getShopTradePrices = function (idList) {
    var prices = {};
    for (var i = 0; i < idList.length; i += 1) {
        for (var p = 0; p < this.items.length; p += 1) {
            if (this.items[p].item_id === idList[i]) {
                prices[idList[i]] = this.items[p].market_price.toScrap();
                break;
            }
        }
    }
    return prices;
};

/**
 * @param shopItems {ShopItem[]}
 * @param itemsStatus
 * @private
 */
Market.prototype._localImport = function (shopItems, itemsStatus) {
    for (var i = 0; i < shopItems.length; i += 1) {
        var item = shopItems[i];
        this.items.push(new MarketItem(this.shop, {
            shop_id: item.getID(),
            item_id: item.getItem().getID(),
            owner: item.getOwner(),
            market_price: item.getPrice().toScrap(),
            taxed_price: item.shop.marketToTaxedPrice(item.getPrice()).toScrap(),
            status: (!isNaN(itemsStatus) ? itemsStatus : Market.ITEM_STATUS.AVAILABLE),
            last_update_date: new Date()
        }));
    }
};

Market.prototype._databaseImport = function (shopItems, itemsStatus) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.insertItems(shopItems, itemsStatus), function () {
            connection.release();
        });
    });
};

Market.QUERIES = {
    insertItems: function (shopItems, itemsStatus) {
        var query = "INSERT INTO `marketed_items` (`shop_id`, `item_id`, `owner`, `market_price`, `taxed_price`, `status`, `last_update_date`) VALUES ";
        for (var i = 0; i < shopItems.length; i += 1) {
            var item = shopItems[i];
            query += "(" + item.getID() + "," + item.getItem().getID() + ",'" + item.getOwner() + "',"
                + item.getPrice().toScrap() + "," + item.shop.marketToTaxedPrice(item.getPrice()).toScrap()
                + "," + (!isNaN(itemsStatus) ? itemsStatus : Market.ITEM_STATUS.AVAILABLE) + ", NOW()), ";
        }
        return query.slice(0, query.length - 2) + " ON DUPLICATE KEY UPDATE " +
            "`market_price`=VALUES(`market_price`), `taxed_price`=VALUES(`taxed_price`), `status`=VALUES(`status`), `last_update_date`=NOW()";

    },
    updateItemStatus: function (shopItemID, status) {
        return "UPDATE `marketed_items` SET `status`=" + status + ", `last_update_date`=NOW() WHERE `shop_id`=" + shopItemID;
    },
    cancelInTransitItems: function (shopItems) {
        var query = "UPDATE `marketed_items` SET `status`=" + Market.ITEM_STATUS.CANCELLED + " WHERE `item_id` IN(";
        for (var i = 0; i < shopItems.length; i += 1) {
            var item = shopItems[i];
            query += item.getItem().getID() + ", ";
        }
        return query.slice(0, query.length - 2) + ")";

    },
    loadItems: function () {
        return "SELECT `shop_id`,`item_id`,`owner`,`market_price`,`taxed_price`,`status`,`last_update_date` FROM `marketed_items` " +
            "WHERE `status`=" + Market.ITEM_STATUS.AVAILABLE + " OR `status`=" + Market.ITEM_STATUS.IN_TRANSIT;
    },
    createTable: function () {
        return "CREATE TABLE IF NOT EXISTS `marketed_items` ("
            + "`shop_id` bigint(20),"
            + "`item_id` bigint(20),"
            + "`owner` VARCHAR(17), "
            + "`market_price` INT, "
            + "`taxed_price` INT, "
            + "`status` TINYINT, "
            + "`last_update_date` DATETIME,"
            + "PRIMARY KEY (`shop_id`,`item_id`),"
            + "KEY (`owner`)"
            + ")"
            + "ENGINE = InnoDB "
            + "DEFAULT CHARACTER SET = utf8 "
            + "COLLATE = utf8_bin";
    }
};

Market.ITEM_STATUS = {
    SOLD: 0, //Item successfully sold through shop
    AVAILABLE: 1, //Item is available in shop
    IN_TRANSIT: 2, //Item is being transferred from user to shop
    CANCELLED: 3, //When marketing item user cancelled transaction
    WITHDRAWN: 4 //Item has been withdrawn from shop
};

/**
 * @param shop {Shop}
 * @param data {object}
 * @constructor
 */
function MarketItem(shop, data) {
    this.shop = shop;
    this.shop_id = data.shop_id;
    this.item_id = data.item_id;
    this.owner = data.owner;
    this.market_price = new Price(data.market_price, "scrap");
    this.taxed_price = new Price(data.taxed_price, "scrap");
    this.status = data.status;
    this.last_update_date = new Date(data.last_update_date);
}

/**
 * @returns {String}
 */
MarketItem.prototype.getMarketer = function () {
    return this.owner;
};

MarketItem.prototype.getPrice = function () {
    return this.market_price;
};

MarketItem.prototype.getTaxedPrice = function () {
    return this.taxed_price;
};

MarketItem.prototype.getShopItem = function () {
    return this.shop.getItem(this.shop_id);
};

MarketItem.prototype.isAvailable = function () {
    return this.status === Market.ITEM_STATUS.AVAILABLE && this.getShopItem();
};