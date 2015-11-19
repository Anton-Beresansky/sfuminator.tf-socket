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
        this.tradeBots.push(new TraderBot(this.sfuminator.shop.getBotUser(tradeBotSteamids[i])));
    }
};

/**
 * @param {String} steamid
 * @returns {TraderBot}
 */
BotsController.prototype.getBot = function (steamid) {
    for (var i = 0; i < this.tradeBots.length; i += 1) {
        if (this.tradeBots[i].getSteamid() === steamid) {
            return this.tradeBots[i];
        }
    }
};

/**
 * @returns {TraderBot[]}
 */
BotsController.prototype.getTradingBots = function () {
    return this.tradeBots;
};