// Sfuminator.tf | Interface for Shop sell/buy pricing

module.exports = ShopRatio;

var LogLog = require("log-log");

/**
 * @class ShopRatio
 * @description Will define shop price ratios used to buy and sell items
 * @param {Database} db Database instance
 * @returns {ShopRatio}
 */
function ShopRatio(db) {
    this.db = db;
    this.log = LogLog.create({applicationName: "TF2 Shop ratio", color: "green", dim: true});
    this.hats = {};
}

/**
 * Update hats ratio
 * @param {Funciton} [callback]
 * Callback will return this instance
 */
ShopRatio.prototype.updateHats = function (callback) {
    var self = this;
    this.log.debug("Updating hats");
    this.getHats(function (hatRatio) {
        self.hats = hatRatio;
        self.log.debug("Hats updated");
        self.getStrange(function (strangeRatio) {
            self.strange = strangeRatio;
            self.log.debug("Strange updated");
            if (typeof callback === "function") {
                callback(self);
            }
        });
    });
};

/**
 * Get hat ratio<br>
 * Asyincronous database fetching
 * @param {Funciton} callback
 * Callback will return the Ratio Object<br>
 * Object will have following structure<br>
 * {<br>
 * &nbsp;weBuy: {
 * <br>&nbsp;&nbsp;lowTier: Float,
 * <br>&nbsp;&nbsp;normal: Float,
 * <br>&nbsp;&nbsp;default166: Float,
 * <br>&nbsp;&nbsp;minimum: Float,
 * <br>&nbsp;&nbsp;maximum: Float
 * <br>&nbsp;},
 * <br>&nbsp;weSell: {..}
 * <br>}
 */
ShopRatio.prototype.getHats = function (callback) {
    var self = this;
    var hatRatio = {weBuy: {}, weSell: {}};
    this.db.connect(function (connection) {
        connection.query(self._getHatsQuery(), function (result, empty) {
            connection.release();
            if (!empty) {
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
                            break;
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

ShopRatio.prototype.getStrange = function (callback) {
    var self = this;
    var strangeRatio = {weBuy: {}, weSell: {}};
    this.db.connect(function (connection) {
        connection.query(self._getStrangeQuery(), function (result, empty) {
            connection.release();
            if (!empty) {
                for (var i = 0; i < result.length; i += 1) {
                    switch (result[i].item) {
                        case "strange":
                            strangeRatio.weBuy.normal = result[i].weBuy;
                            strangeRatio.weSell.normal = result[i].weSell;
                            break;
                        case "strange_min":
                            strangeRatio.weBuy.minimum = result[i].weBuy;
                            strangeRatio.weSell.minimum = result[i].weSell;
                            break;
                        case "strange_max":
                            strangeRatio.weBuy.maximum = result[i].weBuy;
                            strangeRatio.weSell.maximum = result[i].weSell;
                            break;
                    }
                }
                callback(strangeRatio);
            } else {
                self.log.error("Couldn't get strangeRatio from database");
            }
        })
    })
};

/**
 * Get query to fetch hat ratio
 * @returns {String} Query
 */
ShopRatio.prototype._getHatsQuery = function () {
    return "SELECT `item`, `weBuy`, `weSell` FROM `botPrices` WHERE item='hat' OR item='hat_min' OR item='hat_max' OR item='hat_166'";
};

ShopRatio.prototype._getStrangeQuery = function () {
    return "SELECT `item`, `weBuy`, `weSell` FROM `botPrices` WHERE item='strange' OR item='strange_min' OR item='strange_max'";
};