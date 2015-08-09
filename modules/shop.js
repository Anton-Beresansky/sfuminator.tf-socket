module.exports = Shop;
var events = require("events");
var Logs = require("../lib/logs.js");
var TF2Price = require("./tf2/tf2Price.js");
var TF2Currency = require("./tf2/tf2Currency.js");
var ShopRatio = require("./shop/shopRatio.js");
var ShopInventory = require("./shop/shopInventory.js");
var ItemVersioning = require("../lib/dataVersioning.js");
var Reservations = require("./shop/shopReservations.js");

//When updating internal item list and versioning items are patched
//Shop contains formatted items ready to use on client side

function Shop(sfuminator) {
    this.sfuminator = sfuminator;
    this.cloud = sfuminator.cloud;
    this.db = sfuminator.db;
    this.interrupts = sfuminator.interrupts;
    this.log = new Logs("Shop");
    this.ratio = new ShopRatio(this.db);
    this.tf2Currency = TF2Currency;
    this.tf2Currency.setCloud(this.cloud);
    this.bots = ["76561198195936315"];
    this.inventory = new ShopInventory(this, this.bots);
    this.reservations = new Reservations(this.db);
    this.instanceID = new Date().getTime();
    this.count = [];
    this.sections = {}; //{type: Section()}

    events.EventEmitter.call(this);
    var self = this;
    this.init();
    this.inventory.on("new", function (changes) {
        self.update(changes);
    });
}

require("util").inherits(Shop, events.EventEmitter);

Shop.prototype.init = function () {
    var self = this;
    self.ratio.updateHats(function () {
        self.tf2Currency.update(function () {
            self.reservations.load(function () {
                self.log.debug("Loading up inventory...");
                self.inventory.update(function () {
                    self.emit("ready");
                });
            });
        });
    });
};

Shop.prototype.update = function (_changes) {
    var changes = {add: _changes.toAdd, remove: _changes.toRemove};
    this.log.debug("Changes: " + JSON.stringify(changes, null, " "), 4);
    for (var action in changes) {
        for (var i = 0; i < changes[action].length; i += 1) {
            var shopType = changes[action][i].shopType;
            if (shopType) {
                var patchedItem = this.patchItem(changes[action][i]);
                if (!this.sections.hasOwnProperty(shopType)) {
                    this.sections[shopType] = new Section(shopType);
                }
                this.sections[shopType][action](patchedItem);
            }
        }
    }
    for (var type in this.sections) {
        this.sections[type].commit();
    }
    this.updateCount();
};

Shop.prototype.sectionExist = function (section) {
    return this.sections.hasOwnProperty(section);
};

Shop.prototype.getMine = function (backpack) {
    if (!backpack.hasErrored()) {
        return this.filterMineItems(backpack.items);
    } else {
        return {
            result: "error",
            message: backpack.getErrorMessage(),
            timestamp: parseInt(backpack.last_update_date.getTime() / 1000),
            items: this.filterMineItems(backpack.items)
        };
    }
};

Shop.prototype.filterMineItems = function (items) {
    var filteredItems = [];
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        if (this.canBeSold(item)) {
            filteredItems.push(this.patchItem(item));
        }
    }
    return filteredItems;
};

Shop.prototype.canBeSold = function (item) {
    return item.isHat() && item.isCraftable() && item.isTradable() && item.isPriced() && this.verifyMineItemPriceRange(item);
};

Shop.prototype.adjustMinePrice = function (item) {
    if (item.isHat()) {
        var finalPrice;
        var originalPrice = item.getPrice();
        if (originalPrice.toMetal() > this.ratio.hats.weBuy.maximum) {
            originalPrice = new TF2Price(this.ratio.hats.weBuy.maximum, "metal");
        }

        if (originalPrice.toMetal() === 1.66) {
            finalPrice = new TF2Price(this.ratio.hats.weBuy.default166, "metal");
        } else {
            var ratio = this.ratio.hats.weBuy.default;
            if (originalPrice.toMetal() <= 2) {
                ratio = this.ratio.hats.weBuy.lowTier;
            }
            finalPrice = new TF2Price(parseInt(originalPrice.toScrap() * ratio), "scrap");
        }

        if (finalPrice.toMetal() < this.ratio.hats.weBuy.minimum) {
            finalPrice = new TF2Price(this.ratio.hats.weBuy.minimum, "metal");
        }
        return finalPrice;
    } else {
        return null;
    }
};

