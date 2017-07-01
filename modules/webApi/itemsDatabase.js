module.exports = ItemsDatabase;

var LogLog = require('log-log');

//Tables used for items
//backpacks
//latest_items
//latest_attributes

/**
 *
 * @param db {Database}
 * @constructor
 */
function ItemsDatabase(db) {
    this.log = LogLog.create({applicationName: "ItemsDatabase", color: "magenta", dim: true});
    this.db = db;
    this.queries = ItemsDatabase.QUERIES;
    this.log.setDepthLevel(0);
}

ItemsDatabase.prototype.readInventory = function (owner, callback, options) {
    var self = this;
    this.log.debug("Reading inventory " + owner, 1);
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query(self.queries.getBackpackInformation(owner), function (backpack_array, isEmpty) {
                if (!isEmpty) {
                    var backpack = backpack_array[0];
                    callback(null, backpack, connection);
                    /*
                    self.readItems(owner, function (items) {
                        if (items.hasOwnProperty("result") && items.result === "error") {
                            connection.rollbackRelease();
                            callback(new Error(self.getError("cannotReadItems", owner).message));
                        } else if (items.length === 0) {
                            connection.commitRelease();
                            callback(new Error(self.getError("noItems", owner)).message);
                        } else {
                            connection.commitRelease();
                            callback(null, self.mergeWithItems(backpack, items));
                        }
                    }, connection, options);
                    */
                } else {
                    connection.rollbackRelease();
                    callback(new Error(self.getError("backpackNotFound", owner)).message);
                }
            });
        });
    });
};

