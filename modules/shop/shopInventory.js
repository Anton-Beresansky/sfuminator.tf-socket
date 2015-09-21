module.exports = ShopInventory;

var events = require("events");
var Logs = require("../../lib/logs.js");
var TF2Price = require("../tf2/tf2Price.js");
var ItemVersioning = require("../../lib/dataVersioning.js");

/**
 * Shop Inventory, contains full backpack with tf2 formatted items
 * @param {Shop} shop
 * @param {String[]} inventoryBots
 * @returns {ShopInventory}
 */
function ShopInventory(shop, inventoryBots) {
    this.shop = shop;
    this.sfuminator = shop.sfuminator;
    this.users = shop.sfuminator.users;
    this.db = shop.db;
    this.log = new Logs({applicationName: "Shop Inventory", color: "green"});
    this.log.setLevel(3);
    this.bots = [];
    for (var i = 0; i < inventoryBots.length; i += 1) {
        this.bots.push(this.users.get(inventoryBots[i]));
    }
    this.versioning = new ItemVersioning(10, "inventory");
    /**
     * Full TF2item list
     * @type {TF2Item[]}
     */
    this.items = []; //Full backpack with tf2 formatted items
    this.count = []; //[{defindex: Int, quality: Int, craftable: Bool, count: Int}]
    this.decay = 2500;
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
    this.fetchItems(function (newItems) {
        var itemsToAdd = self._parseItemsToAdd(newItems);
        var itemsToRemove = self._parseItemsToRemove(newItems);
        self.versioning.add(itemsToAdd, itemsToRemove);
        self._removeOldItems(itemsToRemove);
        self._injectNewItems(itemsToAdd);
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
ShopInventory.prototype.fetchItems = function (callback) {
    var self = this;
    if (this.fetching) {
        this.log.warning("Fetching items... callback is busy, skipping.");
        return;
    }
    this.fetching = true;
    var fetchCounter = 0;
    var allItems = [];
    for (var i = 0; i < this.bots.length; i += 1) {
        this.bots[i].tf2Backpack.get(function (backpack) {
            fetchCounter += 1;
            if (backpack.hasErrored() && backpack._error_code !== "#database_backpack") {
                self.log.warning("Couldn't fetch bot " + backpack.getOwner() + " inventory" + ((backpack.items.length === 0) ? " (items empty)" : ""));
            } else {
                allItems = allItems.concat(backpack.items);
            }
            if (fetchCounter === self.bots.length) {
                self.fetching = false;
                callback(allItems);
            }
        });
    }
};

/**
 * Get user instace of the given bot steamid, should be used alongside Shop.isBot
 * @param {String} steamid
 * @returns {User|Boolean} Will return false if bot doesn't exist
 */
ShopInventory.prototype.getBot = function (steamid) {
    for (var i = 0; i < this.bots.length; i += 1) {
        if (this.bots[i].getSteamid() === steamid) {
            return this.bots[i];
        }
    }
    this.log.error("Bot " + steamid + " doesn't exist");
    return false;
};

/**
 * Get TF2Item given item id
 * @param {Number} itemID
 * @returns {TF2Item}
 */
ShopInventory.prototype.getItem = function (itemID) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === itemID) {
            return this.items[i];
        }
    }
    return false;
};

/**
 * Parse shop type from TF2Item
 * @param {TF2Item} item
 * @returns {String}
 */
ShopInventory.prototype.parseType = function (item) {
    if (item.isPriced() && item.isTradable()) {
        if (item.isHat() && item.isCraftable()) {
            if (item.getPrice().toMetal() <= this.shop.ratio.hats.weSell.maximum) {
                return "hats";
            }
        }
    }
    return "";
};

/**
 * Inject list of TF2Items to add
 * @param {TF2Item[]} itemsToAdd
 */
ShopInventory.prototype._injectNewItems = function (itemsToAdd) {
    this.items = this.items.concat(itemsToAdd);
};

/**
 * Remove given TF2Items from the inventory
 * @param {TF2Item[]} itemsToRemove
 */
ShopInventory.prototype._removeOldItems = function (itemsToRemove) {
    var itemsLength = this.items.length;
    for (var j = 0; j < itemsToRemove.length; j += 1) {
        for (var i = 0; i < itemsLength; i += 1) {
            if (this.items[i].id === itemsToRemove[j].id) {
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
ShopInventory.prototype._parseItemsToAdd = function (newItems) {
    var itemsToAdd = [];
    for (var j = 0; j < newItems.length; j += 1) {
        for (var i = 0; i < this.items.length; i += 1) {
            var found = false;
            if (this.items[i].id === newItems[j].id) {
                found = true;
                break;
            }
        }
        if (!found) {
            itemsToAdd.push(newItems[j]);
        }
    }
    return itemsToAdd;
};

/**
 * Parse items to remove given new item list
 * @param {TF2Item[]} newItems
 * @returns {TF2Item[]} itemsToRemove
 */
ShopInventory.prototype._parseItemsToRemove = function (newItems) {
    var itemsToRemove = [];
    for (var i = 0; i < this.items.length; i += 1) {
        for (var j = 0; j < newItems.length; j += 1) {
            var found = false;
            if (this.items[i].id === newItems[j].id) {
                found = true;
                break;
            }
        }
        if (!found && !this.getBot(this.items[i].getOwner()).getTF2Backpack().hasErrored()) {
            itemsToRemove.push(this.items[i]);
        }
    }
    return itemsToRemove;
};