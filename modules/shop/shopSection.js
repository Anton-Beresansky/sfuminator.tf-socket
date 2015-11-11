module.exports = Section;
//Section changes (add, remove) are applied only on commit

var Logs = require("../../lib/logs.js");
var Versioning = require("../../lib/dataVersioning.js");
var CompressionLookup = require("./inventory/compressionTable.js");

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
    this.log = new Logs({applicationName: "Section " + type, color: "green"});
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
 * Can be seen by user from shop page
 * @returns {boolean}
 */
Section.prototype.isHidden = function () {
    for (var i = 0; i < this.shop.hiddenSections.length; i += 1) {
        if (this.shop.hiddenSections[i] === this.type) {
            return true;
        }
    }
    return false;
};

/**
 * Establish if Shop Section Item exist
 * @param {Number} id Shop Item id
 * @returns {Boolean}
 */
Section.prototype.itemExist = function (id) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].getID() === id) {
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
        for (var j = 0; j < this.compressedItems[i][CompressionLookup.items_group].length; j += 1) {
            var holder = this.shop.reservations.get(this.compressedItems[i][CompressionLookup.items_group][j][CompressionLookup.unique_identifiers.id]).getHolder();
            if (holder) {
                this.compressedItems[i][CompressionLookup.items_group][j][CompressionLookup.unique_identifiers.reserved_to] = holder;
            } else {
                //OFC! OFC!!!!!!! this.compressedItems doesn't change in time, when dereserving, reservation has to be deleted!
                delete this.compressedItems[i][CompressionLookup.items_group][j][CompressionLookup.unique_identifiers.reserved_to]
            }
        }
    }
    return this.compressedItems;
};

/**
 * Get item list of this shop section
 * @returns {ShopItem[]}
 */
Section.prototype.getItems = function () {
    return this.items;
};

/**
 * Add item to this shop section, change will be effective
 * only on commit (see Section.commit)
 * @param {ShopItem} shopItem
 */
Section.prototype.add = function (shopItem) {
    this.toAdd.push(shopItem);
};

/**
 * Remove item from this shop section, change will be effective
 * only on commit (see Section.commit)
 * @param {ShopItem} shopItem
 */
Section.prototype.remove = function (shopItem) {
    if (this.getItemIndex(shopItem.getID()) >= 0) {
        this.toRemove.push(shopItem);
    }
};

/**
 * Commit added and removed items updating
 * the internal shop section item list.
 * A single method to apply the introduced changes is
 * used so that they will take effect simultaneously
 * @param {Date} [date] Indicates when changes took place, default value
 * will be when commit is called.
 */
Section.prototype.commit = function (date) {
    if (this.toAdd.length === 0 && this.toRemove.length === 0) {
        this.log.debug("Nothing to commit.", 1);
        return;
    }
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
        var idToRemove = this.toRemove[j].getID();
        this.items.splice(this.getItemIndex(idToRemove), 1);

        var compressed_index = this.getCompressedItemIndex(idToRemove);
        if (compressed_index) {
            this.compressedItems[compressed_index[0]][CompressionLookup.items_group].splice(compressed_index[1], 1);
            if (this.compressedItems[compressed_index[0]][CompressionLookup.items_group].length === 0) {
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
        var index = this.getCompressedSchemaItemIndex(this.toAdd[i]);
        if (index >= 0) {
            this.compressedItems[index][CompressionLookup.items_group].push(compressedItem[CompressionLookup.items_group][0]);
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
        if (this.items[i].getID() === id) {
            return i;
        }
    }
    return -1;
};

/**
 * Get item schema index from shop section compressed item list
 * @param {ShopItem} shopItem
 * @returns {Number}
 */
Section.prototype.getCompressedSchemaItemIndex = function (shopItem) {
    if (shopItem.isTF2Item()) {
        for (var i = 0; i < this.compressedItems.length; i += 1) {
            if (
                this.compressedItems[i][CompressionLookup.schema.defindex] === shopItem.getItem().getDefindex() &&
                this.compressedItems[i][CompressionLookup.schema.quality] === shopItem.getItem().getQuality()
            ) {
                return i;
            }
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
        for (var j = 0; j < this.compressedItems[i][CompressionLookup.items_group].length; j += 1) {
            if (this.compressedItems[i][CompressionLookup.items_group][j][CompressionLookup.unique_identifiers.id] === id) {
                return [i, j];
            }
        }
    }
    return null;
};

/**
 * Establish if section is of type "mine"
 * @returns {Boolean}
 */
Section.prototype.isMine = function () {
    return this.type === "mine";
};