ItemsDatabase.prototype.saveBackpackStatus = function (owner, backpack, callback) {
    var self = this;
    this.log.debug("Updating backpack status " + owner, 1);
    self.db.connect(function (connection) {
        connection.query(self.queries.insertBackpack(owner, backpack), function () {
            connection.release();
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};

ItemsDatabase.prototype.saveInventory = function (owner, newBackpack, callback) {
    var self = this;
    this.log.debug("Saving inventory " + owner);
    self.db.connect(function (connection) {
        connection.beginTransaction(function () {
            //Not needed as long as we are saving with the backpacksApi.js as well (on full tables)
            //connection.query(self.queries.insertBackpack(owner, backpack), function () {
            if (newBackpack.hasOwnProperty("items") && newBackpack.items.length > 0) { //If backpack contains items idk why we put this tbh

                connection.query(self.queries.getStoredItemIDs(owner), function (result) {
                    var ids = [];
                    for (var i = 0; i < result.length; i += 1) {
                        ids.push(result[i].id);
                    }
                    var newItems = newBackpack.items;

                    var idsToDelete = self._save_getIDsToDelete(ids, newItems);
                    var itemsToInsert = self._save_getItemsToInsert(ids, newItems);
                    self.log.debug("Will delete " + idsToDelete.length + " and insert " + itemsToInsert.length + " items");

                    var queryDelete = function (callback) {
                        if (idsToDelete.length) {
                            connection.query(self.queries.deleteAttributes(idsToDelete), function () {
                                connection.query(self.queries.deleteItems(idsToDelete), function () {
                                    callback();
                                });
                            });
                        } else {
                            callback();
                        }
                    };

                    var queryInsert = function (callback) {
                        if (itemsToInsert.length) {
                            connection.query(self.queries.insertItems(owner, itemsToInsert), function () {
                                var attributes_query = self.queries.insertAttributes(owner, itemsToInsert, connection);
                                if (attributes_query) {
                                    connection.query(attributes_query, function () {
                                        callback();
                                    });
                                } else {
                                    callback();
                                }
                            });
                        } else {
                            callback();
                        }
                    };

                    queryDelete(function () {
                        queryInsert(function () {
                            connection.commitRelease();
                            end();
                        });
                    });
                });
            } else {
                connection.commitRelease();
                end();
            }
        });
    });
    var end = function () {
        self.log.debug("Save ended " + owner);
        if (typeof callback === "function") {
            callback();
        }
    };
};

ItemsDatabase.prototype.mergeWithItems = function (backpack, items) {
    backpack.last_update_time = parseInt(backpack.last_update_date.getTime() / 1000);
    backpack.items = items;
    return backpack;
};

ItemsDatabase.prototype.readItems = function (owner, callback, connection, options) {
    var mode = "full";
    if (options && options.hasOwnProperty("mode")) {
        mode = options.mode;
    }
    switch (mode) {
        case "simple":
            this._getSimpleItems(owner, function (items) {
                callback(items);
            }, connection);
            break;
        case "full":
        default:
            this._getFullItems(owner, function (items) {
                callback(items);
            }, connection);
            break;
    }
};

ItemsDatabase.prototype.getError = function (error, identifier) {
    this.log.error((identifier ? (identifier + " ") : "") + error.message);
    return ItemsDatabase.ERRORS[error];
};

ItemsDatabase.prototype._save_getIDsToDelete = function (oldIDs, newItems) {
    var toDelete = [];
    for (var i = 0; i < oldIDs.length; i += 1) {
        var found = false;
        for (var p = 0; p < newItems.length; p += 1) {
            if (oldIDs[i] === newItems[p].id) {
                found = true;
                break;
            }
        }
        if (!found) {
            toDelete.push(oldIDs[i]);
        }
    }
    return toDelete;
};

ItemsDatabase.prototype._save_getItemsToInsert = function (oldIDs, newItems) {
    var toAdd = [];
    for (var i = 0; i < newItems.length; i += 1) {
        var found = false;
        for (var p = 0; p < oldIDs.length; p += 1) {
            if (newItems[i].id === oldIDs[p]) {
                found = true;
                break;
            }
        }
        if (!found) {
            toAdd.push(newItems[i]);
        }
    }
    return toAdd;
};

ItemsDatabase.prototype._getSimpleItems = function (owner, callback, connection) {
    var self = this;
    connection.query(this.queries.getSimpleItems(owner), function (items) {
        callback(self._decodeDbItems(items));
    });
};

ItemsDatabase.prototype._getFullItems = function (owner, callback, connection) {
    var self = this;
    connection.query(this.queries.getFullItems(owner), function (dbItems) {
        dbItems = self._decodeDbItems(dbItems);
        var items = [];
        for (var i = 0; i < dbItems.length; i += 1) {
            var thisAttribute = null;
            if (dbItems[i].attr_defindex)
                thisAttribute = self._makeItemAttribute(dbItems[i]);

            var itemIndex = self._getItemIndex(dbItems[i].id, items);
            if (itemIndex >= 0) { //If item exists (Already compressed) - > append attribute
                if (items[itemIndex].hasOwnProperty("attributes")) {
                    items[itemIndex].attributes.push(thisAttribute);
                } else {
                    items[itemIndex].attributes = [thisAttribute];
                }
            } else {
                items.push(self._compressItem(dbItems[i], thisAttribute));
            }
        }
        callback(items);
    });
};

ItemsDatabase.prototype._decodeDbItems = function (items) {
    for (var i = 0; i < items.length; i += 1) {
        var properties = ItemsDatabase.DECOMPRESS_ITEM_PROPERTIES(new Buffer(items[i].properties.toString('utf8'), 'base64'));
        for (var property in properties) {
            items[i][property] = properties[property];
        }
        delete items[i].properties;
    }
    return items;
};

ItemsDatabase.prototype._compressItem = function (item, attribute) {
    var cmxItem = this._getCompressedItemStructure(item);
    var cmxItemProperties = ItemsDatabase.COMPRESSABLE_ITEM_PROPERTIES;
    for (var i = 0; i < cmxItemProperties.length; i += 1) {
        var property = cmxItemProperties[i];
        if (item[property]) {
            cmxItem[property] = item[property];
        }
    }
    if (attribute)
        cmxItem.attributes = [attribute];
    return cmxItem;
};

ItemsDatabase.prototype._makeItemAttribute = function (dbItem) {
    var attribute = {defindex: dbItem.attr_defindex, value: dbItem.value};
    if (dbItem.float_value)
        attribute.float_value = dbItem.float_value;
    if (dbItem.steamid)
        attribute.steamid = dbItem.steamid;
    return attribute;
};

ItemsDatabase.prototype._getItemIndex = function (id, list) {
    for (var i = 0; i < list.length; i += 1) {
        if (list[i].id === id) {
            return i;
        }
    }
    return -1;
};

ItemsDatabase.prototype._getCompressedItemStructure = function (item) {
    return {
        id: item.id,
        original_id: item.original_id,
        defindex: item.defindex,
        level: item.level,
        quantity: item.quantity,
        quality: item.quality
    };
};

ItemsDatabase.QUERIES = {
    getStoredItemIDs: function (owner) {
        return "SELECT `id` FROM `latest_items` WHERE `owner`='" + owner + "'";
    },
    getBackpackInformation: function (owner) {
        return "SELECT `status`,`num_backpack_slots`,`last_update_date` as `last_update_date` FROM backpacks WHERE `owner`='" + owner + "' LIMIT 1";
    },
    getSimpleItems: function (owner) {
        return "SELECT `id`,`original_id`,`defindex`,`properties` FROM `latest_items` WHERE `owner`='" + owner + "'";
    },
    getFullItems: function (owner) {
        return "SELECT latest_items.`id`,latest_items.`original_id`,latest_items.`defindex`,latest_items.`properties`," +
            "latest_attributes.`defindex` as `attr_defindex`,latest_attributes.`value`," +
            "latest_attributes.`float_value`,latest_attributes.`steamid` FROM `latest_items` LEFT JOIN `latest_attributes` ON " +
            "latest_items.`id`=latest_attributes.`id` WHERE latest_items.`owner`='" + owner + "'";
    },
    insertBackpack: function (owner, backpack) {
        return "INSERT INTO `backpacks`"
            + " (`owner`, `status`, `num_backpack_slots`, `last_update_date`)"
            + " VALUES ('" + owner + "'," + backpack.status + ","
            + (backpack.hasOwnProperty("num_backpack_slots") ? backpack.num_backpack_slots : null) + ",NOW())"
            + " ON DUPLICATE KEY UPDATE "
            + " `status`=" + backpack.status
            + ",`num_backpack_slots`=" + (backpack.hasOwnProperty("num_backpack_slots") ? backpack.num_backpack_slots : null)
            + ",`last_update_date`=NOW()";
    },
    deleteItems: function (ids) {
        var idList = '';
        for (var i = 0; i < ids.length; i += 1) {
            idList += ids[i] + ",";
        }
        idList = idList.slice(0, -1);
        return "DELETE FROM `latest_items` WHERE `id` IN (" + idList + ")";
    },
    insertItems: function (owner, items) {
        var insertConstruction = "INSERT INTO `latest_items` " +
            "(`owner`,`id`,`original_id`,`defindex`,`properties`) VALUES ";
        var values = "";
        for (var i = 0; i < items.length; i += 1) {
            var item = items[i];
            var properties = ItemsDatabase.COMPRESS_ITEM_PROPERTIES(item);
            values += "('" + owner + "'," + item.id + "," + item.original_id + "," + item.defindex + ",'" + properties.toString('base64') + "'), ";
        }
        return insertConstruction + values.slice(0, values.length - 2);
    },
    deleteAttributes: function (ids) {
        var idList = '';
        for (var i = 0; i < ids.length; i += 1) {
            idList += ids[i] + ",";
        }
        idList = idList.slice(0, -1);
        return "DELETE FROM `latest_attributes` WHERE id IN (" + idList + ")";
    },
    insertAttributes: function (owner, items, connection) {
        var insertConstruction = "INSERT IGNORE INTO `latest_attributes` (`id`,`defindex`,`value`,`float_value`,`steamid`) VALUES";
        var values = "";
        for (var i = 0; i < items.length; i += 1) {
            if (items[i].hasOwnProperty("attributes")) {
                for (var p = 0; p < items[i].attributes.length; p += 1) {
                    var attribute = items[i].attributes[p];
                    values += "(" + items[i].id + "," + attribute.defindex + ","
                        + "" + connection.c.escape(attribute.value) + ","
                        + (attribute.hasOwnProperty("float_value") ? attribute.float_value : null) + ","
                        + (attribute.hasOwnProperty("account_info") ? attribute.account_info.steamid : null) + "), ";
                }
            }
        }
        if (values !== "") {
            return insertConstruction + values.slice(0, values.length - 2);
        } else {
            return null;
        }
    }
};

ItemsDatabase.ERRORS = {
    backpackNotFound: {
        result: "error",
        message: "No backpack on database for specified owner",
        code: "#no_database_backpack"
    },
    cannotReadItems: {
        result: "error",
        message: "Wasn't able to read backpack items",
        code: "#reading_items"
    },
    noItems: {
        result: "error",
        message: "No items found",
        code: "#no_items"
    }
};

ItemsDatabase.COMPRESSABLE_ITEM_PROPERTIES = ["origin", "flag_cannot_trade", "flag_cannot_craft"];

ItemsDatabase.COMPRESS_ITEM_PROPERTIES = function (item) {
    var data = new Buffer(5);
    for (var i = 0; i < ItemsDatabase.COMPRESS_ITEM_PROPERTIES_SCHEMA.length; i += 1) {
        data[i] = ItemsDatabase.COMPRESS_ITEM_PROPERTIES_SCHEMA[i](item);
    }
    return data;
};

ItemsDatabase.DECOMPRESS_ITEM_PROPERTIES = function (buffer) {
    var properties = {};
    for (var property in ItemsDatabase.DECOMPRESS_ITEM_PROPERTIES_SCHEMA) {
        properties[property] = ItemsDatabase.DECOMPRESS_ITEM_PROPERTIES_SCHEMA[property](buffer);
    }
    return properties;
};

ItemsDatabase.COMPRESS_ITEM_PROPERTIES_SCHEMA = [
    function (item) {
        return 0x0 | item.flag_cannot_craft | (item.quality << 1);
    },
    function (item) {
        return 0x0 | item.flag_cannot_trade | (item.level);
    },
    function (item) {
        return 0x0 | item.origin;
    },
    function (item) {
        return 0x0 | (item.quantity & 0xFF);
    },
    function (item) {
        return 0x0 | ((item.quantity << 8) & 0xFF);
    }
];

ItemsDatabase.DECOMPRESS_ITEM_PROPERTIES_SCHEMA = {
    flag_cannot_craft: function (buffer) {
        return buffer[0] & 0x1;
    },
    quality: function (buffer) {
        return buffer[0] >> 1;
    },
    flag_cannot_trade: function (buffer) {
        return buffer[1] & 0x1;
    },
    level: function (buffer) {
        return buffer[1] >> 1;
    },
    origin: function (buffer) {
        return buffer[2];
    },
    quantity: function (buffer) {
        return buffer[3] + (buffer[4] << 8);
    }
};