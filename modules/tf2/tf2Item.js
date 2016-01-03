module.exports = TF2Item;

var Price = require("../price.js");
var TF2Constants = require("./tf2Constants.js");

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

TF2Item.prototype.getID = function () {
    return this.id;
};

TF2Item.prototype.getOriginalID = function () {
    return this.original_id;
};

/**
 * Returns tf2 formatted name: quality if needed + item name
 * @returns {String}
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
 * @returns {String}
 */
TF2Item.prototype.getName = function () {
    return this.item_name;
};

/**
 * Get decoded item quality
 * @returns {String}
 */
TF2Item.prototype.getQualityName = function () {
    return TF2Constants.qualities[this.getQuality()];
};

/**
 * Get item quality given from steam
 * @returns {Number}
 */
TF2Item.prototype.getQuality = function () {
    return this.quality;
};

TF2Item.prototype.getLevel = function () {
    return this.level;
};

TF2Item.prototype.getDefindex = function () {
    return this.defindex;
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

/**
 * Get item price
 * @returns {Price}
 */
TF2Item.prototype.getPrice = function () {
    if (this.isPriced()) {
        return new Price(this.absolute_price);
    } else {
        return new Price(0);
    }
};

/**
 * Establish if item is hat.
 *
 * Following parameters are checked:
 * - item_type_name =? #TF_Wearable_Hat
 * Automatically identify item as a hat -> it means item is hat and craftable with other hats
 *
 * - item_type_name =? Hat
 * Will identify a general cosmetic as craftable with other hats, therefore considering the item implicitly hat
 * @returns {Boolean}
 */
TF2Item.prototype.isHat = function () {
    return (this.hasOwnProperty("item_type_name") && (this.item_type_name === "#TF_Wearable_Hat")) || (this.item_type_name === "Hat") || (this.craft_material_type === "hat");
};

/**
 * Establish if item is Currency
 * Scrap, Reclaimed, Refined and Mann Co Key defindex are checked
 * @returns {boolean}
 */
TF2Item.prototype.isCurrency = function () {
    return (this.defindex === TF2Constants.defindexes.ScrapMetal
    || this.defindex === TF2Constants.defindexes.ReclaimedMetal
    || this.defindex === TF2Constants.defindexes.RefinedMetal
    || this.defindex === TF2Constants.defindexes.MannCoKey) && this.isTradable();
};

/**
 * Get hex paint color if any, should be used alongside TF2Item.isPainted method
 * @returns {String}
 */
TF2Item.prototype.getPaintColor = function () {
    return this.getAttribute(142).getFloatValue().toString(16);
};

TF2Item.prototype.isPainted = function () {
    return this.attributeExist(142);
};

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

TF2Attribute.prototype.getValue = function () {
    return this.value;
};

TF2Attribute.prototype.getFloatValue = function () {
    return this.float_value;
};

TF2Attribute.prototype.getDefindex = function () {
    return this.defindex;
};