Shop.prototype.verifyMineItemPriceRange = function (item) {
    if (item.isHat()) {
        var originalPrice = item.getPrice();
        return originalPrice.toMetal() <= (this.ratio.hats.weSell.maximum) && originalPrice.toMetal() >= this.ratio.hats.weSell.minimum;
    }
};

Shop.prototype.patchItem = function (item) {
    var relative_price = item.relative_price;
    var shopType = item.shopType;
    if (!this.isBot(item.getOwner())) {
        relative_price = this.adjustMinePrice(item).toMetal();
        shopType = "mine";
    }
    var reservation = this.reservations.get(item.id);
    return {
        id: item.id,
        defindex: item.defindex,
        level: item.level,
        quality: item.quality,
        name: item.name,
        image_url: item.image_url,
        image_url_large: item.image_url_large,
        used_by_classes: item.used_by_classes,
        relative_price: relative_price,
        currency: item.currency,
        reserved_to: reservation.getHolder(),
        shop: shopType
    };
};

Shop.prototype.isBot = function (steamid) {
    for (var i = 0; i < this.bots.length; i += 1) {
        if (this.bots[i] === steamid) {
            return true;
        }
    }
    return false;
};

Shop.prototype.updateCount = function () {
    this.log.debug("Updating item count");
    var newCount = [];
    for (var i = 0; i < this.inventory.items.length; i += 1) {
        var thisItem = this.inventory.items[i];
        if (thisItem.shopType !== "") {
            var index = this._getCountIndex(newCount, thisItem);
            if (index >= 0) {
                newCount[index].count += 1;
            } else {
                newCount.push({defindex: thisItem.defindex, quality: thisItem.quality, craftable: thisItem.isCraftable(), count: 1});
            }
        }
    }
    this.count = newCount;
};

Shop.prototype._getCountIndex = function (count, item) {
    for (var i = 0; i < count.length; i += 1) {
        var thisCount = count[i];
        if (thisCount.defindex === item.defindex && thisCount === item.quality && thisCount.craftable === item.isCraftable()) {
            return i;
        }
    }
    return -1;
};

Shop.prototype.getActiveTrades = function (callback) {
    var self = this;
    this.log.debug("Loading active trades...", 3);
    this.db.connect(function (connection) {
        connection.query(self._getActivePartnersQuery(), function (result, isEmpty) {
            connection.release();
            var partners_list = [];
            if (!isEmpty) {
                for (var i = 0; i < result.length; i += 1) {
                    partners_list.push({id: result[i].id, partnerID: result[i].steamid});
                }
            }
            callback(partners_list);
        });
    });
};

Shop.prototype._getActivePartnersQuery = function () {
    return "SELECT id,steamid FROM shop_trades WHERE status!='closed' OR last_update_date>='" + new Date(new Date() - ***REMOVED***0).toMysqlFormat() + "' ORDER BY last_update_date ASC";
};

//Section changes (add, remove) are applied only on commit

function Section(type) {
    this.type = type;
    this.items = [];
    this.toAdd = [];
    this.toRemove = [];
    this.versioning = new ItemVersioning(10, "section " + type);
    this.log = new Logs("Section " + type);
}

Section.prototype.getClientChanges = function (last_update_date) {
    last_update_date = new Date(last_update_date);
    if (last_update_date.toString() !== "Invalid Date") {
        this.log.debug("Getting changes: " + last_update_date, 3);
        var itemChanges = this.versioning.get(last_update_date);
        if (itemChanges) {
            itemChanges.date = itemChanges.date.getTime();
            return itemChanges;
        }
    }
    return false;
};

Section.prototype.itemExist = function (id) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === id) {
            return true;
        }
    }
    return false;
};

Section.prototype.getItems = function () {
    return this.items;
};

Section.prototype.add = function (item) {
    this.toAdd.push(item);
};

Section.prototype.remove = function (item) {
    this.toRemove.push(item);
};

Section.prototype.commit = function (date) {
    if (!date) {
        date = new Date();
    }
    var length = this.items.length;
    for (var i = 0; i < length; i += 1) {
        for (var j = 0; j < this.toRemove.length; j += 1) {
            if (this.items[i].id === this.toRemove[j].id) {
                this.items.splice(i, 1);
                length -= 1;
                break;
            }
        }
    }
    this.items = this.items.concat(this.toAdd);
    this.versioning.add(this.toAdd, this.toRemove, date);
    this.toAdd = [];
    this.toRemove = [];
    this.log.debug("Committed, items in stock: " + this.items.length);
};