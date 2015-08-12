module.exports = ShopItemCount;

var Logs = require("../../lib/logs.js");

function ShopItemCount() {
    this.log = new Logs("Item count");
    this._counters = [];
}

ShopItemCount.prototype.update = function (toAdd, toRemove) {
    this.log.debug("Updating...");
    for (var i = 0; i < toAdd.length; i += 1) {
        this.add(toAdd[i]);
    }
    for (var i = 0; i < toRemove.length; i += 1) {
        this.remove(toRemove[i]);
    }
};

ShopItemCount.prototype.add = function (item) {
    this._inject(item, "increase");
};

ShopItemCount.prototype.remove = function (item) {
    this._inject(item, "decrease");
};

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

ShopItemCount.prototype.get = function (item) {
    var index = this.getIndex(item);
    if (index >= 0) {
        return this._counters[index];
    } else {
        return this.makeCounter(item);
    }
};

ShopItemCount.prototype.getIndex = function (item) {
    for (var i = 0; i < this._counters.length; i += 1) {
        if (this._counters[i].canAdd(item)) {
            return i;
        }
    }
    return -1;
};

ShopItemCount.prototype.makeCounter = function (item) {
    return new ShopItemCounter({defindex: item.defindex, quality: item.quality});
};

function ShopItemCounter(indentifiers) {
    this.count = 0;
    this.identifiers = indentifiers;
}

ShopItemCounter.prototype.increase = function () {
    this.count += 1;
};

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

ShopItemCounter.prototype.canAdd = function (item) {
    for (var property in this.identifiers) {
        if (this.identifiers[property] !== item[property]) {
            return false;
        }
    }
    return true;
};