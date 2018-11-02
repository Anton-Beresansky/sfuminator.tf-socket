// Sfuminator.tf | Backpack.TF Key price

module.exports = BackpackTFKeys;

var request = require("request");
var cheerio = require("cheerio");
var LogLog = require("log-log");

/**
 *
 * @constructor
 */
function BackpackTFKeys() {
    this._pageToFetch = 5;
    this.sellers = [];
    this.buyers = [];
    this.log = LogLog.create({applicationName: "BackpackTFKeys"});
}

BackpackTFKeys.prototype.getSellers = function () {
    return this.sellers;
};

BackpackTFKeys.prototype.getBuyers = function () {
    return this.buyers;
};

BackpackTFKeys.prototype.load = function (callback) {
    var self = this;
    var trades = {selling: {}, buying: {}};
    this.parsePages(function (result) {
        for (var tradeID in result) {
            var trade = result[tradeID];
            if (trade.intent === "sell") {
                if (!trades.selling.hasOwnProperty(trade.steamid)) {
                    trades.selling[trade.steamid] = {count: 0, metal_price: trade.metal_price};
                }
                trades.selling[trade.steamid].count += 1;
            } else {
                if (!trades.buying.hasOwnProperty(trade.steamid)) {
                    trades.buying[trade.steamid] = {count: 0, metal_price: trade.metal_price};
                }
                trades.buying[trade.steamid].count += 1;
            }
        }
        self.injectTrades(trades);
        callback();
    });
};

BackpackTFKeys.prototype.reset = function () {
    this.sellers = [];
    this.buyers = [];
};

BackpackTFKeys.prototype.injectTrades = function (trades) {
    var _sellers = [];
    var _buyers = [];
    for (var steamid in trades.selling) {
        _sellers.push(trades.selling[steamid]);
    }
    for (var steamid in trades.buying) {
        _buyers.push(trades.buying[steamid]);
    }
    this.sellers = _sellers;
    this.buyers = _buyers;
};

BackpackTFKeys.prototype.parsePages = function (callback) {
    var self = this;
    var listings = {};
    var canGo = 0;
    var go = function () {
        canGo += 1;
        if (canGo === self._pageToFetch) {
            callback(listings);
        }
    };
    for (var k = 0; k < this._pageToFetch; k += 1) {
        this.fetch(k + 1, function (page) {
            var $ = cheerio.load(page);
            var $listings = $(".media, .listing");
            for (var i = 0; i < $listings.length; i += 1) {
                var $listing = $($listings[i]);
                var listingID = $listing.attr("id");
                var listing = $listing.find(".listing-item > div");
                var userID = listing.attr("data-listing_account_id");
                var refined_price = parseFloat(listing.attr("data-listing_price").slice(0, -4));
                var intent = parseInt(listing.attr("data-listing_intent")) ? "sell" : "buy";
                listings[listingID] = {steamid: userID, metal_price: refined_price, intent: intent};
            }
            go();
        });
    }
};

BackpackTFKeys.prototype.fetch = function (pageNumber, callback) {
    var self = this;
    request('https://backpack.tf/classifieds?item=Mann%20Co.%20Supply%20Crate%20Key&quality=6&tradable=1&craftable=1&page=' + pageNumber, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            callback(body);
        } else {
            self.log.error("Can't parse bp.tf classifieds: " + response.statusCode);
        }
    });
};