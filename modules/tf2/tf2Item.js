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
    return this.item_name;
};

TF2Item.prototype.getQualityName = function () {
    return Qualities[this.getQuality()];
};

TF2Item.prototype.getQuality = function () {
    return this.quality;
};

TF2Item.prototype.isHat = function () { 
    //First parameter (item_type_name = #TF_Wearable_Hat) automatically identify item as a hat -> it means item is hat and craftable with other hats
    //Second parameter (item_type_name = Hat) will identify a general cosmetic as craftable with other hats, therefore considering the item implicitly hat
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

TF2Item.prototype.getPaintColor = function (){
    return this.getAttribute(142).getFloatValue().toString(16);
};

TF2Item.prototype.isPainted = function () {
    return this.attributeExist(142);
};

TF2Item.prototype.attributeExist = function (defindex) {
    return this.getAttribute(defindex).getDefindex() === defindex;
};

TF2Item.prototype.getAttribute = function (defindex) {
    if (this.hasOwnProperty("attributes") && this.attributes instanceof Array) {
        for (var i = 0; i < this.attributes.length; i += 1) {
            if (this.attributes[i].defindex === defindex) {
                return new TF2Attribute(this.attributes[i]);
            }
        }
    }
    return new TF2Attribute({});
};

function TF2Attribute(attribute) {
    this.defindex = attribute.defindex;
    this.value = attribute.value;
    this.float_value = attribute.float_value;
}

TF2Attribute.prototype.getValue = function () {
    return this.value;
};

TF2Attribute.prototype.getFloatValue = function () {
    return this.float_value;
};

TF2Attribute.prototype.getDefindex = function () {
    return this.defindex;
};