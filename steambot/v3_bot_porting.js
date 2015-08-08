module.exports = BotPorting;

function BotPorting(sfuminator) {
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.users = this.sfuminator.users;
}

BotPorting.prototype.requestAvailable = function (request) {
    var data = request.getData();
    return data.hasOwnProperty("botRequest") && data.botRequest;
};

BotPorting.prototype.onRequest = function (request, callback) {
    var data = request.getData();
    if (data.hasOwnProperty("action")) {
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
                callback(this.shop.tf2Currency);
                break;
        }
    } else {
        var methods = data.methods.split(",");
        var pokes = data.pokes.split(",");
        for (var i = 0; i < methods.length; i += 1) {
            var thisMethods = methods[i];
            switch (thisMethods) {
                case "tradeOffers":
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
                    this.keepAlive();
                    break;
            }
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
    this.shop.getActivePartners(function (partners) {
        for (var i = 0; i < partners.length; i += 1) {
            var trade = self.users.get(partners[i]).getShopTrade().get();
            trade.additional = trade.status_info;
            trade.steamid = trade.partnerID;
            result[trade.steamid] = trade;
        }
        callback(result);
    });
};

BotPorting.prototype.keepAlive = function () {

};