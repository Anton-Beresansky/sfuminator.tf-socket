module.exports = ShopInventory;

var events = require("events");
var Logs = require("../../lib/logs.js");
var TF2Price = require("../tf2/tf2Price.js");
var ItemVersioning = require("../../lib/dataVersioning.js");

function ShopInventory(shop, inventoryBots) {
    this.shop = shop;
    this.sfuminator = shop.sfuminator;
    this.users = shop.sfuminator.users;
    this.db = shop.db;
    this.log = new Logs("Shop Inventory");
    this.log.setLevel(3);
    this.bots = [];
    for (var i = 0; i < inventoryBots.length; i += 1) {
        this.bots.push(this.users.get(inventoryBots[i]));
    }
    this.versioning = new ItemVersioning(10, "inventory");
    this.items = []; //Full backpack item + shop identifier
    this.count = []; //[{defindex: Int, quality: Int, craftable: Bool, count: Int}]
    this.decay = 2500;
    this.last_update_date = 0;
    this.fetching = false;

    events.EventEmitter.call(this);
}

require("util").inherits(ShopInventory, events.EventEmitter);

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

ShopInventory.prototype.getBot = function (steamid) {
    for (var i = 0; i < this.bots.length; i += 1) {
        if (this.bots[i].getSteamid() === steamid) {
            return this.bots[i];
        }
    }
    this.log.error("Bot " + steamid + " doesn't exist");
    return false;
};

ShopInventory.prototype.getItem = function (itemID) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === itemID) {
            return this.items[i];
        }
    }
    return false;
};

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

ShopInventory.prototype._injectNewItems = function (itemsToAdd) {
    this.items = this.items.concat(itemsToAdd);
};

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