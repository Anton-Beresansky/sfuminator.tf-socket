module.exports = TraderBot;

var SteamClient = require("../lib/steamClient.js");
var SteamGames = require("../lib/steamGames.js");
var TradeConstants = require("../modules/trade/tradeConstants.js");
var SteamTradeOffer = require("../lib/steamTradeOffer.js");
var SteamTradeError = require('../lib/steamTradeError.js');
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
    this.available = false;
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
    this.steamClient.onceLoggedIn(function () {
        self.onFirstLogin();
    });
}

TraderBot.AUTOMATIC_CANCEL_TIME = 600000; //10 minutes

TraderBot.prototype.onFirstLogin = function () {
    var self = this;
    this.steamClient.on("newFriend", function (friend) {
        self.log.debug("I'm now friend with " + friend.getSteamid());
        if (self.steamClient.getNumberOfFriends() > self.friendListLimit) {
            self.steamClient.getOldestFriend(self.sfuminator.admins).remove();
        }
    });
    this.steamClient.on("friendList", function () {
        self.log.debug("My friend list have " + self.steamClient.getNumberOfFriends() + " friends");
        while (self.steamClient.getNumberOfFriends() > self.friendListLimit) {
            self.steamClient.getOldestFriend(self.sfuminator.admins).remove();
        }
    });
    this.steamClient.on('message', function (steamid, message) {
        var answer = self.interactions.getAnswer(message, self.sfuminator.users.get(steamid));
        if (answer) {
            self.steamClient.sendMessage(steamid, answer);
        }
    });
    this.interactions.on('sendMessage', function (steamid, message) {
        self.steamClient.sendMessage(steamid, message);
    });
    this.interactions.on('postProfileComment', function (steamid, message) {
        self.log.debug("Leaving a comment on " + steamid + " profile");
        if (self.steamClient.isFriend(steamid)) {
            self.steamClient.getFriend(steamid).postProfileComment(message, function (success) {
                if (!success) {
                    self.steamClient.sendMessage(steamid, "There was a problem when leaving the comment, I guess we will try this later, sorry :(");
                }
            });
        } else {
            //If not friend, will try posting and hoping he has public comments
            self.steamClient.postProfileComment(steamid, message);
        }
    });

    this.steamClient.setAutomaticMobileTradingConfirmation();
    this.steamClient.startTradeOffersManagerPolling();
    this.steamClient.startItemsInEscrowPolling();
    this.steamClient.setAutomaticTradeCancelAfter(TraderBot.AUTOMATIC_CANCEL_TIME);
    this.setAsAvailable();
};

TraderBot.prototype.getSteamid = function () {
    return this.steamid;
};

TraderBot.prototype.getUser = function () {
    return this.user;
};

//Available to do stuff...
TraderBot.prototype.isAvailable = function () {
    return this.steamClient.isLogged() && this.available;
    //&& isWebLogged ??
    /* I mean I'm not sure if that's needed but
     * probably wen you are logged in it doesn't meant you
     * can successfully operate on web even if webLogin happens
     * consequentially to the client login, maybe we need to fetch
     * a steam web page and check if I'm actually web logged in?
     * */
};

TraderBot.prototype.setAsAvailable = function () {
    this.available = true;
};

TraderBot.prototype.unsetAsAvailable = function () {
    this.available = false;
};

TraderBot.prototype.getAssignedShopTradesCount = function () {
    return this.getAssignedShopTrades().length;
};

TraderBot.prototype.getAssignedShopTrades = function () {
    return this.assignedShopTrades;
};

TraderBot.prototype.assignShopTrade = function (shopTrade) {
    this.assignedShopTrades.push(shopTrade);
    var self = this;
    shopTrade.on("newStatus", function (status) {
        if (status === TradeConstants.status.CLOSED) {
            for (var i = 0; i < self.assignedShopTrades.length; i += 1) {
                if (self.assignedShopTrades[i].getID() === shopTrade.getID()) {
                    self.assignedShopTrades.splice(i, 1);
                    break;
                }
            }
        }
    });
};

/**
 * @param {ShopTrade} shopTrade
 */
TraderBot.prototype.sendShopTrade = function (shopTrade) {
    var self = this;
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    var sfuminatorUser = this.sfuminator.users.get(partnerSteamid);
    this.assignShopTrade(shopTrade);
    shopTrade.setAsSending();
    if (!shopTrade.isUsingTradeOfferToken() && !this.steamClient.isFriend(partnerSteamid)) {
        this.steamClient.addFriend(partnerSteamid);
        shopTrade.setAsWaitingForFriendRelation();
        shopTrade.on('friendRequestTimeout', function () {
            self.log.debug("Friend request timeout, removing and cancelling");
            self.steamClient.removeFriend(partnerSteamid);
            shopTrade.cancel();
        });
        this.steamClient.onFriendWith(partnerSteamid, function () {
            if (shopTrade.isClosed()) {
                return;
            }
            self.steamClient.getFriend(partnerSteamid).sendMessage(self.interactions.getMessage("tradeOffer_hello", sfuminatorUser));
            if (shopTrade.areItemsReady()) {
                self.finalizeSendShopTrade(shopTrade);
            } else {
                shopTrade.onceItemsAreReady(function () {
                    self.finalizeSendShopTrade(shopTrade);
                });
            }
        });
    } else {
        this.log.debug("Using trade token: " + shopTrade.getPartner().getTradeToken());
        shopTrade.onceItemsAreReady(function () {
            self.finalizeSendShopTrade(shopTrade);
        });
    }
    shopTrade.readyItems();
};

/**
 * @param {ShopTrade} shopTrade
 */
