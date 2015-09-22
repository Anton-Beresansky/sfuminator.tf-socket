module.exports = TF2Item;

var TF2Price = require("./tf2Price.js");
var Qualities = [
    "Normal", "Genuine", "rarity2", "Vintage", "rarity3",
    "Unusual", "Unique", "Community", "Valve", "Self-Made",
    "Customized", "Strange", "Completed", "Haunted",
    "Collector's", "Decorated Weapon"
];

/**
 * General purpose TF2Item class
 * @param {object} item (steam api tf2 item combined with schema and (optional) price)
 * @param {string} owner (steamid)
 * @returns {TF2Item}
 */
function TF2Item(item, owner) {
    for (var property in item) {
        if (item.hasOwnProperty(property)) {
            this[property] = item[property];
        }
    }
    this.owner = owner;
}

/**
 * Get TF2 Item ID
 * @returns {Number}
 */
TF2Item.prototype.getID = function () {
    return this.id;
};

/**
 * Returns tf2 formatted name: quality if needed + item name
 * @returns {TF2Item.item_name|String}
 */
TF2Item.prototype.getFullName = function () {
    if (!this.full_name) {
        var qualityName = this.getQualityName();
        this.full_name = ((qualityName === "Unique") ? "" : (qualityName + " ")) + this.getName();
    }
    return this.full_name;
};

/**
 * Get steamid of item owner
 * @returns {string}
 */
TF2Item.prototype.getOwner = function () {
    return this.owner;
};

/**
 * Get item name
 * @returns {TF2Item.item_name|String}
 */
TF2Item.prototype.getName = function () {
    return this.item_name;
};

/**
 * Get decoded item quality
 * @returns {String}
 */
TF2Item.prototype.getQualityName = function () {
    return Qualities[this.getQuality()];
};

/**
 * Get item quality
 * @returns {TF2Item.quality|Int}
 */
TF2Item.prototype.getQuality = function () {
    return this.quality;
};

/**
 * Establish if item is hat.
 * <br><br>
 * Following parameters are checked:<br>
 * - item_type_name =? #TF_Wearable_Hat<br>Automatically identify item as a hat -> it means item is hat and craftable with other hats
 * <br>
 * - item_type_name =? Hat<br>will identify a general cosmetic as craftable with other hats, therefore considering the item implicitly hat
 * @returns {Boolean}
 */
TF2Item.prototype.isHat = function () {
    return (this.hasOwnProperty("item_type_name") && (this.item_type_name === "#TF_Wearable_Hat")) || (this.item_type_name === "Hat") || (this.craft_material_type === "hat");
};

/**
 * Establish if item can be traded
 * @returns {Boolean}
 */
TF2Item.prototype.isTradable = function () {
    return !this.hasOwnProperty("flag_cannot_trade") || !this.flag_cannot_trade;
};

/**
 * Establish if item can be crafted
 * @returns {Boolean}
 */
TF2Item.prototype.isCraftable = function () {
    return !this.hasOwnProperty("flag_cannot_craft") || !this.flag_cannot_craft;
};

/**
 * Establish if item is priced
 * @returns {Boolean}
 */
TF2Item.prototype.isPriced = function () {
    return this.hasOwnProperty("absolute_price") && !isNaN(this.absolute_price);
};

/**
 * Get item price
 * @returns {TF2Price}
 */
TF2Item.prototype.getPrice = function () {
    if (this.isPriced()) {
        return new TF2Price(this.absolute_price);
    } else {
        return new TF2Price(0);
    }
};

/**
 * Get hex paint color if any, should be used alongside TF2Item.isPainted method
 * @returns {String}
 */
TF2Item.prototype.getPaintColor = function () {
    return this.getAttribute(142).getFloatValue().toString(16);
};

/**
 * Establish if item has paint attached to it
 * @returns {Boolean}
 */
TF2Item.prototype.isPainted = function () {
    return this.attributeExist(142);
};

/**
 * Check if given attribute defindex exist
 * @param {Number} defindex
 * @returns {Boolean}
 */
TF2Item.prototype.attributeExist = function (defindex) {
    return this.getAttribute(defindex).getDefindex() === defindex;
};

/**
 * Get attribute from defindex, can be used alongside TF2Item.attributeExist
 * @param {Number} defindex
 * @returns {TF2Attribute} TF2 Attribute with undefined values if doesn't exist
 */
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

/**
 * General purpose TF2Attribute class
 * @property {Number} defindex
 * @property {Number} value
 * @property {Number} float_value
 * @param {Number} attribute (defindex)
 * @returns {TF2Attribute}
 */
function TF2Attribute(attribute) {
    this.defindex = attribute.defindex;
    this.value = attribute.value;
    this.float_value = attribute.float_value;
}

/**
 * Get attribute's value
 * @returns {Int.value}
 */
TF2Attribute.prototype.getValue = function () {
    return this.value;
};

/**
 * Get attribute's float value
 * @returns {Int.float_value}
 */
TF2Attribute.prototype.getFloatValue = function () {
    return this.float_value;
};

/**
 * Get attribute's defindex
 * @returns {Int.defindex}
 */
TF2Attribute.prototype.getDefindex = function () {
    return this.defindex;
};