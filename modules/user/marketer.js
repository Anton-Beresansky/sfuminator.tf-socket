module.exports = Marketer;

var Section = require("../shop/shopSection.js");
var Market = require("../market.js");
var TF2Item = require("../tf2/tf2Item.js");

/**
 * @param user {User}
 * @constructor
 */
function Marketer(user) {
    this.user = user;
    this.db = this.user.db;
    this.sfuminator = this.user.sfuminator;
    this.shop = this.sfuminator.shop;
    this.market = this.shop.market;
    this.backpacksApi = this.shop.webApi.backpacks;
    this.queries = Marketer.QUERIES;
}

/**
 * @returns {Section}
 */
Marketer.prototype.getSection = function () {
    return this.section ? this.section : this.createSection();
};

Marketer.prototype.createSection = function () {
    this.section = new Section(this.shop, "marketer");
    var items = this.getItems();
    for (var i = 0; i < items.length; i += 1) {
        this.section.add(items[i]);
    }
    this.section.commit();
    return this.section;
};


Marketer.prototype.getItems = function () {
    var marketedItems = [];
    var marketItems = this.market.items;
    for (var i = 0; i < marketItems.length; i += 1) {
        if (marketItems[i].getMarketerSteamid() === this.user.getSteamid() && marketItems[i].isAvailable()) {
            marketedItems.push(marketItems[i].getShopItem());
        }
    }
    return marketedItems;
};

Marketer.prototype.fetchItemsHistory = function (callback) {
    this.backpacksApi.fetchItems(this.queries.selectMarketedSoldItems(this.user.getSteamid()), function (result) {
        var items = [];
        for (var i = 0; i < result.length; i += 1) {
            items.push(new MarketerHistoryItem(result[i]).valueOf());
        }
        callback(items);
    });
};

Marketer.QUERIES = {
    selectMarketedSoldItems: function (steamid) {
        return "SELECT "
            + "item_id,market_price,taxed_price,last_update_date as sell_date "
            + "FROM "
            + "my_sfuminator.marketed_items "
            + "WHERE my_sfuminator.marketed_items.owner='" + steamid + "' "
            + "AND my_sfuminator.marketed_items.status=" + Market.ITEM_STATUS.SOLD + " "
            + "ORDER BY "
            + "my_sfuminator.marketed_items.last_update_date DESC "
            + "LIMIT 100";
    }
};

/**
 * @param dbData
 * @constructor
 */
function MarketerHistoryItem(dbData) {
    this.tf2Item = new TF2Item(dbData);
    this._dbRow = dbData._dbRow;
}

MarketerHistoryItem.prototype.valueOf = function () {
    var sellingTime = new Date(this._dbRow.sell_date).getTime() - new Date(this.tf2Item.last_update_date).getTime();
    if (sellingTime < 0) {
        sellingTime = 0;
    }
    return {
        id: this.tf2Item.getID(),
        name: this.tf2Item.getFullName(),
        image_url: this.tf2Item.getImageUrl(),
        quality: this.tf2Item.getQuality(),
        level: this.tf2Item.getLevel(),
        market_price: this._dbRow.market_price,
        taxed_price: this._dbRow.taxed_price,
        selling_time: sellingTime,
        sell_date: new Date(this._dbRow.sell_date)
    }
};