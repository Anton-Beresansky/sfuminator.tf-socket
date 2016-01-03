module.exports = TraderBot;

var SteamClient = require("../lib/steamClient.js");
var SteamGames = require("../lib/steamGames.js");
var TradeConstants = require("../modules/trade/tradeConstants.js");
var SteamTradeOffer = require("../lib/steamTradeOffer.js");
var Logs = require("../lib/logs.js");

/**
 * Trader Bot
 * @class TraderBot
 * @param {User} user
 * @constructor
 */
function TraderBot(user) {
    this.user = user;
    this.steamid = user.getSteamid();
    /**
     * @type {SteamClient}
     */
    this.steamClient = new SteamClient(this.steamid);
    this.steamClient.login();

    /**
     * @type {ShopTrade[]}
     */
    this.assignedShopTrades = [];

    this.log = new Logs({applicationName: "Trader bot " + this.steamid, color: "grey", dim: true});
    var self = this;
    this.steamClient.on('loggedIn', function () {
        self.onLogin();
    });
}

TraderBot.prototype.onLogin = function () {
    this.steamClient.setAutomaticMobileTradingConfirmation();
    this.steamClient.startTradeOffersManagerPolling();
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
};

/**
 * @param {ShopTrade} shopTrade
 */
TraderBot.prototype.sendShopTrade = function (shopTrade) {
    var self = this;
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    var partner = this.steamClient.getFriend(partnerSteamid);
    this.assignShopTrade(shopTrade);
    shopTrade.setBot(this.getUser());

    if (!shopTrade.hasSteamToken() && !this.steamClient.isFriend(partnerSteamid)) {
        this.steamClient.addFriend(partnerSteamid);
        this.steamClient.onFriendWith(partnerSteamid, function () {
            partner.sendMessage("Let's trade");
            if (shopTrade.areItemsReserved()) {
                self.sendTrade(shopTrade);
            } else {
                shopTrade.onItemsReserved(function () {
                    self.sendTrade(shopTrade);
                });
            }
        });
    } else {
        shopTrade.onItemsReserved(function () {
            self.sendTrade(shopTrade);
        });
    }
};

/**
 * @param {ShopTrade} shopTrade
 */
TraderBot.prototype.sendTrade = function (shopTrade) {
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    var steamTrade = new SteamTradeOffer(this.steamClient, partnerSteamid);

    steamTrade.setAutomaticAFKCheck();
    steamTrade.setMessage("Here you go ;)");
    if (shopTrade.hasSteamToken()) {
        steamTrade.setToken(shopTrade.getSteamToken());
    }

    shopTrade.injectSteamTrade(steamTrade);
    shopTrade.steamTrade.make();
    this._bindTrade(shopTrade);
};

/**
 * @param {ShopTrade} shopTrade
 * @private
 */
TraderBot.prototype._bindTrade = function (shopTrade) {
    var self = this;
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    var partner = this.steamClient.getFriend(partnerSteamid);
    var steamTradeOffer = shopTrade.getSteamTrade();
    steamTradeOffer.on("tradeError", function (error) {
        shopTrade.cancel();
        self.log.warning("Error sending offer: " + error);
        partner.sendMessage("Oh no! Steam returned an error when sending the offer: " + error);
    });
    steamTradeOffer.on("tradeSent", function (tradeOfferID) {
        shopTrade.setAsSent(tradeOfferID);
        self.log.debug("Offer to " + partnerSteamid + " has been sent. (" + tradeOfferID + ")");
        partner.sendMessage("Offer sent! http://steamcommunity.com/tradeoffer/" + tradeOfferID + "\n" +
            "It will be available for the next " + parseInt(steamTradeOffer.afkTimeoutInterval / 60000) + " minutes");
    });
    steamTradeOffer.on("partnerDeclined", function () {
        shopTrade.cancel();
        self.log.debug("Offer to " + partnerSteamid + " has been declined");
        partner.sendMessage("Oh, it seems you declined the trade offer...");
    });
    steamTradeOffer.on("partnerCancelled", function () {
        shopTrade.cancel();
        self.log.debug("Offer to " + partnerSteamid + " has been cancelled");
        partner.sendMessage("Oh... you cancelled the trade");
    });
    steamTradeOffer.on("partnerIsAFK", function () {
        shopTrade.cancel();
        self.log.debug("Offer to " + partnerSteamid + " took too long to accept, partner is AFK");
        partner.sendMessage("You didn't accept the offer in time. I cancelled the trade");
    });
    steamTradeOffer.on("partnerAccepted", function () {
        shopTrade.setAsAccepted();
        self.log.debug("Offer to " + partnerSteamid + " has been accepted");
        partner.sendMessage("Thank you! Enjoy your new items!");
    });
};