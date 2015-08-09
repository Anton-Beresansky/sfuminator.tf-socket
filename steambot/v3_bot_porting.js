module.exports = BotPorting;

var Logs = require("../lib/logs.js");

function BotPorting(sfuminator) {
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.users = this.sfuminator.users;
    this.log = new Logs("v3 Bot Porting");
}

BotPorting.prototype.requestAvailable = function (request) {
    var data = request.getData();
    return data.hasOwnProperty("botRequest") && data.botRequest;
};

BotPorting.prototype.onRequest = function (request, callback) {
    var data = request.getData();
    if (data.action !== "botPollingProcedure") {
        switch (data.action) {
            case "appendTrade":
                this.increaseHatTradeCount(callback);
                break;
            case "setTradeOfferStatus":
                this.setTradeOfferStatus(data.steamid, data.status, data.additional, callback);
                break;
            case "cancelAllTradeOffers":
                this.cancelAllTradeOffers(callback);
                break;
            case "fetchCurrency":
                this.getCurrency(callback);
                break;
        }
    } else {
        var found = false;
        var methods = [];
        var pokes = [];
        if (data.hasOwnProperty("methods")) {
            methods = data.methods.split(",");
        }
        if (data.hasOwnProperty("pokes")) {
            var pokes = data.pokes.split(",");
        }
        for (var i = 0; i < methods.length; i += 1) {
            var thisMethods = methods[i];
            switch (thisMethods) {
                case "tradeOffers":
                    found = true;
                    this.log.debug("Getting trade offers", 1);
                    this.getTradeOffers(function (tradeOffers) {
                        callback({tradeOffers: tradeOffers});
                    });
                    break;
            }
        }
        for (var i = 0; i < pokes.length; i += 1) {
            var thisPoke = pokes[i];
            switch (thisPoke) {
                case "keepAlive":
                    found = true;
                    this.keepAlive();
                    break;
            }
        }
        if (!found) {
            callback({});
        }
    }
};

BotPorting.prototype.increaseHatTradeCount = function (callback) {

};

BotPorting.prototype.setTradeOfferStatus = function (steamid, status, status_info, callback) {
    var user = this.users.get(steamid);
    var shopTrade = user.getShopTrade();
    shopTrade.setStatus(status);
    shopTrade.setStatusInfo(status_info);
    shopTrade.commit();
    if (status === "closed") {
        if (status !== "accepted") {
            shopTrade.dereserveItems();
        }
        setTimeout(function () {
            user.unsetInTrade();
        }, 10000);
    }
    callback({result: "success", steamid: steamid, status: status});
};

BotPorting.prototype.cancelAllTradeOffers = function (callback) {

};

BotPorting.prototype.getTradeOffers = function (callback) {
    var self = this;
    var result = {};
    if (this.fetching_active_trades) {
        this.log.error("Still fetching active trades can't proceed");
        callback();
    }
    this.fetching_active_trades = true;
    this.shop.getActiveTrades(function (active_trades) {
        for (var i = 0; i < active_trades.length; i += 1) {
            result[active_trades[i].partnerID] = self.getPortedTradeOffer(active_trades[i].partnerID);
        }
        callback(result);
        self.fetching_active_trades = false;
    });
};

BotPorting.prototype.getPortedTradeOffer = function (partnerID) {
    var trade = this.users.get(partnerID).getShopTrade().get();
    trade.additional = trade.status_info;
    trade.steamid = trade.partnerID;
    for (var i = 0; i < trade.items.me.length; i += 1) {
        trade.items.me[i].id = trade.items.me[i].id.toString();
    }
    for (var i = 0; i < trade.items.them.length; i += 1) {
        trade.items.them[i].id = trade.items.them[i].id.toString();
    }
    return trade;
};

BotPorting.prototype.getCurrency = function (callback) {
    var currency = this.shop.tf2Currency.get();
    var patchedCurrency = {};
    for (var prop1 in currency) {
        for (var prop2 in currency[prop1]) {
            var key1 = this._getCompatibleCurrencyKey(prop1);
            var key2 = this._getCompatibleCurrencyKey(prop2);
            if (!patchedCurrency.hasOwnProperty(key1)) {
                patchedCurrency[key1] = {};
            }
            patchedCurrency[key1][key2] = currency[prop1][prop2];
        }
    }
    callback(patchedCurrency);
};

BotPorting.prototype._getCompatibleCurrencyKey = function (key) {
    var compatibleKey = key;
    if (key === "metal") {
        compatibleKey = "refined";
    } else if (key === "keys") {
        compatibleKey = "key";
    }
    return compatibleKey;
};

BotPorting.prototype.keepAlive = function () {

};