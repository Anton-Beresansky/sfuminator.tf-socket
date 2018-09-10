// Sfuminator.tf | uID Manager. Items with same uID will be grouped under the same stock

var LogLog = require('log-log');
var Callbacks = require('../../lib/callbacks.js');

/**
 * @constructor
 */
function UIDs() {
    this.lookupTable = [];
    this.latestUID = 0;
    this._dbSaveStack = [];
    this._callbacks = new Callbacks();
    this.queries = UIDs.QUERIES;
    this.log = LogLog.create({applicationName: "UIDs", color: "green", dim: true});
}

UIDs.prototype.setDatabase = function (database) {
    this.db = database;
};

UIDs.prototype.get = function (name) {
    for (var i = 0; i < this.lookupTable.length; i += 1) {
        if (this.lookupTable[i].name === name) {
            return this.lookupTable[i].uid;
        }
    }
    return this.generate(name);
};

UIDs.prototype.generate = function (name) {
    this.log.debug("Generating uid for: " + name);
    this.latestUID += 1;
    this.save(name);
    return this.latestUID;
};

UIDs.prototype.save = function (name) {
    this.lookupTable.push({
        name: name,
        uid: this.latestUID
    });
    this._dbSave(name);
};

UIDs.prototype.onLoad = function (callback) {
    this._callbacks.stack("onLoad", callback);
};

UIDs.prototype.load = function (callback) {
    var self = this;
    this.onLoad(callback);
    this._makeTables(function () {
        self._fetch(function (itemsUIDs) {
            self._import(itemsUIDs);
            self._callbacks.fire("onLoad");
        });
    });
};

UIDs.prototype._import = function (dbData) {
    this.lookupTable = dbData;
    for (var i = 0; i < this.lookupTable.length; i += 1) {
        if (this.lookupTable[i].uid > this.latestUID) {
            this.latestUID = this.lookupTable[i].uid;
        }
    }
};

UIDs.prototype._fetch = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.readUIDs(), function (result, isEmpty) {
            connection.release();
            var UIDs = [];
            if (!isEmpty) {
                for (var i = 0; i < result.length; i += 1) {
                    UIDs.push({name: result[i].name, uid: result[i].uid});
                }
            }
            callback(UIDs);
        });
    })
};

UIDs.prototype._dbSave = function (name) {
    this._dbSaveStack.push(name);
    this.log.debug("Stacking " + name);
    var self = this;
    clearTimeout(this._dbSaveTimeout);
    this._dbSaveTimeout = setTimeout(function () {
        self.db.connect(function (connection) {
            self.log.debug("Inserting " + JSON.stringify(self._dbSaveStack));
            connection.query(self.queries.saveUIDs(self._dbSaveStack, connection), function () {
                connection.release();
                self._dbSaveStack = [];
            });
        });
    }, 1000);
};

UIDs.prototype._makeTables = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.makeTables(), function () {
            connection.release();
            callback();
        });
    });
};

UIDs.DB = {
    tableName: "my_sfuminator_items.`unique_items_id`"
};
UIDs.QUERIES = {
    readUIDs: function () {
        return "SELECT `name`,`uid` FROM " + UIDs.DB.tableName;
    },
    saveUIDs: function (uIDs, connection) {
        var query = "INSERT IGNORE " + UIDs.DB.tableName + " (`name`) VALUES ";
        for (var i = 0; i < uIDs.length; i += 1) {
            query += "(" + connection.c.escape(uIDs[i]) + "),";
        }
        return query.slice(0, -1);
    },
    makeTables: function () {
        return "CREATE TABLE IF NOT EXISTS " + UIDs.DB.tableName + " ("
            + "`uid` INT NOT NULL AUTO_INCREMENT,"
            + "`name` VARCHAR(100),"
            + "UNIQUE (`name`),"
            + "PRIMARY KEY (`uid`)"
            + ") "
            + "ENGINE = InnoDB "
            + "DEFAULT CHARACTER SET = utf8 "
            + "COLLATE = utf8_bin";
    }
};

module.exports = new UIDs();