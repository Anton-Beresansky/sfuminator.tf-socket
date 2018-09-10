// Sfuminator.tf | Keeping track shop items stock

module.exports = ShopItemCount;

var LogLog = require("log-log");
var ShopItem = require("../../modules/shop/inventory/shopItem.js");
var TF2Item = require("../../modules/tf2/tf2Item.js");

/**
 * Keeps count of the items available in the shop
 * @class ShopItemCount
 * @returns {ShopItemCount}
 */
function ShopItemCount() {
    this.log = LogLog.create({applicationName: "Item count", color: "green", dim: true});
    this._counters = [];
}

/**
 * Update count
 * @param {ShopItem[]} toAdd
 * @param {ShopItem[]} toRemove
 */
ShopItemCount.prototype.update = function (toAdd, toRemove) {
    this.log.debug("Updating...");
    for (var i = 0; i < toAdd.length; i += 1) {
        this.add(toAdd[i]);
    }
    for (var i = 0; i < toRemove.length; i += 1) {
        this.remove(toRemove[i]);
    }
};

/**
 * Will add item to the counter
 * @param {TF2Item|ShopItem} _item
 */
ShopItemCount.prototype.add = function (_item) {
    var item = _item;
    if (_item instanceof ShopItem) {
        item = _item.getItem();
    }
    this._inject(item, "increase");
};

/**
 * Will remove item from the counter
 * @param {TF2Item|ShopItem} _item
 */
ShopItemCount.prototype.remove = function (_item) {
    var item = _item;
    if (_item instanceof ShopItem) {
        item = _item.getItem();
    }
    this._inject(item, "decrease");
};

/**
 * Inject TF2Item and action in order to change count
 * @param {TF2Item} item
 * @param {String} action (increase, decrease)
 */
ShopItemCount.prototype._inject = function (item, action) {
    if (item.shopType !== "") {
        var index = this.getIndex(item);
        if (index >= 0) {
            this._counters[index][action]();
        } else {
            var counter = this.makeCounter(item);
            counter[action]();
            this._counters.push(counter);
        }
    }
};

/**
 * Get counter of a given item
 * @param {TF2Item|ShopItem} _item
 * @returns {ShopItemCounter}
 */
ShopItemCount.prototype.get = function (_item) {
    var item = _item;
    if (_item instanceof ShopItem) {
        item = _item.getItem();
    }
    var index = this.getIndex(item);
    if (index >= 0) {
        return this._counters[index];
    } else {
        return this.makeCounter(item);
    }
};

/**
 * Get index from counter list given item
 * @param {TF2Item} item
 * @returns {Number}
 */
ShopItemCount.prototype.getIndex = function (item) {
    for (var i = 0; i < this._counters.length; i += 1) {
        if (this._counters[i].canAdd(item)) {
            return i;
        }
    }
    return -1;
};

/**
 * Make a new Shop Item Counter
 * @param {TF2Item} item
 * @returns {ShopItemCounter}
 */
ShopItemCount.prototype.makeCounter = function (item) {
    return new ShopItemCounter({defindex: item.defindex, quality: item.quality});
};

/**
 * General purpose Shop Item Counter Class
 * @class ShopItemCounter
 * @param {Object} identifiers Parameters that identify this counter
 * @returns {ShopItemCounter}
 */
function ShopItemCounter(identifiers) {
    this.count = 0;
    this.identifiers = identifiers;
}

/**
 * @returns {number}
 */
ShopItemCounter.prototype.getCount = function () {
    return this.count;
};

/**
 * Increase counter, should be used with ShopItemCounter.canAdd
 */
ShopItemCounter.prototype.increase = function () {
    this.count += 1;
};

/**
 * Decrease counter, should be used with ShopItemCounter.canAdd
 */
ShopItemCounter.prototype.decrease = function () {
    if (this.count > 0) {
        this.count -= 1;
    }
};

ShopItemCounter.prototype.valueOf = function () {
    /*var value = {};
     for (var property in this.identifiers) {
     value[property] = this.identifiers[property];
     }
     return value;*/
    return this.count;
};

/**
 * Check if certain item can increase/decrease this counter
 * @param {TF2Item} item
 * @returns {Boolean}
 */
ShopItemCounter.prototype.canAdd = function (item) {
    for (var property in this.identifiers) {
        if (this.identifiers[property] !== item[property]) {
            return false;
        }
    }
    return true;
};