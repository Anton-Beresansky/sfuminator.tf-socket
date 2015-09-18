module.exports = Section;
//Section changes (add, remove) are applied only on commit

var Logs = require("../../lib/logs.js");
var Versioning = require("../../lib/dataVersioning.js");

/**
 * General purpose shop Section class
 * @param {Shop} shop The Shop instance
 * @param {String} type Indicating section type
 * @returns {Section}
 */
function Section(shop, type) {
    this.shop = shop;
    this.type = type;
    this.items = [];
    this.compressedItems = [];
    this.toAdd = [];
    this.toRemove = [];
    this.log = new Logs("Section " + type);
    if (!this.isMine()) {
        this.versioning = new Versioning(40, "section " + type);
        this.log.setLevel(1);
    }
}

/**
 * Get client formatted changes for shop section
 * @param {Date|Number} last_update_date Specify changes starting point 
 * @returns {Object[]|Boolean}
 * False if invalid date is given<br>
 * Object will have following structure<br>
 * {<br>
 * &nbsp;toAdd: SectionItem[],<br>
 * &nbsp;toRemove: SectionItem[],<br>
 * &nbsp;date: Number<br>
 * }
 */
Section.prototype.getClientChanges = function (last_update_date) {
    if (this.isMine()) {
        this.log.error("Can't get client changes for mine backpack");
        return;
    }
    last_update_date = new Date(last_update_date);
    if (last_update_date.toString() !== "Invalid Date") {
        this.log.debug("Getting changes: " + last_update_date, 3);
        var itemChanges = this.versioning.get(last_update_date);
        if (itemChanges) {
            for (var i = 0; i < itemChanges.toAdd.length; i += 1) {
                itemChanges.toAdd[i] = itemChanges.toAdd[i].valueOf();
            }
            for (var i = 0; i < itemChanges.toRemove.length; i += 1) {
                itemChanges.toRemove[i] = itemChanges.toRemove[i].valueOf();
            }
            itemChanges.date = itemChanges.date.getTime();
            return itemChanges;
        }
    }
    return false;
};

/**
 * Establish if Shop Section Item exist
 * @param {Number} id Shop Section Item id
 * @returns {Boolean}
 */
Section.prototype.itemExist = function (id) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === id) {
            return true;
        }
    }
    return false;
};

/**
 * Get compressed item list of this shop section
 * @returns {Object[]} See SectionItem.getCompressed for more info on item compression
 */
Section.prototype.getCompressedItems = function () {
    for (var i = 0; i < this.compressedItems.length; i += 1) {
        for (var j = 0; j < this.compressedItems[i][CompressItemAttributesLookup].length; j += 1) {
            this.compressedItems[i][CompressItemAttributesLookup][j][CompressItemLookup.reserved_to] = this.shop.reservations.get(this.compressedItems[i][CompressItemAttributesLookup][j][CompressItemLookup.id]).getHolder();
        }
    }
    return this.compressedItems;
};

/**
 * Get item list of this shop section
 * @returns {SectionItem[]}
 */
Section.prototype.getItems = function () {
    return this.items;
};

/**
 * Add item to this shop section, change will be effective
 * only on commit (see Section.commit)
 * @param {TF2Item} item
 */
Section.prototype.add = function (item) {
    this.toAdd.push(this.makeSectionItem(item));
};

/**
 * Remove item from this shop section, change will be effective
 * only on commit (see Section.commit)
 * @param {TF2Item} item
 */
Section.prototype.remove = function (item) {
    this.toRemove.push(this.makeSectionItem(item));
};

/**
 * Commit added and removed items updating
 * the internal shop section item list.<br>
 * A single method to apply the introduced changes is
 * used so that they will take effect simultaneously
 * @param {Date} [date] Indicates when changes took place, default value
 * will be when commit is called.
 */
Section.prototype.commit = function (date) {
    if (!date) {
        date = new Date();
    }
    this.commitRemovals();
    this.commitAdds();
    if (!this.isMine()) {
        this.versioning.add(this.toAdd, this.toRemove, date);
    }
    this.toAdd = [];
    this.toRemove = [];
    this.log.debug("Committed, items in stock: " + this.items.length, 1);
};

/**
 * Commit only removed items (see Section.commit)
 */
Section.prototype.commitRemovals = function () {
    for (var j = 0; j < this.toRemove.length; j += 1) {
        var idToRemove = this.toRemove[j].id;
        this.items.splice(this.getItemIndex(idToRemove), 1);

        var compressed_index = this.getCompressedItemIndex(idToRemove);
        if (compressed_index) {
            this.compressedItems[compressed_index[0]][CompressItemAttributesLookup].splice(compressed_index[1], 1);
            if (this.compressedItems[compressed_index[0]][CompressItemAttributesLookup].length === 0) {
                this.compressedItems.splice(compressed_index[0], 1);
            }
        }
    }
};

/**
 * Commit only added items (see Section.commit)
 */
Section.prototype.commitAdds = function () {
    this.items = this.items.concat(this.toAdd);

    for (var i = 0; i < this.toAdd.length; i += 1) {
        var compressedItem = this.toAdd[i].getCompressed();
        var index = this.getCompressedSchemaItemIndex(compressedItem[CompressSchemaLookup.defindex]);
        if (index >= 0) {
            this.compressedItems[index][CompressItemAttributesLookup].push(compressedItem[CompressItemAttributesLookup][0]);
        } else {
            this.compressedItems.push(compressedItem);
        }
    }
};

/**
 * Get item index from shop section item list
 * @param {Number} id
 * @returns {Number} Item index from Section.items list
 */
Section.prototype.getItemIndex = function (id) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === id) {
            return i;
        }
    }
    return -1;
};

