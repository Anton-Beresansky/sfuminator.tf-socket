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

    this.log = new Logs({applicationName: "Shop Inventory", color: "green"});
    this.log.setLevel(3);
    this.ids = new ShopItemIds(this.db);
    this.versioning = new ItemVersioning(10, "inventory");
    /**
     * Full Shop Items list
     * @type {ShopItem[]}
     */
    this.items = [];
    this.last_update_date = 0;
    this.busyFetchAttempts = 0;
    this.fetching = false;

    events.EventEmitter.call(this);
}

require("util").inherits(ShopInventory, events.EventEmitter);

ShopInventory.MAX_BUSY_FETCH_ATTEMPTS = 5;

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
        if (this.busyFetchAttempts < ShopInventory.MAX_BUSY_FETCH_ATTEMPTS) {
            this.busyFetchAttempts += 1;
            return;
        } else {
            this.log.warning("Max busy fetch attempts reached, probably socket disconnected, ignoring busy state");
        }
    }
    this.busyFetchAttempts = 0;
    this.fetching = true;
    var allItems = [], i = 0, bots = this.shop.bots;

    var fetchNext = function () {
        if (i < bots.length) {
            self.log.debug("Fetching backpack " + bots[i].getSteamid(), 4);
            bots[i].getTF2Backpack().get(function (backpack) {
                if (backpack.hasErrored() && backpack._error_code !== "#database_backpack") {
                    self.log.warning("Couldn't fetch bot " + backpack.getOwner() + " inventory" + ((backpack.getItems().length === 0) ? " (items empty)" : ""));
                } else {
                    allItems = allItems.concat(backpack.items);
                }
                i += 1;
                fetchNext();
            });
        } else {
            self.fetching = false;
            callback(allItems);
        }
    };
    fetchNext();
};

/**
 * Get Shop Item from given shop item id
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
 * Get Shop Item from given steam real item id
 * @param {Number} itemID
 * @returns {ShopItem}
 */
ShopInventory.prototype.getItemFromRealId = function (itemID) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].getItem().getID() === itemID) {
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

        var found_new_id = true;
        for (var z = 0; z < this.items.length; z += 1) {
            if (this.items[z].isTF2Item()) {
                if (newItems[i].getID() === this.items[z].getItem().getID()) {
                    found_new_id = false;
                    this.items[z].item = newItems[i]; //Just to be sure
                    break;
                }
            }
        }

        if (found_new_id) {
            var itemToAdd = this.makeShopItem(newItems[i]);
            if (itemToAdd) {
                this.log.debug("Adding item to shop: " + itemToAdd.getID() + " ~ " + itemToAdd.getItem().getFullName(), 4);
                itemsToAdd.push(itemToAdd);
            }
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
    var itemsToRemove = [], i, j;

    for (i = 0; i < this.items.length; i += 1) {
        var oldShopItem = this.items[i];

        if (oldShopItem.isTF2Item()) {
            var item_exists = false;
            for (j = 0; j < newItems.length; j += 1) {
                if (oldShopItem.getItem().getID() === newItems[j].id) {
                    item_exists = true;
                    break;
                }
            }


            if (!item_exists) {
                //Heavy load procedure, just check if there's no match on item id
                this.log.debug("Detected different id, proceeding with lookup control");
                for (j = 0; j < newItems.length; j += 1) {
                    var newShopItem = new ShopItem(this.shop, newItems[j]);
                    if (this.ids.isLinked(newShopItem) && (oldShopItem.getID() === this.ids.lookup(newShopItem))) {
                        item_exists = true;
                        break;
                    }
                }
            }

            if (!item_exists
                && !this.shop.getBotUser(oldShopItem.getItem().getOwner()).getTF2Backpack().hasErrored()
                && !oldShopItem.isBeingTransferred()
            ) {
                this.log.debug("Removing item from shop: " + oldShopItem.getID() + " ~ " + oldShopItem.getItem().getFullName(), 4);
                itemsToRemove.push(oldShopItem);
                this.ids.unlink(oldShopItem);
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
    if (this.ids.isLinked(shopItem) && this.getItem(this.ids.lookup(shopItem))) {
        var itemID = this.ids.lookup(shopItem);
        for (var i = 0; i < this.items.length; i += 1) {
            if (this.items[i].getID() === itemID) {
                this.items[i].item = item;
                return;
            }
        }
    } else {
        shopItem.setID(this.ids.make(shopItem));
        return shopItem;
    }
};