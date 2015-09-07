module.exports = ShopRatio;

var Logs = require("../../lib/logs.js");

function ShopRatio(db) {
    this.db = db;
    this.log = new Logs("TF2 Shop ratio");
    this.hats = {};
}

ShopRatio.prototype.updateHats = function (callback) {
    var self = this;
    this.log.debug("Updating hats");
    this.getHats(function (hatRatio) {
        self.hats = hatRatio;
        self.log.debug("Hats updated");
        if (typeof callback === "function") {
            callback(self);
        }
    });
};

ShopRatio.prototype.getHats = function (callback) {
    var self = this;
    var hatRatio = {weBuy: {}, weSell: {}};
    this.db.connect(function (connection) {
        connection.query(self._getHatsQuery(), function (result) {
            if (result) {
                for (var i = 0; i < result.length; i += 1) {
                    switch (result[i].item) {
                        case "hat":
                            hatRatio.weBuy.lowTier = result[i].weBuy;
                            hatRatio.weBuy.normal = result[i].weBuy - 0.01;
                            hatRatio.weSell.normal = result[i].weSell;
                            break;
                        case "hat_min":
                            hatRatio.weBuy.minimum = result[i].weBuy;
                            hatRatio.weSell.minimum = result[i].weSell;
                            break;
                        case "hat_max":
                            hatRatio.weBuy.maximum = result[i].weBuy;
                            hatRatio.weSell.maximum = result[i].weSell;
                        case "hat_166":
                            hatRatio.weBuy.default166 = result[i].weBuy;
                            hatRatio.weSell.default166 = result[i].weSell;
                            break;
                    }
                }
                callback(hatRatio);
            } else {
                self.log.error("Couldn't get hatRatio from database");
            }
        });
    });
};

ShopRatio.prototype._getHatsQuery = function () {
    return "SELECT `item`, `weBuy`, `weSell` FROM `botPrices` WHERE item='hat' OR item='hat_min' OR item='hat_max' OR item='hat_166'";
};