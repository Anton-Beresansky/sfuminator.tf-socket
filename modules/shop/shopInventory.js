module.exports = ShopInventory;

var events = require("events");
var Logs = require("../../lib/logs.js");
var Price = require("../price.js");
var ItemVersioning = require("../../lib/dataVersioning.js");
var ShopItem = require("./inventory/shopItem.js");
var ShopItemIds = require("./inventory/shopItemIds.js");

/**
 * Shop Inventory, contains full backpack with tf2 formatted items
 * @class ShopInventory
 * @param {Shop} shop
 * @returns {ShopInventory}
 */
function ShopInventory(shop) {
    this.shop = shop;
    this.sfuminator = shop.sfuminator;
    this.users = shop.sfuminator.users;
    this.db = shop.db;
    this.bots = this.shop.bots;

    this.log = new Logs({applicationName: "Shop Inventory", color: "green"});
    this.log.setLevel(100);
    this.ids = new ShopItemIds(this.db);
    this.versioning = new ItemVersioning(10, "inventory");
    /**
     * Full Shop Items list
     * @type {ShopItem[]}
     */
    this.items = [];
    this.count = []; //[{defindex: Int, quality: Int, craftable: Bool, count: Int}]
    this.last_update_date = 0;
    this.fetching = false;

    events.EventEmitter.call(this);
}

require("util").inherits(ShopInventory, events.EventEmitter);

/**
 * Update shop inventory
 * @param {Function} [callback]
 * Callback will return ShopInventory.items
 */
ShopInventory.prototype.update = function (callback) {
    var self = this;
    this.fetchTF2Items(function (newItems) {
        var itemsToAdd = self._parseTF2ItemsToAdd(newItems);
        var itemsToRemove = self._parseTF2ItemsToRemove(newItems);
        self.versioning.add(itemsToAdd, itemsToRemove);
        self.removeItems(itemsToRemove);
        self.addItems(itemsToAdd);
        if (itemsToAdd.length || itemsToRemove.length) {
            self.emit("new", self.versioning.getLatest());
        }
        self.last_update_date = new Date();
        if (typeof callback === "function") {
            callback(self.items);
        }
    });
};

/**
 * Fetch shop items
 * @param {Function} callback
 * Callback will return full tf2 item list
 */
ShopInventory.prototype.fetchTF2Items = function (callback) {
    var self = this;
    if (this.fetching) {
        this.log.warning("Fetching items... callback is busy, skipping.");
        return;
    }
    this.fetching = true;
    var allItems = [], i = 0;

    var fetchNext = function () {
        self.bots[i].getTF2Backpack().get(function (backpack) {
            if (backpack.hasErrored() && backpack._error_code !== "#database_backpack") {
                self.log.warning("Couldn't fetch bot " + backpack.getOwner() + " inventory" + ((backpack.getItems().length === 0) ? " (items empty)" : ""));
            } else {
                allItems = allItems.concat(backpack.items);
            }
            if (i === self.bots.length) {
                self.fetching = false;
                callback(allItems);
            } else {
                i += 1;
                fetchNext();
            }
        });
    };
    fetchNext();
};

/**
 * Get Shop Item given item id
 * @param {Number} itemID id
 * @returns {ShopItem}
 */
ShopInventory.prototype.getItem = function (itemID) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].getID() === itemID) {
            return this.items[i];
        }
    }
    return false;
};

/**
 * Inject list of Shop Items to add
 * @param {ShopItem[]} itemsToAdd
 */
ShopInventory.prototype.addItems = function (itemsToAdd) {
    this.items = this.items.concat(itemsToAdd);
};

/**
 * Remove given Shop Items from the inventory
 * @param {ShopItem[]} itemsToRemove
 */
ShopInventory.prototype.removeItems = function (itemsToRemove) {
    var itemsLength = this.items.length;
    for (var j = 0; j < itemsToRemove.length; j += 1) {
        for (var i = 0; i < itemsLength; i += 1) {
            if (this.items[i].getID() === itemsToRemove[j].getID()) {
                this.items.splice(i, 1);
                itemsLength = this.items.length;
                break;
            }
        }
    }
};

/**
 * Parse items to add given new item list
 * @param {TF2Item[]} newItems
 * @returns {TF2Item[]} itemsToAdd
 */
ShopInventory.prototype._parseTF2ItemsToAdd = function (newItems) {
    var itemsToAdd = [];

    for (var i = 0; i < newItems.length; i += 1) {

        var item_exist = false;
        for (var z = 0; z < this.items.length; z += 1) {
            if (this.items[z].isTF2Item()) {
                if (newItems[i].getOriginalID() === this.items[z].getItem().getOriginalID()) {
                    item_exist = true;
                    //If item already exist, tf2item gets updated
                    //This will handle new ids due to bot ownership change
                    this.items[z].item = newItems[i];
                    break;
                }
            }
        }

        if (!item_exist) {
            itemsToAdd.push(this.makeShopItem(newItems[i]));
        }
    }

    return itemsToAdd;
};

/**
 * Parse items to remove given new item list
 * @param {TF2Item[]} newItems
 * @returns {ShopItem[]} itemsToRemove
 */
ShopInventory.prototype._parseTF2ItemsToRemove = function (newItems) {
    var itemsToRemove = [];

    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].isTF2Item()) {

            var item_exist = false;
            for (var j = 0; j < newItems.length; j += 1) {
                if (this.items[i].getItem().getOriginalID() === newItems[j].getOriginalID()) {
                    item_exist = true;
                    break;
                }
            }

            if (!item_exist && !this.shop.getBotUser(this.items[i].getItem().getOwner()).getTF2Backpack().hasErrored()) {
                itemsToRemove.push(this.items[i]);
                this.ids.unlink(this.items[i]);
            }
        }
    }

    return itemsToRemove;
};

/**
 * Make shop item
 * @param {TF2Item} item
 * @returns {ShopItem}
 */
ShopInventory.prototype.makeShopItem = function (item) {
    var shopItem = new ShopItem(this.shop, item);
    shopItem.setID(this.ids.make(shopItem));
    return shopItem;
};