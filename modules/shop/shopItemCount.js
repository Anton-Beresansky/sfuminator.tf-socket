module.exports = ShopItemCount;

var Logs = require("../../lib/logs.js");

/**
 * Keeps count of the items available in the shop
 * @returns {ShopItemCount}
 */
function ShopItemCount() {
    this.log = new Logs({applicationName: "Item count", color: "green", dim: true});
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
 * @param {ShopItem} item
 */
ShopItemCount.prototype.add = function (item) {
    this._inject(item, "increase");
};

/**
 * Will remove item from the counter
 * @param {ShopItem} item
 */
ShopItemCount.prototype.remove = function (item) {
    this._inject(item, "decrease");
};

/**
 * Inject ShopItem and action in order to change count
 * @param {ShopItem} item
 * @param {String} action (increase, decrease)
 */
ShopItemCount.prototype._inject = function (item, action) {
    if (item.getSectionID() !== "") {
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
 * @param {ShopItem} item
 * @returns {ShopItemCounter}
 */
ShopItemCount.prototype.get = function (item) {
    var index = this.getIndex(item);
    if (index >= 0) {
        return this._counters[index];
    } else {
        return this.makeCounter(item);
    }
};

/**
 * Get counter of a given item
 * @param {TF2Item} item
 * @returns {ShopItemCounter}
 */
ShopItemCount.prototype.getForTF2 = function (item) {
    var index = this.getTF2Index(item);
    if (index >= 0) {
        return this._counters[index];
    } else {
        return new ShopItemCounter({defindex: item.getDefindex(), quality: item.getQuality()});
    }
};

/**
 * Get index from counter list given item
 * @param {ShopItem} item
 * @returns {Number}
 */
ShopItemCount.prototype.getIndex = function (item) {
    for (var i = 0; i < this._counters.length; i += 1) {
        if (this._counters[i].canAddAsTF2(item.getItem())) {
            return i;
        }
    }
    return -1;
};

ShopItemCount.prototype.getTF2Index = function (item) {
    for (var i = 0; i < this._counters.length; i += 1) {
        if (this._counters[i].canAddAsTF2(item)) {
            return i;
        }
    }
    return -1;
};

/**
 * Make a new Shop Item Counter
 * @param {ShopItem} item
 * @returns {ShopItemCounter}
 */
ShopItemCount.prototype.makeCounter = function (item) {
    if (item.isTF2Item()) {
        return new ShopItemCounter({defindex: item.getItem().getDefindex(), quality: item.getItem().getQuality()});
    }
};

/**
 * General purpose Shop Item Counter Class
 * @param {Object} identifiers Parameters that identify this counter
 * @returns {ShopItemCounter}
 */
function ShopItemCounter(identifiers) {
    this.count = 0;
    this.identifiers = identifiers;
}

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
ShopItemCounter.prototype.canAddAsTF2 = function (item) {
    for (var property in this.identifiers) {
        if (this.identifiers[property] !== item[property]) {
            return false;
        }
    }
    return true;
};