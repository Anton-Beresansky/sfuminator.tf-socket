module.exports = TF2Item;

var TF2Price = require("./tf2Price.js");
var Qualities = [
    "Normal", "Genuine", "rarity2", "Vintage", "rarity3",
    "Unusual", "Unique", "Community", "Valve", "Self-Made",
    "Customized", "Strange", "Completed", "Haunted",
    "Collector's", "Decorated Weapon"
];

function TF2Item(item, owner) {
    for (var property in item) {
        if (item.hasOwnProperty(property)) {
            this[property] = item[property];
        }
    }
    this.owner = owner;
}

TF2Item.prototype.getFullName = function () {
    if (!this.full_name) {
        var qualityName = this.getQualityName();
        this.full_name = ((qualityName === "Unique") ? "" : (qualityName + " ")) + this.getName();
    }
    return this.full_name;
};

TF2Item.prototype.getOwner = function () {
    return this.owner;
};

TF2Item.prototype.getName = function () {
    return this.name;
};

TF2Item.prototype.getQualityName = function () {
    return Qualities[this.getQuality()];
};

TF2Item.prototype.getQuality = function () {
    return this.quality;
};

TF2Item.prototype.isHat = function () {
    return (this.hasOwnProperty("item_type_name") && (this.item_type_name === "#TF_Wearable_Hat")) || (this.item_type_name === "Hat") || (this.craft_material_type === "hat");
};

TF2Item.prototype.isTradable = function () {
    return !this.hasOwnProperty("flag_cannot_trade") || !this.flag_cannot_trade;
};

TF2Item.prototype.isCraftable = function () {
    return !this.hasOwnProperty("flag_cannot_craft") || !this.flag_cannot_craft;
};

TF2Item.prototype.isPriced = function () {
    return this.hasOwnProperty("absolute_price") && !isNaN(this.absolute_price);
};

TF2Item.prototype.getPrice = function () {
    if (this.isPriced()) {
        return new TF2Price(this.absolute_price);
    } else {
        return new TF2Price(0);
    }
};