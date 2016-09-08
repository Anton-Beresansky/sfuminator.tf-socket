module.exports = TF2Item;

var Price = require("../price.js");
var TF2Constants = require("./tf2Constants.js");

/**
 * General purpose TF2Item class
 * @param {object} item (steam api tf2 item combined with schema and (optional) price)
 * @param {string} owner (steamid)
 * @returns {TF2Item}
 * @construct
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
 * Matching object
 * {
 *   param1: value
 *   param2: [value1, value2, value3]
 * }
 * Item will match if all given params are matching with at least 1 value
 * @param attributes
 * @returns {boolean}
 */
TF2Item.prototype.isMatchingWith = function (attributes) {
    var matching = true;
    for (var property in attributes) {
        if (this.hasOwnProperty(property)) {
            if (attributes[property] instanceof Array) {
                var found = false;
                for (var i = 0; i < attributes[property].length; i += 1) {
                    if (this[property] === attributes[property][i]) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    matching = false;
                    break;
                }
            } else if (this[property] !== attributes[property]) {
                matching = false;
                break;
            }
        } else {
            matching = false;
            break;
        }
    }
    return matching;
};

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
    return TF2Constants.namedQualities[this.getQuality()];
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

TF2Item.prototype.getImageUrl = function (large) {
    var image_url = this.image_url;
    if (large) {
        image_url = this.image_url_large;
    }
    if (image_url instanceof Array) {
        var url = image_url[0];
        if (this.isDecorated()) {
            url = image_url[this.getDecoratedWearing()];
        }
        if (large) {
            return url;
        } else {
            return url + "/128fx128f";
        }

    }
    return image_url;
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
    return (this.hasOwnProperty("item_type_name")
        && (this.item_type_name === "#TF_Wearable_Hat"))
        || (this.item_type_name === "Hat")
        || (this.craft_material_type === "hat");
};

TF2Item.prototype.isTaunt = function () {
    return this.item_slot === "taunt";
};

TF2Item.prototype.isPaint = function () {
    return this.name.slice(0, "Paint Can".length) === "Paint Can";
};

TF2Item.prototype.isDecorated = function () {
    return this.getQuality() === TF2Constants.quality.DecoratedWeapon;
};

TF2Item.prototype.getDecoratedWearingName = function () {
    return TF2Constants.namedDecoratedWearings[this.getDecoratedWearing()];
};

TF2Item.prototype.getDecoratedWearing = function () {
    return parseInt(this.getAttribute(TF2Constants.attributeDefindexes.DecoratedWear).getFloatValue() * 5) - 1;
};

TF2Item.prototype.isStrangeWeapon = function () {
    return (this.craft_material_type === "weapon")
        && (this.getQuality() === TF2Constants.quality.Strange);
};

TF2Item.prototype.isAustralium = function () {
    return this.attributeExist(TF2Constants.attributeDefindexes.Australium);
};

TF2Item.prototype.isUnusual = function () {
    return this.quality === TF2Constants.quality.Unusual;
};

TF2Item.prototype.getParticle = function () {
    return this.getAttribute(TF2Constants.attributeDefindexes.Particle).getFloatValue();
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
    return this.getAttribute(TF2Constants.attributeDefindexes.Paint).getFloatValue().toString(16);
};

TF2Item.prototype.isPainted = function () {
    return this.attributeExist(TF2Constants.attributeDefindexes.Paint) && !this.isPaint();
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