module.exports = Section;
//Section changes (add, remove) are applied only on commit

var Logs = require("../../lib/logs.js");
var Versioning = require("../../lib/dataVersioning.js");

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
            itemChanges.date = itemChanges.date.getTime();
            return itemChanges;
        }
    }
    return false;
};

Section.prototype.itemExist = function (id) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === id) {
            return true;
        }
    }
    return false;
};

Section.prototype.getCompressedItems = function () {
    return this.compressedItems;
};

Section.prototype.getItems = function () {
    return this.items;
};

Section.prototype.add = function (item) {
    this.toAdd.push(this.makeSectionItem(item));
};

Section.prototype.remove = function (item) {
    this.toRemove.push(this.makeSectionItem(item));
};

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

Section.prototype.getItemIndex = function (id) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === id) {
            return i;
        }
    }
    return -1;
};

Section.prototype.getCompressedSchemaItemIndex = function (defindex) {
    for (var i = 0; i < this.compressedItems.length; i += 1) {
        if (this.compressedItems[i][CompressSchemaLookup.defindex] === defindex) {
            return i;
        }
    }
    return -1;
};

Section.prototype.getCompressedItemIndex = function (id) {
    for (var i = 0; i < this.compressedItems.length; i += 1) {
        for (var j = 0; j < this.compressedItems[i].length; j += 1) {
            if (this.compressedItems[i][j][CompressItemLookup.id] === id) {
                return [i, j];
            }
        }
    }
    return null;
};

Section.prototype.makeSectionItem = function (item) {
    return new SectionItem(this.shop, this.type, item);
};

Section.prototype.isMine = function () {
    return this.type === "mine";
};

function SectionItem(shop, type, item) {
    this.type = type;
    this.item = item;
    this.id = item.id;
    this.shop = shop;
    this.reservations = this.shop.reservations;
}

SectionItem.prototype.getReservation = function () {
    return this.reservations.get(this.item.id);
};

SectionItem.prototype.getItem = function () {
    return this.item;
};

SectionItem.prototype.isMineSection = function () {
    return this.type === "mine";
};

SectionItem.prototype.getPrice = function () {
    if (this.isMineSection()) {
        return this.shop.adjustMinePrice(this.item);
    }
    return this.item.getPrice();
};

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


var CompressSchemaLookup = {
    defindex: "a",
    name: "b",
    image_url: "c",
    image_url_large: "d",
    used_by_classes: "e",
    relative_price: "f",
    currency: "g",
    shop: "h"
};

var CompressSchemaAttributeLookup = {
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

var CompressItemAttributesLookup = "i";

var CompressItemLookup = {
    id: "x",
    level: "y",
    quality: "z",
    reserved_to: "w",
    paint_color: "v"
};