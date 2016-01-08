module.exports = SteamTradeOffer;

var Events = require("events");
var Logs = require("./logs.js");
var SteamTradeError = require("./steamTradeError.js");
var SteamGames = require("./steamGames.js");

/**
 * @event tradeError {SteamTradeError} error
 * @event offerCreated {String} tradeOfferID if enabled, confirmation is still needed
 * @event tradeSent {String} tradeOfferID if enabled, trade has been also confirmed
 * @event partnerAccepted
 * @event partnerDeclined
 * @event partnerCanceled
 * @event partnerIsAFK
 * @event itemsRevoked
 * @param {SteamClient} steamClient
 * @param {string} partnerSteamID
 * @constructor
 */
function SteamTradeOffer(steamClient, partnerSteamID) {
    /**
     * @type {SteamClient}
     */
    this.steamClient = steamClient;
    this.partnerSteamID = partnerSteamID;
    this.itemsFromMe = [];
    this.itemsFromThem = [];
    this.accessToken = null;
    this.message = "";
    this.log = new Logs({applicationName: "SteamTradeOffer " + this.partnerSteamID, color: "red", dim: true});

    this.tradeError = null;
    this.numberOfRetries = 0;
    this.forcedNumberOfRetries = 0;
    this.numberOfConfirmationFailRetries = 0;
    this.numberOfNoConfirmationRetries = 0;
    this.afkTimeoutInterval = 1000 * 60 * 3;
    this.automaticAFKCheck = false;
    this._offerIDsStack = [];
    Events.EventEmitter.call(this);
}

require("util").inherits(SteamTradeOffer, Events.EventEmitter);

SteamTradeOffer.MAX_MAKE_RETRIES = 3;
SteamTradeOffer.RETRY_MAKE_INTERVAL = 3000;
SteamTradeOffer.MAX_CONFIRMATION_FAIL_RETRIES = 6;
SteamTradeOffer.MAX_NO_CONFIRMATION_RETRIES = 6;
SteamTradeOffer.ACTUALLY_SENT_TIMEOUT = 5000;