TraderBot.prototype.finalizeSendShopTrade = function (shopTrade) {
    shopTrade.setAsMaking();
    this.createSteamTrade(shopTrade);
    this._bindShopTrade(shopTrade);
    shopTrade.steamTrade.make();
    shopTrade.setStatusInfo(TradeConstants.statusInfo.active.MAKING);
    shopTrade.commit();
};

/**
 * @param {ShopTrade} shopTrade
 * @returns {SteamTradeOffer}
 */
TraderBot.prototype.createSteamTrade = function (shopTrade) {
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    var steamTrade = new SteamTradeOffer(this.steamClient, partnerSteamid);

    steamTrade.setAutomaticAFKCheck();
    steamTrade.setMessage("Here you go ;)");
    if (shopTrade.getPartner().hasTradeToken()) {
        steamTrade.setToken(shopTrade.getPartner().getTradeToken());
    }

    shopTrade.injectSteamTrade(steamTrade);
    return steamTrade;
};

TraderBot.prototype.sendTradingMessage = function (shopTrade, message) {
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    if (this.steamClient.isFriend(partnerSteamid) && !shopTrade.isUsingTradeOfferToken()) {
        var friend = this.steamClient.getFriend(partnerSteamid);
        friend.sendMessage(message);
    }
};

/**
 * @param {ShopTrade} shopTrade
 * @private
 */
TraderBot.prototype._bindShopTrade = function (shopTrade) {
    var self = this;
    var partnerSteamid = shopTrade.getPartner().getSteamid();
    var sfuminatorUser = this.sfuminator.users.get(partnerSteamid);
    var steamTradeOffer = shopTrade.getSteamTrade();
    steamTradeOffer.on("handleTradeErrorSolving", function (error) {
        self.sfuminator.getBotsController().steamTradeErrorSolver.handle(steamTradeOffer, error);
    });
    steamTradeOffer.on("wrongItemIDs", function () {
        self.sfuminator.getBotsController().steamTradeErrorSolver.onWrongItemIds(shopTrade);
    });
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
    steamTradeOffer.on("tradeError", function (steamTradeError) {
        shopTrade.cancel(steamTradeError.getCode());
        self.log.warning("Error sending offer: " + steamTradeError.getCode());
        if (steamTradeError.getCode() === SteamTradeError.ERROR.NOT_AVAILABLE_FOR_TRADE) {
            self.sendTradingMessage(shopTrade, self.interactions.message_senteces.steamTradeError.not_available_for_trade);
        } else {
            self.sendTradingMessage(shopTrade, self.interactions.message_senteces.steamTradeError.generic + steamTradeError.getMessage());
            logSteamError(shopTrade, steamTradeError);
        }
    });
    steamTradeOffer.on("tradeSent", function (tradeOfferID) {
        shopTrade.setAsSent(tradeOfferID);
        self.log.debug("Offer to " + partnerSteamid + " has been sent. (" + tradeOfferID + ")");
        self.sendTradingMessage(shopTrade, self.interactions.getMessage("tradeOffer_sent", sfuminatorUser)
            + " http://steamcommunity.com/tradeoffer/" + tradeOfferID + "\n"
            + "It will be available for the next " + parseInt(steamTradeOffer.afkTimeoutInterval / 60000) + " minutes");
    });
    steamTradeOffer.on("partnerDeclined", function () {
        shopTrade.cancel(TradeConstants.statusInfo.closed.DECLINED);
        self.log.debug("Offer to " + partnerSteamid + " has been declined");
        self.sendTradingMessage(shopTrade, self.interactions.getMessage("tradeOffer_declined", sfuminatorUser));
    });
    steamTradeOffer.on("cancelled", function () {
        self.log.debug("Offer to " + partnerSteamid + " has been cancelled");
        if (shopTrade.getStatusInfo() === TradeConstants.statusInfo.closed.CANCELLED) {
            self.sendTradingMessage(shopTrade, self.interactions.getMessage("tradeOffer_cancel", sfuminatorUser));
        }
    });
    steamTradeOffer.on("partnerIsAFK", function () {
        shopTrade.cancel(TradeConstants.statusInfo.closed.AFK);
        self.log.debug("Offer to " + partnerSteamid + " took too long to accept, partner is AFK");
        self.sendTradingMessage(shopTrade, self.interactions.getMessage("tradeOffer_afk_kick", sfuminatorUser));
    });
    steamTradeOffer.on("partnerAccepted", function (escrow) {
        shopTrade.setAsAccepted();
        self.log.debug("Offer to " + partnerSteamid + " has been accepted");
        if (escrow) {
            self.sendTradingMessage(shopTrade, self.interactions.getMessage("trade_complete_escrow", sfuminatorUser));
        } else {
            self.sendTradingMessage(shopTrade, self.interactions.getMessage("trade_complete", sfuminatorUser));
        }
        if (shopTrade.isUsingTradeOfferToken()) {
            self.interactions.postReputationComment(partnerSteamid);
        }
    });
};

/**
 * @param {ShopTrade} shopTrade
 * @param {SteamTradeError} error
 */
function logSteamError(shopTrade, error) {
    console.log("Couldn't fix error: " + error.getCode());
    console.log("-- Trade info --");
    console.log("Assets balance: " + shopTrade.currency.getSignedTradeBalance());
    console.log("Trade items: " + JSON.stringify(shopTrade.items));
    console.log("-- Trade assets --");
    var assets = shopTrade.getAssets();
    for (var i = 0; i < assets.length; i += 1) {
        var ass = assets[i];
        var itm = assets[i].getItem();
        console.log(""
            + "Owner: " + itm.getOwner() + ", "
            + "Mine: " + ass.isMineItem() + ", "
            + "ItemID: " + itm.getID() + ", "
            + "ItemName: " + itm.getFullName()
        );
    }
}