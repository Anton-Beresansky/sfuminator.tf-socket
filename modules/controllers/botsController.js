module.exports = BotsController;

var TraderBot = require('./../../bots/traderBot.js');

/**
 * @class BotsController
 * @constructor
 */
function BotsController(sfuminator) {
    this.sfuminator = sfuminator;
    /**
     * @type {TraderBot[]}
     */
    this.tradeBots = [];
    this.loadBots();
}

BotsController.prototype.loadBots = function () {
    var tradeBotSteamids = this.sfuminator.getCFG().getTradeBotSteamids();
    for (var i = 0; i < tradeBotSteamids.length; i += 1) {
        this.tradeBots.push(new TraderBot(this.sfuminator.shop.getBot(tradeBotSteamids[i])));
    }
};

/**
 * @returns {TraderBot[]}
 */
BotsController.prototype.getTradingBots = function () {
    return this.tradeBots;
};