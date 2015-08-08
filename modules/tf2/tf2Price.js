module.exports = TF2Price;

var TF2Currency = require("./tf2Currency.js");

function TF2Price(_absolute_price, initCurrency) {
    this.absolute_price = _absolute_price;
    this.currency = TF2Currency;

    if (initCurrency) {
        if (initCurrency === "scrap") {
            initCurrency = "metal";
            _absolute_price = _absolute_price / 9;
        }
        this.absolute_price = _absolute_price * this.currency[initCurrency].usd;
    }
}

TF2Price.prototype.toUSD = function () {
    return this.absolute_price;
};

TF2Price.prototype.toMetal = function () {
    if (!this._metalPrice) {
        this._metalPrice = parseInt(this.absolute_price * this.currency.usd.metal * 100) / 100;
    }
    return this._metalPrice;
};

TF2Price.prototype.toKeys = function () {
    if (!this._keyPrice) {
        this._keyPrice = this.absolute_pirce * this.currency.usd.keys;
    }
    return this._keyPrice;
};

TF2Price.prototype.toScrap = function () {
    if (!this._scrapPrice) {
        this._scrapPrice = parseInt((this.toMetal() + 0.1) * 9);
    }
    return this._scrapPrice;
};

TF2Price.prototype.valueOf = function () {
    return this.toScrap();
};