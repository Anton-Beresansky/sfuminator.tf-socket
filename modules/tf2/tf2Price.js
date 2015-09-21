module.exports = TF2Price;

var TF2Currency = require("./tf2Currency.js");

/**
 * General purpose TF2 Item Price class
 * @param {Float} price 
 * By default: USD item price, other type if initCurrency is specified
 * @param {String} [initCurrency]
 * Defines currency of the given price, can be: scrap, metal, usd, keys, earbuds (obsolete)
 * @returns {TF2Price}
 */
function TF2Price(price, initCurrency) {
    this.absolute_price = price;
    this.currency = TF2Currency;

    if (initCurrency) {
        if (initCurrency === "scrap") {
            initCurrency = "metal";
            price = price / 9;
        }
        this.absolute_price = price * this.currency[initCurrency].usd;
    }
}

/**
 * Get price converted in USD
 * @returns {Float}
 */
TF2Price.prototype.toUSD = function () {
    return this.absolute_price;
};

/**
 * Get price converted in Metal
 * @returns {Float}
 */
TF2Price.prototype.toMetal = function () {
    if (!this._metalPrice) {
        this._metalPrice = parseInt(this.absolute_price * this.currency.usd.metal * 100) / 100;
    }
    return this._metalPrice;
};

/**
 * Get price converted in Keys
 * @returns {Float}
 */
TF2Price.prototype.toKeys = function () {
    if (!this._keyPrice) {
        this._keyPrice = this.absolute_pirce * this.currency.usd.keys;
    }
    return this._keyPrice;
};

/**
 * Get price converted in Scraps
 * @returns {Number}
 */
TF2Price.prototype.toScrap = function () {
    if (!this._scrapPrice) {
        this._scrapPrice = parseInt((this.toMetal() + 0.1) * 9);
    }
    return this._scrapPrice;
};

/**
 * Instance value used by operators
 * <br><br>Any instance of this class can be used as a Int variable for
 * computational purposes
 * @returns {Number} scrap price
 */
TF2Price.prototype.valueOf = function () {
    return this.toScrap();
};