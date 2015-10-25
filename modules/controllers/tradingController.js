module.exports = TradingController;

var Logs = require('./../../lib/logs.js');
var TradeConstants = require('./../trade/tradeConstants.js');

/**
 * @class TradingController
 * @param {Sfuminator} sfuminator
 * @constructor
 */
function TradingController(sfuminator) {
    this.sfuminator = sfuminator;
    this.log = new Logs({applicationName: "TradingController", color: "cyan", dim: true});
}

/**
 *
 * @param {ShopTrade} newShopTrade
 */
TradingController.prototype.startOffNewShopTrade = function (newShopTrade) {
    //var assignedBot = this.getBestAvailableBot();
    //if (!assignedBot) {
    //    this.log.error("Wasn't able to assign bot");
    //} else {
    //    assignedBot.assignShopTrade(newShopTrade);
    newShopTrade.setBot(this.sfuminator.users.get(this.sfuminator.shop.getBots()[0].getSteamid())); //temp
    newShopTrade.reserveItems();
    newShopTrade.setAsSending();
    //}
};

/**
 * @returns {TraderBot|Boolean}
 */
TradingController.prototype.getBestAvailableBot = function () {
    var tradingBots = this.sfuminator.getBotsController().getTradingBots();
    var bestBot = false;
    for (var i = 0; i < tradingBots.length; i += 1) {
        if (tradingBots[i].isAvailable()) {
            if (!(bestBot instanceof TraderBot)) {
                bestBot = tradingBots[i];
            } else if (tradingBots[i].getAssignedShopTradesCount() > bestBot.getAssignedShopTradesCount()) {
                bestBot = tradingBots[i];
            }
        }
    }
    return bestBot;
};