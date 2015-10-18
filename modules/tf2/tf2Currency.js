var Logs = require("../../lib/logs.js");
module.exports = new TF2Currency();

/**
 * TF2 Currency class<br>
 * Requiring this class will create either return a singleton<br>
 * Calling TF2Currency.setCloud is needed in order to work properly
 * @returns {TF2Currency}
 */
function TF2Currency() {
    this.log = new Logs({applicationName: "TF2 Currency", color: "blue"});
    this._currency = {};
    this.priceInits = {
        Scrap: "scrap",
        Metal: "metal",
        Keys: "keys",
        Usd: "usd"
    }
}

/**
 * Will apply cloud instance to the TF2 Currency instance
 * @param {Cloud} cloud
 */
TF2Currency.prototype.setCloud = function (cloud) {
    this.cloud = cloud;
};

/**
 * Get the current tf2 currency data structure<br>
 * Numbers multiplied by a value will convert From -> To<br>
 * Eg: (usd_price) x (_currency.usd.keys) -> key_price<br>
 * @returns {TF2Currency._currency|Object}
 * Object will have following structure<br>
 * {<br>
 * &nbsp;usd: {
 * <br>&nbsp;&nbsp;usd: Float,
 * <br>&nbsp;&nbsp;metal: Float,
 * <br>&nbsp;&nbsp;keys: Float,
 * <br>&nbsp;&nbsp;earbuds: Float (obsolete)
 * <br>&nbsp;},
 * <br>&nbsp;metal: {..},
 * <br>&nbsp;keys: {..},
 * <br>&nbsp;..
 * <br>}
 */
TF2Currency.prototype.valueOf = function () {
    return this._currency;
};

/**
 * Get instance
 * @returns {TF2Currency}
 */
TF2Currency.prototype.get = function () {
    return this;
};

/**
 * Will update currency through cloud connection
 * @param {Function} [callback]
 * Callback will return TF2Currency.valueOf
 */
TF2Currency.prototype.update = function (callback) {
    var self = this;
    this.log.debug("Updading...");
    this.fetch(function (currency) {
        for (var prop in currency) {
            self[prop] = currency[prop];
        }
        self._currency = currency;
        if (typeof callback === "function") {
            callback(self.valueOf());
        }
    });
};

/**
 * Fetch current TF2 Currency from cloud
 * @param {type} [callback]
 * Callback will return currency fetched from cloud
 */
TF2Currency.prototype.fetch = function (callback) {
    this.cloud.send("getCurrency", {data: "something..."}, function (currency) {
        if (typeof callback === "function") {
            callback(currency);
        }
    });
};