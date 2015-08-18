module.exports = BotPorting;

var Logs = require("./lib/logs.js");
var API = require("./lib/api.js");

function BotPorting(sfuminator) {
    this.sfuminator = sfuminator;
    this.shop = this.sfuminator.shop;
    this.users = this.sfuminator.users;
    this.log = new Logs("v3 Bot Porting");
    this.site_api = new API("dev.sfuminator.tf");
    this.site_key = "lolol_this_is_bot_porting";
}

BotPorting.prototype.requestAvailable = function (request) {
    var data = request.getData();
    return data.hasOwnProperty("botRequest") && data.botRequest;
};

BotPorting.prototype.onRequest = function (request, callback) {
    var data = request.getData();
    if (!data.hasOwnProperty("botSteamid") || !this.sfuminator.shop.isBot(data.botSteamid)) {
        this.log.debug("Got request from not bot: " + data.botSteamid);
        callback({result: "error", success: false, message: "You are not a bot, lol"});
        return;
    }
    if (data.action !== "botPollingProcedure") {
        switch (data.action) {
            case "appendTrade":
                callback({result: "success"});
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
            case "checkIncomingOffer":
                this.checkIncomingOffer(data, callback);
                break;
            case "dereserveItem":
                this.dereserveItem(data, callback);
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

BotPorting.prototype.increaseHatTradeCount = function (steamid) {
    this.log.debug("Appending trade for " + steamid);
    var trade = this.users.get(steamid).getShopTrade();
    var assets = trade.getAssets();
    var compatible_trades = [];
    var now = parseInt(new Date().getTime() / 1000);
    for (var i = 0; i < assets.length; i += 1) {
        var item = assets[i].getItem();
        if (item.getOwner() === steamid) {
            compatible_trades.push({steamid: steamid, my_defindex: 5002, his_defindex: item.defindex, date: now});
        } else {
            compatible_trades.push({steamid: steamid, my_defindex: item.defindex, his_defindex: 5002, date: now});
        }
    }
    this.insertTradeCompatible(compatible_trades);
};

BotPorting.prototype.insertTradeCompatible = function (trades) {
    var self = this;
    this.sfuminator.db.connect(function (connection) {
        connection.query(self._getTradeCompatibleQuery(trades), function () {
            connection.release();
        });
    });
};

BotPorting.prototype._getTradeCompatibleQuery = function (trades) {
    var query = "INSERT INTO `trades` (`with`,`my_defindex`,`his_defindex`,`when`) VALUES ";
    for (var i = 0; i < trades.length; i += 1) {
        var trade = trades[i];
        query += "('" + trade.steamid + "'," + trade.my_defindex + "," + trade.his_defindex + "," + trade.date + "), ";
    }
    query = query.slice(0, query.length - 2);
    return query + " ON DUPLICATE KEY UPDATE "
            + " `with`=VALUES(`with`),"
            + " `my_defindex`=VALUES(`my_defindex`),"
            + " `his_defindex`=VALUES(`his_defindex`),"
            + " `when`=VALUES(`when`)";
};

BotPorting.prototype.setTradeOfferStatus = function (steamid, status, status_info, callback) {
    var user = this.users.get(steamid);
    var shopTrade = user.getShopTrade();
    shopTrade.setStatus(status);
    shopTrade.setStatusInfo(status_info);
    shopTrade.commit();
    if (shopTrade.isClosed()) {
        if (!shopTrade.hasBeenAccepted()) {
            shopTrade.dereserveItems();
        } else {
            this.increaseHatTradeCount(steamid);
        }
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
            var shopTrade = self.users.get(active_trades[i].partnerID).getShopTrade();
            if (shopTrade.getMode() === "offer") {
                result[active_trades[i].partnerID] = self.getPortedTradeOffer(shopTrade);
            }
        }
        callback(result);
        self.fetching_active_trades = false;
    });
};

BotPorting.prototype.getPortedTradeOffer = function (shopTrade) {
    var trade = shopTrade.valueOf();
    trade.additional = shopTrade.getStatusInfo();
    trade.steamid = shopTrade.partner.getSteamid();
    for (var i = 0; i < trade.items.me.length; i += 1) {
        trade.items.me[i].id = trade.items.me[i].id.toString();
    }
    for (var i = 0; i < trade.items.them.length; i += 1) {
        trade.items.them[i].id = trade.items.them[i].id.toString();
    }
    return trade;
};

BotPorting.prototype.getCurrency = function (callback) {
    var currency = this.shop.tf2Currency.valueOf();
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

BotPorting.prototype.checkIncomingOffer = function (data, callback) {
    this.log.debug("Checking incoming offer for steamid: " + data.steamid);
    var self = this;
    var user = this.users.get(data.steamid);
    this.isScammer(data.steamid, function (scammer) {
        if (!scammer) {
            var itemID = parseInt(data.myItem.id);
            var shopItem = self.shop.getItem(itemID);
            if (shopItem) {
                if (self.shop.reservations.get(itemID).getHolder() === "") {
                    self.shop.reservations.add(user.getSteamid(), itemID);
                    self.log.debug("Success, allowing trade for item " + shopItem.name + " (" + itemID + ") scrapPrice: " + shopItem.scrapPrice);
                    callback({result: "success", scrapPrice: shopItem.scrapPrice});
                } else {
                    self.log.debug("Rejecting, item is already reserved");
                    callback({result: "error", error: "item_reserved"});
                }
            } else {
                self.log.debug("Rejecting, item is not in the shop");
                callback({result: "error", error: "not_in_shop"});
            }
        } else {
            self.log.debug("Rejecting, user is a scammer");
            callback({result: "error", error: "scammer"});
        }
    });
};

BotPorting.prototype.isScammer = function (steamid, callback) {
    this.ajax({action: "steamrep", steamid: steamid}, function (result) {
        callback(result.hasOwnProperty("scammer") && result.scammer);
    });
};

BotPorting.prototype.ajax = function (data, callback) {
    data.key = this.site_key;
    data.predata = "v3_bot_porting.php";
    var myInterface = {
        name: "include",
        method: {
            name: "zxcv",
            httpmethod: "POST",
            parameters: data
        }
    };
    this.site_api.callAPI(myInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};

BotPorting.prototype.dereserveItem = function (data, callback) {
    var itemID = data.myitemid;
    if (this.shop.reservations.get(itemID).getHolder() === data.steamid) {
        this.shop.reservations.cancel(itemID);
        callback({result: "success"});
    } else {
        callback({result: "error"});
    }
};