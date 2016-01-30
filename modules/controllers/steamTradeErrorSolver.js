module.exports = SteamTradeErrorSolver;

var SteamTradeError = require("./../../lib/steamTradeError.js");
var Logs = require("./../../lib/logs.js");

/**
 * @param {Sfuminator} sfuminator
 * @constructor
 */
function SteamTradeErrorSolver(sfuminator) {
    this.sfuminator = sfuminator;
    this.botsController = this.sfuminator.getBotsController();

    this.currentlySolvingErrorCodeList = [];
    /**
     * @type {SteamTradeOffer[]}
     */
    this.heldTrades = [];
    this.log = new Logs({applicationName: "Trade Error Solver", color: "magenta"});
}

/**
 * @param {SteamTradeOffer} steamTradeOffer
 * @param {SteamTradeError} steamTradeError
 */
SteamTradeErrorSolver.prototype.handle = function (steamTradeOffer, steamTradeError) {
    var self = this;
    var errorCode = steamTradeError.getCode();
    this.log.debug("Handling steam trade error: " + errorCode);

    if (errorCode === SteamTradeError.ERROR.MAX_SENT_OFFER_LIMIT_REACHED) {

    } else if (errorCode === SteamTradeError.ERROR.NO_WEB_LOGIN) {
        this.holdTrade(steamTradeOffer);
        if (!this.isCodeBeingSolved(errorCode)) {
            this.alertCodeErrorSolvingFor(errorCode);
            this.solve_NO_WEB_LOGIN(steamTradeOffer, function () {
                self.releaseTradesWithErrorCode(errorCode);
            });
        }
    } else if (errorCode === SteamTradeError.ERROR.ITEMS_REVOKED) {

    }

};

/**
 * @param {Number} errorCode
 */
SteamTradeErrorSolver.prototype.isCodeBeingSolved = function (errorCode) {
    return this.currentlySolvingErrorCodeList.indexOf(errorCode) !== -1;
};

/**
 * @param {Number} errorCode
 */
SteamTradeErrorSolver.prototype.alertCodeErrorSolvingFor = function (errorCode) {
    if (!this.isCodeBeingSolved(errorCode)) {
        this.currentlySolvingErrorCodeList.push(errorCode);
    }
};

/**
 * @param {SteamTradeOffer} steamTradeOffer
 */
SteamTradeErrorSolver.prototype.holdTrade = function (steamTradeOffer) {
    steamTradeOffer.pauseAutoRetry();
    this.heldTrades.push(steamTradeOffer);
};

SteamTradeErrorSolver.prototype.releaseTradesWithErrorCode = function (errorCode) {
    this.log.debug("Releasing trades with error code: " + errorCode);
    var i;
    for (i = 0; i < this.currentlySolvingErrorCodeList.length; i += 1) {
        if (this.currentlySolvingErrorCodeList[i] === errorCode) {
            this.currentlySolvingErrorCodeList.splice(i, 1);
            break;
        }
    }
    var heldTradesLength = this.heldTrades.length;
    for (i = 0; i < heldTradesLength; i += 1) {
        if (this.heldTrades[i].getTradeError().getCode() === errorCode) {
            this.heldTrades[i].continueAutoRetry();
            this.heldTrades.splice(i, 1);
            i -= 1;
            heldTradesLength -= 1;
        }
    }
};

/**
 * @param {ShopTrade} shopTrade
 */
SteamTradeErrorSolver.prototype.onWrongItemIds = function (shopTrade) {

};

//////////////// SOLVING ERROR PROCEDURES

/**
 * @param {SteamTradeOffer} steamTradeOffer
 * @param callback
 */
SteamTradeErrorSolver.prototype.solve_NO_WEB_LOGIN = function (steamTradeOffer, callback) {
    this.log.debug("Solving: NO_WEB_LOGIN");
    var steamClient = steamTradeOffer.getSteamClient();
    var bot = this.sfuminator.getBotsController().getBot(steamClient.getSteamid());

    bot.unsetAsAvailable();
    steamClient.logOut();
    setTimeout(function () {
        steamClient.login();
        steamClient.onceLoggedIn(function () {
            setTimeout(function () {
                callback();
            }, 2000);
        });
    }, 5000);
};