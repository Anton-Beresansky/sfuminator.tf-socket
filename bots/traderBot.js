module.exports = TraderBot;

var SteamClient = require("../modules/steamClient.js");
var SteamGames = require("../lib/steamGames.js");
var TradeConstants = require("../modules/trade/tradeConstants.js");

/**
 * Trader Bot
 * @class TraderBot
 * @param {User} user
 * @constructor
 */
function TraderBot(user) {
    this.user = user;
    this.steamid = user.getSteamid();
    this.steamClient = new SteamClient(this.steamid);
    this.steamClient.login();

    /**
     * @type {ShopTrade[]}
     */
    this.assignedShopTrades = [];

    var self = this;
    this.steamClient.on('loggedIn', function () {
        self.onLogin();
    });
}

TraderBot.prototype.onLogin = function () {

};

TraderBot.prototype.getSteamid = function () {
    return this.steamid;
};

TraderBot.prototype.getUser = function () {
    return this.user;
};

TraderBot.prototype.isAvailable = function () {
    return this.steamClient.isLogged(); //&& isWebLogged ??
    /* I mean I'm not sure if that's needed but
     * probably wen you are logged in it doesn't meant you
     * can successfully operate on web even if webLogin happens
     * consequentially to the client login, maybe we need to fetch
     * a steam web page and check if I'm actually web logged in?
     * */
};

TraderBot.prototype.getAssignedShopTradesCount = function () {
    return this.getAssignedShopTrades().length;
};

TraderBot.prototype.getAssignedShopTrades = function () {
    return this.assignedShopTrades;
};

TraderBot.prototype.assignShopTrade = function (shopTrade) {
    this.assignedShopTrades.push(shopTrade);
    shopTrade.setBot(this.getUser());

    this.steamClient.addFriend(shopTrade.getPartner().getSteamid());

    var self = this;
    shopTrade.on('itemsReserved', function () {
        self.makeTrade(shopTrade);
    });
};

TraderBot.prototype.makeTrade = function (shopTrade) {
    this.steamClient.sendMessage(shopTrade.getPartner().getSteamid(), "Yo, it's time to trade");

    var assets = shopTrade.getAssets();
    var itemsFromMe = [];
    var itemsFromThem = [];
    for (var i = 0; i < assets.length; i += 1) {
        var item = assets[i];
        if (item.isMineItem()) {
            itemsFromThem.push(item.getTradeOfferAsset());
        } else {
            itemsFromMe.push(item.getTradeOfferAsset());
        }
    }
    var options = {
        partnerSteamId: shopTrade.getPartner().getSteamid(),
        itemsFromMe: itemsFromMe,
        itemsFromThem: itemsFromThem,
        message: "Here you go ;)"
    };

    var self = this;
    this.steamClient.tradeOffers.makeOffer(options, function (tradeOfferID) {
        self.steamClient.sendMessage(shopTrade.getPartner().getSteamid(), "BUYA! " + tradeOfferID);
    });
};