SteamTradeOffer.SteamTradeStatus = {
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

SteamTradeOffer.prototype.resetItems = function () {
    this.itemsFromMe = [];
    this.itemsFromThem = [];
};

SteamTradeOffer.prototype.setToken = function (token) {
    this.accessToken = token;
};

SteamTradeOffer.prototype.setMessage = function (message) {
    this.message = message;
};

SteamTradeOffer.prototype.make = function (callback) {
    this._makeCallback = callback;
    if (this.itemsFromMe.length || this.itemsFromThem.length) {
        var self = this;
        self.numberOfRetries = self.forcedNumberOfRetries;
        if (self.forcedNumberOfRetries > 0) {
            self.forcedNumberOfRetries = 0;
        }
        var tryTrade = function () {
            self.numberOfRetries += 1;
            self.log.test("Making offer");
            self.steamClient.tradeOffers.makeOffer(self.getOptions(), function (error, tradeResult) {
                self.log.test("Offer returned: " + error + " - " + tradeResult);
                if (error && self.numberOfRetries <= SteamTradeOffer.MAX_MAKE_RETRIES) {
                    self.tradeError = new SteamTradeError(error);
                    self.log.warning("Error making offer: " + self.tradeError.getCode());
                    self._retryTradeTimeout = setTimeout(function () {
                        tryTrade();
                    }, SteamTradeOffer.RETRY_MAKE_INTERVAL);
                    self.solveError();
                } else {
                    if (error) {
                        if (typeof  callback === "function") {
                            callback(null);
                        }
                        self.emit("tradeError", self.getTradeError());
                    } else {
                        self._onTradeOfferCreated(tradeResult.tradeofferid)
                    }
                }
            });
        };

        //Before going ahead with the trade, be sure that this trade hasn't got any active trade offer associated
        if (this.getTradeOfferID()) {
            this.log.test("Cancelling last steam trade associated");
            this.cancelTrade(function () {
                tryTrade();
            });
        } else {
            tryTrade();
        }
    } else {
        this.log.warning("Empty assets can't proceed with offer");
    }
};

SteamTradeOffer.prototype.stopAndResetMaking = function () {
    this.pauseAutoRetry();
    this.numberOfRetries = 0;
    this._stopListening();
};

SteamTradeOffer.prototype.pauseAutoRetry = function () {
    clearTimeout(this._retryTradeTimeout);
};

SteamTradeOffer.prototype.continueAutoRetry = function () {
    this.forcedNumberOfRetries = this.numberOfRetries;
    this.make(this._makeCallback);
};

SteamTradeOffer.prototype.cancel = function (callback) {
    this.stopAndResetMaking();
    this.cancelTrade(callback);
    this.log.test("Cancelled");
};

SteamTradeOffer.prototype.cancelTrade = function (callback) {
    this.steamClient.tradeOffers.cancelOffer({tradeOfferId: this.getTradeOfferID()}, callback);
};

SteamTradeOffer.prototype.getTradeOfferID = function () {
    return this.tradeOfferID;
};

SteamTradeOffer.prototype.getState = function () {
    return this.state;
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

SteamTradeOffer.prototype.loadPartnerInventory = function (appID, contextID, callback) {
    this.steamClient.tradeOffers.loadPartnerInventory({
        partnerSteamId: this.partnerSteamID,
        appId: appID,
        contextId: contextID,
        language: "en"
    }, function (error, items) {
        callback(error, items);
    });
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
    var self = this;
    var error = this.getTradeError();
    var errorCode = error.getCode();
    if (errorCode === SteamTradeError.ERROR.ITEMS_REVOKED) {
        if (this.numberOfRetries === 1) {
            this.emit("itemsRevoked");
        }
        if (this.numberOfRetries === 2) {
            if (this.steamClient.isPlayingGame()) {
                this.steamClient.stopPlaying();
                this.steamClient.playGame(SteamGames.TF2);
            } else {
                this.steamClient.playGame(SteamGames.TF2);
                this.steamClient.stopPlaying();
            }
        }
        if (this.numberOfRetries === 3) {
            this.emit("wrongItemIDs");
        }
    } else if (errorCode === SteamTradeError.ERROR.TIMEOUT) {
        this.pauseAutoRetry();
        this._checkIfTradeHasBeenActuallyCreatedAndFix(function (offer) {
            if (offer) {
                self.stopAndResetMaking();
                self._onTradeOfferCreated(offer.id, offer);
            } else {
                self.continueAutoRetry();
            }
        });
    } else if (errorCode === SteamTradeError.ERROR.NOT_AVAILABLE_FOR_TRADE) {
        this.stopAndResetMaking();
        this.emit("tradeError", this.getTradeError());
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

SteamTradeOffer.prototype._onTradeOfferCreated = function (tradeOfferID, offer) {
    var self = this;
    this.tradeOfferID = tradeOfferID;
    this._offerIDsStack.push(this.tradeOfferID);

    var finalize = function (offer) {
        self.state = (offer && offer.hasOwnProperty("state")) ? offer.state : null;
        if (typeof callback === "function") {
            callback(self.tradeOfferID, offer.state);
        }
        self.emit("offerCreated", self.tradeOfferID, offer.state);
        self._startListening();
        self.log.test("Offer sent " + self.tradeOfferID + " ~ " + offer.state);
    };
    if (offer) {
        finalize(offer);
    } else {
        this.steamClient.tradeOffersManager.getOffer(this.tradeOfferID, function (error, offer) {
            if (error) {
                self.log.warning("Caution, wasn't able to fetch trade");
            }
            finalize(offer);
        });
    }
};

SteamTradeOffer.prototype._startListening = function () {
    var self = this;
    this.steamClient.onTradeOfferChange(this.getTradeOfferID(), function (tradeOffer) {
        self.state = tradeOffer.state;
        self._emitTradeState();
    });
    this.steamClient.onTradeConfirmation(this.getTradeOfferID(), function (error) {
        if (error) {
            self.log.test("Trade confirmation errored");
            self.numberOfConfirmationFailRetries += 1;
            if (self.numberOfConfirmationFailRetries <= SteamTradeOffer.MAX_CONFIRMATION_FAIL_RETRIES) {
                self.log.test("I will retry again");
                self.stopAndResetMaking();
                self.make();
            } else {
                self.numberOfConfirmationFailRetries = 0;
                self.log.error("Couldn't confirm trade");
                self.emit("tradeError", new SteamTradeError("Couldn't confirm trade (1002)"));
            }
        }
    });
    this._checkForConfirmationEvent();
    this._emitTradeState();
};

SteamTradeOffer.prototype._emitTradeState = function () {
    this.log.test("Emitting state " + this.state);
    if (this.state === SteamTradeOffer.SteamTradeStatus.Canceled || this.state === SteamTradeOffer.SteamTradeStatus.CanceledBySecondFactor) {
        this.stopAFKCheck();
        this.emit("cancelled");
    } else if (this.state === SteamTradeOffer.SteamTradeStatus.Accepted) {
        this.stopAFKCheck();
        this.emit("partnerAccepted");
    } else if (this.state === SteamTradeOffer.SteamTradeStatus.Declined) {
        this.stopAFKCheck();
        this.emit("partnerDeclined");
    } else if (this.state === SteamTradeOffer.SteamTradeStatus.Active) {
        this.emit("tradeSent", this.getTradeOfferID());
        if (this.automaticAFKCheck) {
            this.startAFKCheck();
        }
        if (this.tradeError) {
            this.log.debug("Fixed error " + this.tradeError + "!");
            this.tradeError = null;
        }
    }
};

SteamTradeOffer.prototype._stopListening = function () {
    this.steamClient.disableOnTradeOfferChangeListener(this.getTradeOfferID());
    this.steamClient.disableOnTradeConfirmationListener(this.getTradeOfferID());
    this._stopCheckingForConfirmationEvent();
};

SteamTradeOffer.prototype._stopCheckingForConfirmationEvent = function () {
    clearTimeout(this._confirmationCheckerTimeout);
};

SteamTradeOffer.prototype._checkForConfirmationEvent = function () {
    var self = this;
    this._confirmationCheckerTimeout = setTimeout(function () {
        self.numberOfNoConfirmationRetries += 1;
        if (self.numberOfNoConfirmationRetries <= SteamTradeOffer.MAX_NO_CONFIRMATION_RETRIES) {
            if (self.getState() === SteamTradeOffer.SteamTradeStatus.CreatedNeedsConfirmation) {
                self.log.test("Trade still needs confirmation, sending again");
                self.stopAndResetMaking();
                self.make();
            } else if (self.getState() !== SteamTradeOffer.SteamTradeStatus.Active) {
                self.log.test("Trade offer isn't anymore waiting for confirmation yet is not active but: " + self.getState());
            }
        } else {
            self.log.error("Couldn't get confirmation for trade");
            self.emit("tradeError", new SteamTradeError("Wasn't able to get a trade confirmation for your trade. (1003)"))
        }
    }, self.steamClient.automaticMobileTradingConfirmationInterval * 3);
    //Adding 2 seconds to be sure that we checked stupid steam.
};

SteamTradeOffer.prototype._checkIfTradeHasBeenActuallyCreatedAndFix = function (callback) {
    var self = this;
    setTimeout(function () {
        //Get active offers.
        self.steamClient.tradeOffersManager.getOffers(1, null, function (err, sentOffers) {
            var fixed = false;
            for (var i = 0; i < sentOffers.length; i += 1) {
                var offer = sentOffers[i];
                if (offer.partner.toString() === self.partnerSteamID) {
                    self.log.test("Found sent offer, is it right?");
                    if (self._areSameItems(self.itemsFromMe, offer.itemsToGive) && self._areSameItems(self.itemsFromThem, offer.itemsToReceive)) {
                        self.log.test("Yes, it is the same, let's fix it");
                        fixed = true;
                        break;
                    }
                }
            }
            callback(fixed ? offer : null);
        });
    }, SteamTradeOffer.ACTUALLY_SENT_TIMEOUT);
};

SteamTradeOffer.prototype._areSameItems = function (assets1, assets2) {
    for (var i = 0; i < assets1.length; i += 1) {
        var found = false;
        for (var p = 0; p < assets2.length; p += 1) {
            if (parseInt(assets1[i].assetid) === parseInt(assets2[p].assetid)) {
                found = true;
                break;
            }
        }
        if (!found) {
            return false;
        }
    }
    return true;
};