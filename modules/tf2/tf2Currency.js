var Logs = require("../../lib/logs.js");
module.exports = new TF2Currency();

function TF2Currency() {
    this.log = new Logs("TF2 Currency");
}

TF2Currency.prototype.setCloud = function (cloud) {
    this.cloud = cloud;
};

TF2Currency.prototype.update = function (callback) {
    var self = this;
    this.log.debug("Updading...");
    this.get(function (currency) {
        for (var i in currency) {
            self[i] = currency[i];
        }
        if (typeof callback === "function") {
            callback(self);
        }
    });
};

TF2Currency.prototype.get = function (callback) {
    this.cloud.send("getCurrency", {data: "something..."}, function (currency) {
        if (typeof callback === "function") {
            callback(currency);
        }
    });
};