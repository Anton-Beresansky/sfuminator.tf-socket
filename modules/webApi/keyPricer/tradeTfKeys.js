module.exports = TradeTFKeys;

var request = require("request");
var cheerio = require("cheerio");
var Logs = require("../../../lib/logs.js");

/**
 * @constructor
 */
function TradeTFKeys() {
    this.sellers = [];
    this.buyers = [];
    this.log = new Logs({applicationName: "TradeTFKeys", dim: true});
}

TradeTFKeys.prototype.getSellers = function () {
    return this.sellers;
};

TradeTFKeys.prototype.getBuyers = function () {
    return this.buyers;
};

TradeTFKeys.prototype.inject = function (who, list) {
    if (list instanceof Array) {
        for (var i = 0; i < list.length; i += 1) {
            var trade = list[i];
            if (this.isTradePriceValid(trade.price)) {
                this[who].push({count: trade.count, metal_price: trade.price.refs});
            }
        }
    }
};

TradeTFKeys.prototype.isTradePriceValid = function (price) {
    return price.keys === 0 && price.buds === 0 && price.refs > 0;
};

TradeTFKeys.prototype.load = function (callback) {
    var self = this;
    this.parsePage("sellers", function (sellers) {
        self.inject("sellers", sellers);
        self.parsePage("buyers", function (buyers) {
            self.inject("buyers", buyers);
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};

TradeTFKeys.prototype.parsePage = function (who, callback) {
    var self = this;
    this.fetch(who, function (body) {
        var $ = cheerio.load(body);
        try {
            callback(self._parseTraders($.html()));
        } catch (e) {
            self.log.error(e);
            callback();
        }
    });
};

TradeTFKeys.prototype._parseTraders = function (page_html) {
    var index = page_html.search("scope.trades = ") + 15;
    var textTradeInfo = "";
    while (index < page_html.length) {
        if (page_html[index] === ";") {
            break;
        }
        textTradeInfo += page_html[index];
        index += 1;
    }
    try {
        return JSON.parse(textTradeInfo);
    } catch (e) {
        throw "Couldn't parse traders from page!!!";
    }
};

TradeTFKeys.prototype.fetch = function (who, callback) {
    this.log.debug("Fetching " + who);
    request('http://www.trade.tf/mybots/' + who + '/Mann%20Co.%20Supply%20Crate%20Key', function (error, response, body) {
        if (!error && response.statusCode === 200) {
            callback(body);
        }
    });
};