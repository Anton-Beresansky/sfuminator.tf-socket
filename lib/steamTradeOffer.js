module.exports = SteamTradeOffer;

var MAX_MAKE_RETRIES = 3;
var RETRY_MAKE_INTERVAL = 1500;

var Events = require("events");
var Logs = require("./logs.js");
var SteamTradeError = require("./steamTradeError.js");
var SteamGames = require("./steamGames.js");
var SteamTradeStatus = {
    Invalid: 1,
    Active: 2,            // This trade offer has been sent, neither party has acted on it yet.
    Accepted: 3,          // The trade offer was accepted by the recipient and items were exchanged.
    Countered: 4,         // The recipient made a counter offer
    Expired: 5,           // The trade offer was not accepted before the expiration date
    Canceled: 6,          // The sender cancelled the offer
    Declined: 7,          // The recipient declined the offer
    InvalidItems: 8,      // Some of the items in the offer are no longer available (indicated by the missing flag in the output)
    CreatedNeedsConfirmation: 9, // The offer hasn't been sent yet and is awaiting further confirmation
    CanceledBySecondFactor: 10, // Either party canceled the offer via email/mobile confirmation
    InEscrow: 11          // The trade has been placed on hold
};

/**
 * @param {SteamClient} steamClient
 * @param {string} partnerSteamID
 * @event tradeError {SteamTradeError} error
 * @event offerCreated {String} tradeOfferID if enabled, confirmation is still needed
 * @event tradeSent {String} tradeOfferID if enabled, trade has been also confirmed
 * @event partnerAccepted
 * @event partnerDeclined
 * @event partnerCanceled
 * @event partnerIsAFK
 * @constructor
 */
function SteamTradeOffer(steamClient, partnerSteamID) {
    this.steamClient = steamClient;
    this.partnerSteamID = partnerSteamID;
    this.itemsFromMe = [];
    this.itemsFromThem = [];
    this.accessToken = null;
    this.message = "";
    this.log = new Logs({applicationName: "SteamTradeOffer " + this.partnerSteamID, color: "red", dim: true});

    this.tradeError = null;
    this.numberOfRetries = 0;
    this.afkTimeoutInterval = 1000 * 60 * 3;
    this.automaticAFKCheck = false;
    Events.EventEmitter.call(this);
}

require("util").inherits(SteamTradeOffer, Events.EventEmitter);

/**
 * @param {SteamTradeOfferItemStructure} item
 */
SteamTradeOffer.prototype.addMyItem = function (item) {
    this.itemsFromMe.push(item);
};

/**
 * @param {SteamTradeOfferItemStructure} item
 */
SteamTradeOffer.prototype.addThemItem = function (item) {
    this.itemsFromThem.push(item);
};

SteamTradeOffer.prototype.setToken = function (token) {
    this.accessToken = token;
};

SteamTradeOffer.prototype.setMessage = function (message) {
    this.message = message;
};

SteamTradeOffer.prototype.make = function (callback) {
    if (this.itemsFromMe.length || this.itemsFromThem.length) {
        var self = this;
        self.numberOfRetries = 0;
        var tryTrade = function () {
            self.numberOfRetries += 1;
            self.steamClient.tradeOffers.makeOffer(self.getOptions(), function (error, tradeResult) {
                if (error && self.numberOfRetries <= MAX_MAKE_RETRIES) {
                    self.tradeError = new SteamTradeError(error);
                    self.log.warning("Error making offer: " + self.tradeError.getCode());
                    self.solveError();
                    setTimeout(function () {
                        tryTrade();
                    }, RETRY_MAKE_INTERVAL);
                } else {
                    if (error) {
                        if (typeof  callback === "function") {
                            callback(null);
                        }
                        self.emit("tradeError", error);
                    } else {
                        self.tradeError = null;
                        self.tradeOfferID = tradeResult.tradeofferid;

                        if (typeof callback === "function") {
                            callback(self.tradeOfferID);
                        }
                        self.emit("offerCreated", self.tradeOfferID);

                        self._startListeningForChanges();
                    }
                }
            });
        };
        tryTrade();
    } else {
        this.log.warning("Empty assets can't proceed with offer");
    }
};

SteamTradeOffer.prototype.cancel = function () {
    this.steamClient.tradeOffers.cancelOffer({tradeOfferId: this.getTradeOfferID()});
};

SteamTradeOffer.prototype.getTradeOfferID = function () {
    return this.tradeOfferID;
};

SteamTradeOffer.prototype.getOptions = function () {
    var options = {
        partnerSteamId: this.partnerSteamID,
        itemsFromMe: this.itemsFromMe,
        itemsFromThem: this.itemsFromThem
    };
    if (this.accessToken) {
        options.accessToken = this.accessToken;
    }
    if (this.message) {
        options.message = this.message;
    }
    return options;
};

SteamTradeOffer.prototype.hasErrored = function () {
    return this.tradeError instanceof SteamTradeError;
};

/**
 * @returns {SteamTradeError}
 */
SteamTradeOffer.prototype.getTradeError = function () {
    return this.tradeError;
};

SteamTradeOffer.prototype.solveError = function () {
    var error = this.getTradeError();
    if (error.getCode() === SteamTradeError.SteamError26) {
        if (this.numberOfRetries === 1) {
            if (this.steamClient.isPlayingGame()) {
                this.steamClient.stopPlaying();
                this.steamClient.playGame(SteamGames.TF2);
            } else {
                this.steamClient.playGame(SteamGames.TF2);
                this.steamClient.stopPlaying();
            }
        }
    } else {
        this.log.warning("Unhandled solving procedure for SteamTradeError code: " + error.getCode());
    }
};

SteamTradeOffer.prototype.setAutomaticAFKCheck = function () {
    this.automaticAFKCheck = true;
};

SteamTradeOffer.prototype.startAFKCheck = function () {
    var self = this;
    this.afkTimeout = setTimeout(function () {
        self.emit('partnerIsAFK');
    }, this.afkTimeoutInterval);
};

SteamTradeOffer.prototype.stopAFKCheck = function () {
    clearTimeout(this.afkTimeout);
};

SteamTradeOffer.prototype._startListeningForChanges = function () {
    var self = this;
    this.steamClient.onTradeOfferChange(this.getTradeOfferID(), function (tradeOffer) {
        var state = tradeOffer.state;
        if (state === SteamTradeStatus.Canceled || state === SteamTradeStatus.CanceledBySecondFactor) {
            self.emit("partnerCancelled");
            self.stopAFKCheck();
        } else if (state === SteamTradeStatus.Accepted) {
            self.emit("partnerAccepted");
            self.stopAFKCheck();
        } else if (state === SteamTradeStatus.Declined) {
            self.emit("partnerDeclined");
            self.stopAFKCheck();
        } else if (state === SteamTradeStatus.Active) {
            self.emit("tradeSent", self.getTradeOfferID());
            if (self.automaticAFKCheck) {
                self.startAFKCheck();
            }
        }
    });
};