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

TraderBot.prototype.getSteamid = function () {
    return this.steamid;
};

TraderBot.prototype.getUser = function () {
    return this.user;
};

TraderBot.prototype.isAvailable = function () {
    return this.steamClient.isLogged();
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
};

TraderBot.prototype.onLogin = function () {

};