/**
 * Get item schema index from shop section compressed item list
 * @param {Number} defindex
 * @returns {Number}
 */
Section.prototype.getCompressedSchemaItemIndex = function (defindex) {
    for (var i = 0; i < this.compressedItems.length; i += 1) {
        if (this.compressedItems[i][CompressSchemaLookup.defindex] === defindex) {
            return i;
        }
    }
    return -1;
};

/**
 * Get item index from shop section compressed item list
 * @param {Number} id Item id
 * @returns {Array} First element will be item schema index, second element
 * will be unique item index. <br>
 * See SectionItem.getCompressed for more info on item compression
 */
Section.prototype.getCompressedItemIndex = function (id) {
    for (var i = 0; i < this.compressedItems.length; i += 1) {
        for (var j = 0; j < this.compressedItems[i][CompressItemAttributesLookup].length; j += 1) {
            if (this.compressedItems[i][CompressItemAttributesLookup][j][CompressItemLookup.id] === id) {
                return [i, j];
            }
        }
    }
    return null;
};

/**
 * Make a new Shop Section Item
 * @param {TF2Item} item
 * @returns {SectionItem}
 */
Section.prototype.makeSectionItem = function (item) {
    return new SectionItem(this.shop, this.type, item);
};

/**
 * Establish if section is of type "mine"
 * @returns {Boolean}
 */
Section.prototype.isMine = function () {
    return this.type === "mine";
};

/**
 * General purpose class for section item<br><br>
 * See section class for more info
 * @param {Shop} shop Shop instance
 * @param {String} type Indicate section type the item belongs to (hats, mine, ..)
 * @param {TF2Item} item
 */
function SectionItem(shop, type, item) {
    this.type = type;
    this.item = item;
    this.id = item.id;
    this.shop = shop;
    this.reservations = this.shop.reservations;
}

/**
 * Get Shop Section Item reservation.
 * @returns {Reservation}
 */
SectionItem.prototype.getReservation = function () {
    return this.reservations.get(this.item.id);
};

/**
 * Get Shop Section TF2Item.
 * @returns {TF2Item}
 */
SectionItem.prototype.getItem = function () {
    return this.item;
};

/**
 * Establish if Shop Section Item belongs to Section of type "mine"
 * @returns {Boolean}
 */
SectionItem.prototype.isMineSection = function () {
    return this.type === "mine";
};

/**
 * Get Shop Section Item price.<br>
 * Price is related to shop section.
 * @returns {TF2Price}
 */
SectionItem.prototype.getPrice = function () {
    if (this.isMineSection()) {
        return this.shop.adjustMinePrice(this.item);
    }
    return this.item.getPrice();
};

/**
 * Get Shop Section Item object structure
 * @returns {SectionItem.prototype.valueOf.itemValue}
 */
SectionItem.prototype.valueOf = function () {
    var itemValue = {
        id: this.item.id,
        defindex: this.item.defindex,
        level: this.item.level,
        quality: this.item.quality,
        name: this.item.getFullName(),
        image_url: this.item.image_url,
        image_url_large: this.item.image_url_large,
        used_by_classes: this.item.used_by_classes,
        relative_price: this.getPrice().toMetal(),
        currency: "metal",
        shop: this.type,
        reserved_to: this.getReservation().getHolder()
    };
    if (this.isMineSection() && this.item.isPainted()) {
        itemValue.paint_color = this.item.getPaintColor();
    }
    return itemValue;
};

/**
 * Get compressed Shop Section Item<br><br>
 * Item compression has its purpose on client data exchange.
 * Shop Section Item properties are reduced to single chars and certain
 * properties are reduced in length.<br>
 * Compression will also eliminate any data redundancies.<br>
 * Lookup tables are coded in, and easy to modify.<br>
 * For more info on their data structure, check the lookup tables stored
 * in the Section/SectionItem class file.
 * @returns {Object}
 */
SectionItem.prototype.getCompressed = function () {
    var itemValue = this.valueOf();
    var compressedItem = {};
    for (var property in CompressSchemaLookup) {
        if (itemValue.hasOwnProperty(property) && itemValue[property]) {
            if (!CompressSchemaAttributeLookup.hasOwnProperty(property)) {
                compressedItem[CompressSchemaLookup[property]] = itemValue[property];
            } else if (typeof CompressSchemaAttributeLookup[property] === "function") {
                compressedItem[CompressSchemaLookup[property]] = CompressSchemaAttributeLookup[property](itemValue[property]);
            } else {
                compressedItem[CompressSchemaLookup[property]] = CompressSchemaAttributeLookup[property][itemValue[property]];
            }
        }
    }
    var compressedAttributes = {};
    for (var property in CompressItemLookup) {
        if (itemValue.hasOwnProperty(property) && itemValue[property]) {
            compressedAttributes[CompressItemLookup[property]] = itemValue[property];
        }
    }
    compressedItem[CompressItemAttributesLookup] = [compressedAttributes];
    return compressedItem;
};

CompressSchemaLookup = {
    defindex: "a",
    name: "b",
    image_url: "c",
    image_url_large: "d",
    used_by_classes: "e",
    shop: "h"
};

CompressSchemaAttributeLookup = {
    currency: {
        usd: 0,
        metal: 1,
        keys: 2,
        earbuds: 3
    },
    shop: {
        mine: 0,
        hats: 1
    },
    image_url: function (url) {
        return url.slice(45);
    },
    image_url_large: function (url) {
        return url.slice(45);
    }
};

CompressItemAttributesLookup = "i";

CompressItemLookup = {
    id: "x",
    level: "y",
    quality: "z",
    paint_color: "v",
    reserved_to: "w",
    relative_price: "f",
    currency: "g"
};
