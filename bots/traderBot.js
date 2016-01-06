module.exports = TraderBot;

var SteamClient = require("../lib/steamClient.js");
var SteamGames = require("../lib/steamGames.js");
var TradeConstants = require("../modules/trade/tradeConstants.js");
var SteamTradeOffer = require("../lib/steamTradeOffer.js");
var BotInteractions = require("./botInteractions.js");
var Logs = require("../lib/logs.js");

/**
 * Trader Bot
 * @class TraderBot
 * @param {User} user
 * @param {Sfuminator} sfuminator
 * @constructor
 */
function TraderBot(user, sfuminator) {
    this.user = user;
    this.sfuminator = sfuminator;
    this.steamid = user.getSteamid();
    this.friendListLimit = 170;
    /**
     * @type {SteamClient}
     */
    this.steamClient = new SteamClient(this.steamid);
    /**
     * @type {ShopTrade[]}
     */
    this.assignedShopTrades = [];
    /**
     * @type {BotInteractions}
     */
    this.interactions = new BotInteractions();

    this.log = new Logs({applicationName: "Trader bot " + this.steamid, color: "grey", dim: true});
    var self = this;
    this.steamClient.login();
    this.steamClient.on('loggedIn', function () {
        self.onLogin();
    });
}

TraderBot.prototype.onLogin = function () {
    var self = this;
    this.steamClient.setAutomaticMobileTradingConfirmation();
    this.steamClient.startTradeOffersManagerPolling();
    this.steamClient.on("newFriend", function (friend) {
        self.log.debug("I'm now friend with " + friend.getSteamid());
        if (self.steamClient.getNumberOfFriends() > self.friendListLimit) {
            self.steamClient.getOldestFriend().remove();
        }
    });
    this.steamClient.on("friendList", function () {
        self.log.debug("My friend list have " + self.steamClient.getNumberOfFriends() + " friends");
        while (self.steamClient.getNumberOfFriends() > self.friendListLimit) {
            self.steamClient.getOldestFriend([self.sfuminator.admin]).remove();
        }
    });
    this.interactions.on('sendMessage', function (steamid, message) {
        self.steamClient.sendMessage(steamid, message);
    });
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
    var sfuminatorUser = this.sfuminator.users.get(partnerSteamid);
    this.assignShopTrade(shopTrade);
    shopTrade.setBot(this.getUser());

    if (!shopTrade.hasSteamToken() && !this.steamClient.isFriend(partnerSteamid)) {
        this.steamClient.addFriend(partnerSteamid);
        this.steamClient.onFriendWith(partnerSteamid, function () {
            self.steamClient.getFriend(partnerSteamid).sendMessage(self.interactions.getMessage("tradeOffer_hello", sfuminatorUser));
            if (shopTrade.areItemsReserved()) {
                self.sendTrade(shopTrade);
            } else {
                shopTrade.onceItemsReserved(function () {
                    self.sendTrade(shopTrade);
                });
            }
        });
    } else {
        shopTrade.onceItemsReserved(function () {
            self.steamClient.getFriend(partnerSteamid).sendMessage(self.interactions.getMessage("tradeOffer_hello", sfuminatorUser));
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
    var sfuminatorUser = this.sfuminator.users.get(partnerSteamid);
    var steamTradeOffer = shopTrade.getSteamTrade();
    steamTradeOffer.on("itemsRevoked", function () {
        steamTradeOffer.pauseAutoRetry();
        self.log.warning("Items have been revoked, will retry currency reservation");
        shopTrade.getPartner().getTF2Backpack().get(function () {
            shopTrade.currency.cleanAssets();
            shopTrade.onceItemsReserved(function () {
                steamTradeOffer.resetItems();
                shopTrade.injectSteamTrade(steamTradeOffer);
                steamTradeOffer.continueAutoRetry();
            });
            shopTrade.reserveItems();
        });
    });
    steamTradeOffer.on("tradeError", function (error) {
        shopTrade.cancel();
        self.log.warning("Error sending offer: " + error);
        partner.sendMessage("Oh no! Steam returned an error when sending the offer: " + error);
    });
    steamTradeOffer.on("tradeSent", function (tradeOfferID) {
        shopTrade.setAsSent(tradeOfferID);
        self.log.debug("Offer to " + partnerSteamid + " has been sent. (" + tradeOfferID + ")");
        partner.sendMessage(self.interactions.getMessage("tradeOffer_sent", sfuminatorUser)
            + " http://steamcommunity.com/tradeoffer/" + tradeOfferID + "\n"
            + "It will be available for the next " + parseInt(steamTradeOffer.afkTimeoutInterval / 60000) + " minutes");
    });
    steamTradeOffer.on("partnerDeclined", function () {
        shopTrade.cancel();
        self.log.debug("Offer to " + partnerSteamid + " has been declined");
        partner.sendMessage(self.interactions.getMessage("tradeOffer_declined", sfuminatorUser));
    });
    steamTradeOffer.on("partnerCancelled", function () {
        self.log.debug("Offer to " + partnerSteamid + " has been cancelled");
        partner.sendMessage(self.interactions.getMessage("tradeOffer_cancel", sfuminatorUser));
    });
    steamTradeOffer.on("partnerIsAFK", function () {
        shopTrade.cancel();
        self.log.debug("Offer to " + partnerSteamid + " took too long to accept, partner is AFK");
        partner.sendMessage(self.interactions.getMessage("tradeOffer_afk_kick", sfuminatorUser));
    });
    steamTradeOffer.on("partnerAccepted", function () {
        shopTrade.setAsAccepted();
        self.log.debug("Offer to " + partnerSteamid + " has been accepted");
        partner.sendMessage(self.interactions.getMessage("trade_complete", sfuminatorUser));
    });
};