var Logs = require("../../lib/logs.js");
module.exports = new TF2Currency();

function TF2Currency() {
    this.log = new Logs("TF2 Currency");
    this._currency = {};
}

TF2Currency.prototype.setCloud = function (cloud) {
    this.cloud = cloud;
};

TF2Currency.prototype.get = function () {
    return this._currency;
};

TF2Currency.prototype.update = function (callback) {
    var self = this;
    this.log.debug("Updading...");
    this.fetch(function (currency) {
        self._currency = currency;
        if (typeof callback === "function") {
            callback(self.get());
        }
    });
};

TF2Currency.prototype.fetch = function (callback) {
    this.cloud.send("getCurrency", {data: "something..."}, function (currency) {
        if (typeof callback === "function") {
            callback(currency);
        }
    });
};