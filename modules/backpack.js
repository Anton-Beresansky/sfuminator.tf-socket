module.exports = Backpack;

var events = require("events");
var Logs = require('../lib/logs.js');
var TF2Item = require("./tf2/tf2Item.js");

function Backpack(steamid, game, cloud) {
    this.cloud = cloud;
    this.log = new Logs("Backpack " + steamid);
    this.game = game;
    this.owner = steamid;
    this.decayTime = 90000; // 90sec
    this.last_update_date = 0;
    events.EventEmitter.call(this);
    var self = this;
    this.on("expired", function () {
        self.items = null;
    });
}

require("util").inherits(Backpack, events.EventEmitter);

Backpack.prototype.getOwner = function () {
    return this.owner;
};

Backpack.prototype.getCached = function (callback) {
    var self = this;
    this.log.debug("Getting cached backpack");
    if (this.isOutdated()) {
        this.get(function () {
            if (typeof callback === "function") {
                callback(self);
            }
        });
    } else {
        if (typeof callback === "function") {
            callback(this);
        }
    }
};

Backpack.prototype.get = function (callback) {
    var self = this;
    this.cloud.send("getBackpack", {steamid: this.getOwner(), game: this.game}, function (result) {
        //self.log.debug(JSON.stringify(result).slice(0, 300));
        for (var i in result) {
            self[i] = result[i];
        }
        if (self.items) {
            self._createItemsObject();
        }
        self.last_update_date = new Date();
        self._encodeFetchingError(result);
        self.renewExpiration();
        
        var error_code = self.getErrorCode();
        if (error_code === "#database_backpack") {
            self.log.debug("Fetching has errored: " + error_code, 1);
        } else if (error_code) {
            self.log.warning("Fetching has errored: " + error_code);
        }
        
        if (typeof callback === "function") {
            callback(self);
        }
    });
};

Backpack.prototype.itemExist = function (itemID) {
    return this.getItem(itemID) !== false;
};

Backpack.prototype.getItem = function (itemID) {
    for (var i = 0; i < this.items.length; i += 1) {
        if (this.items[i].id === itemID) {
            return this.items[i];
        }
    }
    return false;
};

Backpack.prototype.hasErrored = function () {
    return this.error === true;
};

Backpack.prototype.getErrorCode = function () {
    if (this.hasErrored()) {
        return this._error_code;
    }
    return "";
};

Backpack.prototype.getErrorMessage = function () {
    if (this.hasErrored() && this.error_message) {
        return this.error_message;
    }
    return "";
};

Backpack.prototype._encodeFetchingError = function (newBackpack) {
    this.error = false;
    if (newBackpack.hasOwnProperty("result") && newBackpack.result === "error") {
        if (newBackpack.code === "#steam_api_down") {
            this.error = true;
            this._error_code = newBackpack.code;
            this.error_message = "Sorry, steam servers didn't respond, we couldn't retrive your backpack. Try again later";
        }
    } else if (newBackpack.hasOwnProperty("last_update_date")) {
        this.last_update_date = new Date(newBackpack.last_update_date);
        this.error = true;
        this._error_code = "#database_backpack";
        this.error_message = "Steam servers didn't respond, this is the last known image of your backpack (~timestamp)";
    } else if (newBackpack.hasOwnProperty("status")) {
        if (newBackpack.status !== 1) {
            this.error = true;
            this._error_code = "#backpack_status_" + newBackpack.status;
            this.error_message = "Sorry, but we couldn't retrive your backpack. It seems that your backpack is set to private, you can set it to public in your steam privacy settings.";
        }
    }
};

Backpack.prototype._createItemsObject = function () {
    if (this.game === 440) {
        for (var i = 0; i < this.items.length; i += 1) {
            this.items[i] = new TF2Item(this.items[i], this.getOwner());
        }
    }
};

Backpack.prototype.isOutdated = function () {
    return new Date() - this.last_update_date > this.decayTime;
};

Backpack.prototype.renewExpiration = function () {
    this._cancelDecay();
    this._startDecay();
};

Backpack.prototype._cancelDecay = function () {
    if (this._decayTimeout) {
        clearTimeout(this._decayTimeout);
    }
};

Backpack.prototype._startDecay = function () {
    var self = this;
    this._decayTimeout = setTimeout(function () {
        self.emit("expired", self.owner);
    }, this.decayTime);
};