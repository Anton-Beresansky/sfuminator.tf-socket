module.exports = SteamClient;

var events = require('events');
var CFG = require('../cfg.js');
var Logs = require('./logs.js');
var Steam = require('steam');
var SteamCommunity = require('steamcommunity');
var SteamFriend = require('./steamFriend.js');
var SteamGames = require('./steamGames.js');
var SteamTradeOffers = require('steam-tradeoffers');
var SteamTradeOffersManager = require('steam-tradeoffer-manager');
var SteamWebLogOn = require('steam-weblogon');
var TeamFortress2 = require('tf2');

Steam.EFriendRelationship = {
    None: 0,
    Blocked: 1,
    PendingInvitee: 2, // obsolete - renamed to RequestRecipient
    RequestRecipient: 2,
    Friend: 3,
    RequestInitiator: 4,
    PendingInviter: 4, // obsolete - renamed to RequestInitiator
    Ignored: 5,
    IgnoredFriend: 6,
    SuggestedFriend: 7,
    Max: 8
};

/**
 * @event clientLoggedIn
 * @event loggedIn
 * @class SteamClient
 * @param steamid
 * @constructor
 */
function SteamClient(steamid) {
    this.steamid = steamid;
    this.credentials = CFG.getBotCredentials(this.steamid);

    this.client = new Steam.SteamClient();
    this.user = new Steam.SteamUser(this.client);
    this.friends = new Steam.SteamFriends(this.client);
    this.community = new SteamCommunity();
    this.tradeOffers = new SteamTradeOffers();
    this.tradeOffersManager = new SteamTradeOffersManager({steam: this.user, language: "en"});
    this.tf2 = new TeamFortress2(this.user);

    this.loggingIn = false;
    this.lastLoginSucceded = false;
    this.attemptsSinceLastSuccessfulLogin = 0;
    this.loginAttemptsInterval = 15000;
    this.activeTradeOffersFetchInterval = 1500;
    this.automaticMobileTradingConfirmationInterval = 4000;
    this.tradeOffersManager.pollInterval = this.activeTradeOffersFetchInterval;
    this.tradeOffersCount = 0;
    this.gamePlayed = null;
    this.lastCraftedItems = [];
    this.nextTradeConfirmationCallbacks = [];
    /**
     * @type {OnFriendWithHandler[]}
     */
    this.onFriendWithHandlers = [];
    /**
     * @type {OnTradeOfferChangeHandler[]}
     */
    this.onTradeOfferChangeHandlers = [];

    this.steamWebLogOn = new SteamWebLogOn(this.client, this.user);
    this.log = new Logs({applicationName: "Steam " + this.steamid, color: "yellow", dim: true});
    events.EventEmitter.call(this);

    this._bindHandlers();
}

require("util").inherits(SteamClient, events.EventEmitter);

SteamClient.prototype._bindHandlers = function () {
    var self = this;
    this.on('clientLoggedIn', function () {
        self.lastLoginSucceded = true;
        self.attemptsSinceLastSuccessfulLogin = 0;
        self.webLogin(function () {
            self.emit('loggedIn');
        });
    });
    this.client.on('error', function () {
        if (!self.isLogged()) {
            self.log.warning("Disconnected from Steam, last login: " + self.lastLoginSucceded);
            if (!self.lastLoginSucceded) {
                self.attemptsSinceLastSuccessfulLogin += 1;
                self.loggingIn = true;
                self._retryLogin();
            }
        }
    });
    this.client.on('loggedOff', function () {
        self.log.warning("We were logged off from Steam");
    });
    this.client.on('logOnResponse', function (response) {
        self.loggingIn = false;
        self.lastLoginSucceded = false;
        self._onLogOnResponse(response);
    });
    this.user.on('updateMachineAuth', function (response, callback) {
        self._updateSentryFile(response, callback);
    });
    this.user.on('tradeOffers', function (newTradeOffersCount) {
        self.tradeOffersCount = newTradeOffersCount;
    });
    this.friends.on('friend', function (steamid, EFriendRelationship) {
        if (EFriendRelationship === Steam.EFriendRelationship.Friend) {
            self._manageOnFriendWithHandlers(steamid);
        }
    });
    this.friends.on('friendMsg', function (steamid, message) {

    });
    this.tf2.on('craftingComplete', function (recipe, itemsGained) {
        self.log.debug("Crafted, " + itemsGained);
        self.lastCraftedItems = [];
        if (itemsGained instanceof Array) {
            for (var i = 0; i < itemsGained.length; i += 1) {
                self.lastCraftedItems.push(parseInt(itemsGained[i]));
            }
        } else if (!isNaN(itemsGained)) {
            self.lastCraftedItems = [parseInt(itemsGained)];
        }
    });
    this.community.on('confKeyNeeded', function (tag, callback) {
        self.log.debug("confKeyNeeded: " + tag);
        callback(null, self._getUnixTimestamp(), self.credentials.getConfirmationKey(tag));
    });

    this.community.on('newConfirmation', function (confirmation) {
        self.log.debug("new confirmation for " + confirmation.offerID);
        confirmation.respond(self._getUnixTimestamp(), self.credentials.getConfirmationKey("allow"), true, function (error) {
            if (error) {
                self.log.error("Confirming trade: " + error);
            } else {
                self.log.debug("Trade " + confirmation.offerID + " confirmed");
            }
        });
    });
    this.tradeOffersManager.on('sentOfferChanged', function (offer) {
        self._manageOnTradeOfferChangeHandlers(offer);
    });
};

SteamClient.prototype.getSteamid = function () {
    return this.steamid;
};

SteamClient.prototype.login = function () {
    var self = this;
    if (this.isLogged()) {
        this.log.warning("We are already logged in, no need to login again (?)");
        return;
    }
    this.loggingIn = true;
    if (!this.isConnected()) {
        this.client.connect();
        this.client.on('connected', function () {
            self._fireLogOn();
        });
    } else {
        self._fireLogOn();
    }
};

SteamClient.prototype.webLogin = function (callback) {
    var self = this;
    this.steamWebLogOn.webLogOn(function (webSessionID, cookies) {
        self.log.debug("WebLogged!");
        self.tradeOffers.setup({
            sessionID: webSessionID,
            webCookie: cookies,
            APIKey: self.credentials.getApiKey()
        });
        self.community.setCookies(cookies);
        self.tradeOffersManager.setCookies(cookies);
        if (typeof callback === "function") {
            callback();
        }
    });
};

SteamClient.prototype.isConnected = function () {
    return this.client.connected;
};

SteamClient.prototype.isLogged = function () {
    return this.client.loggedOn;
};

SteamClient.prototype.isLoggingIn = function () {
    return this.loggingIn;
};

SteamClient.prototype.getTradeOffersCount = function () {
    return this.tradeOffersCount;
};

SteamClient.prototype.sendMessage = function (steamid, message) {
    this.friends.sendMessage(steamid, message);
};

SteamClient.prototype.addFriend = function (steamid) {
    this.friends.addFriend(steamid);
};

SteamClient.prototype.removeFriend = function (steamid) {
    this.friends.removeFriend(steamid);
};

SteamClient.prototype.isFriend = function (steamid) {
    return this.friends.friends.hasOwnProperty(steamid) && this.friends.friends[steamid] === Steam.EFriendRelationship.Friend;
};

SteamClient.prototype.onFriendWith = function (steamid, callback) {
    this.onFriendWithHandlers.push(new OnFriendWithHandler(steamid, callback));
};

SteamClient.prototype.onTradeOfferChange = function (tradeOfferID, callback) {
    this.onTradeOfferChangeHandlers.push(new OnTradeOfferChangeHandler(tradeOfferID, callback));
};

SteamClient.prototype.setAutomaticMobileTradingConfirmation = function () {
    /* var self = this;
     this._amtc_obj = setInterval(function () {
     self.community.getConfirmations(self._getUnixTimestamp(), self.credentials.getConfirmationKey("conf"), function (error, confirmations) {
     if (error) {
     self.log.error(error);
     } else {
     self.log.debug("Pending confirmations: " + confirmations.length, 1);
     for (var i = 0; i < confirmations.length; i += 1) {
     confirmations[i].respond(self._getUnixTimestamp(), self.credentials.getConfirmationKey("allow"), true, function (error) {
     if (error) {
     self.log.error("Confirming trade: " + error);
     } else {
     self.log.debug("Confirmed trade");
     self._executeNextTradeConfirmationCallbacks();
     }
     }
     )
     }
     }
     }
     )
     }, this.automaticMobileTradingConfirmationInterval);*/
    this.community.startConfirmationChecker(this.automaticMobileTradingConfirmationInterval);
};

SteamClient.prototype.stopPlaying = function () {
    this.user.gamesPlayed({});
    this.log.debug("Stopped playing");
    this.gamePlayed = null;
};

/**
 * @param {SteamGame} game
 */
SteamClient.prototype.playGame = function (game) {
    this.user.gamesPlayed({games_played: [{game_id: game.getID()}]});
    this.log.debug("Playing " + game.getName());
    this.gamePlayed = game;
};

SteamClient.prototype.isPlayingGame = function () {
    return this.getPlayingGame() !== null;
};

/**
 * @returns {SteamGame|Null}
 */
SteamClient.prototype.getPlayingGame = function () {
    return this.gamePlayed;
};

/**
 * @param {TF2Item[]} tf2Items
 * @param {Function} callback
 */
SteamClient.prototype.craftTF2Items = function (tf2Items, callback) {
    if (!this.isPlayingGame() || this.getPlayingGame().getID() !== SteamGames.TF2.getID()) {
        this.playGame(SteamGames.TF2);
    }
    var itemIDs = [];
    for (var i = 0; i < tf2Items.length; i += 1) {
        itemIDs.push(tf2Items[i].getID());
    }
    this.log.debug("Crafting: " + JSON.stringify(itemIDs));
    this.tf2.craft(itemIDs);
};

/**
 * @param steamid
 * @returns {SteamFriend}
 */
SteamClient.prototype.getFriend = function(steamid){
    return new SteamFriend(this, steamid);
};

SteamClient.prototype._manageOnFriendWithHandlers = function (steamid) {
    for (var i = 0; i < this.onFriendWithHandlers.length; i += 1) {
        if (this.onFriendWithHandlers[i].steamid === steamid) {
            this.onFriendWithHandlers[i].callback();
            this.onFriendWithHandlers.splice(i, 1);
        }
    }
};

SteamClient.prototype._manageOnTradeOfferChangeHandlers = function (offer) {
    var onTradeOfferChangeHandlersLength = this.onTradeOfferChangeHandlers.length;
    for (var i = 0; i < onTradeOfferChangeHandlersLength; i += 1) {
        if (this.onTradeOfferChangeHandlers[i].tradeOfferID === offer.id) {
            this.onTradeOfferChangeHandlers[i].renewExpiration();
            this.onTradeOfferChangeHandlers[i].callback(offer);
        } else if (this.onTradeOfferChangeHandlers[i].isExpired()) {
            this.onTradeOfferChangeHandlers.splice(i, 1);
            onTradeOfferChangeHandlersLength = this.onTradeOfferChangeHandlers.length;
        }
    }
};

SteamClient.prototype._fireLogOn = function () {
    var login_data = {account_name: this.credentials.getUsername(), password: this.credentials.getPassword()};
    if (this.credentials.hasSentryHash()) {
        login_data.sha_sentryfile = this.credentials.getSentryHash();
    } else if (this.credentials.hasSteamGuardCode() && this.credentials.getSteamGuardCode()) {
        login_data.auth_code = this.credentials.getSteamGuardCode();
    } else {
        this.log.warning("Couldn't find sentry file or steam guard code, probably login will be refused");
    }
    if (this.credentials.hasMobileAuth()) {
        login_data.two_factor_code = this.credentials.getTwoFactorCode();
    }
    this.log.debug("Logging in... "
        + (login_data.hasOwnProperty("sha_sentryfile") ? "(found sentry file)" : "")
        + (login_data.hasOwnProperty("auth_code") ? "(found steam guard code)" : "")
    );
    this.user.logOn(login_data);
};

SteamClient.prototype._onLogOnResponse = function (logonResp) {
    if (logonResp.eresult == Steam.EResult.OK) {
        this.friends.setPersonaState(Steam.EPersonaState.Online);
        this.log.debug("Logged in!");
        this.emit('clientLoggedIn');
    } else if (logonResp.eresult === Steam.EResult.AccountLogonDenied) {
        this.log.warning("Login denied, probably steam guard code is needed");
    } else if (logonResp.eresult === Steam.EResult.InvalidLoginAuthCode) {
        this.log.warning("Invalid LoginAuthCode provided");
    } else if (logonResp.eresult === Steam.EResult.TwoFactorCodeMismatch) {
        this.log.warning("Invalid Two Factor Code, probably we missed the right timing");
    } else {
        this.log.warning("Unhandled logon response: " + this._encodeEResult(Steam.EResult, logonResp.eresult));
    }
};

SteamClient.prototype._retryLogin = function () {
    var interval;
    if (this.attemptsSinceLastSuccessfulLogin < 4) {
        interval = this.loginAttemptsInterval;
    } else if (this.attemptsSinceLastSuccessfulLogin < 20) {
        interval = this.loginAttemptsInterval * 2;
    } else {
        interval = this.loginAttemptsInterval * 4;
    }

    var self = this;
    setTimeout(function () {
        self.login();
    }, interval);
};

SteamClient.prototype._updateSentryFile = function (sentryResponse, callback) {
    this.log.debug("Updating sentry file: " + sentryResponse.filename);
    this.credentials.saveSentryFile(sentryResponse);
    callback({sha_file: this.credentials.getSentryHash()});
};

SteamClient.prototype._encodeEResult = function (EObject, response_code) {
    for (var response in EObject) {
        if (EObject[response] === response_code) {
            return response;
        }
    }
};

SteamClient.prototype._getUnixTimestamp = function () {
    return parseInt(new Date().getTime() / 1000);
};

/**
 * @param steamid
 * @param callback
 * @constructor
 */
function OnFriendWithHandler(steamid, callback) {
    this.steamid = steamid;
    this.callback = callback;
}

ON_TRADE_OFFER_CHANGE_HANDLER_EXPIRATION = 1000 * 60 * 60; //1 Hour

/**
 * @param tradeOfferID
 * @param callback
 * @constructor
 */
function OnTradeOfferChangeHandler(tradeOfferID, callback) {
    this.tradeOfferID = tradeOfferID;
    this.callback = callback;
    this.renewExpiration();
}

OnTradeOfferChangeHandler.prototype.renewExpiration = function () {
    this.last_update = new Date();
};

OnTradeOfferChangeHandler.prototype.isExpired = function () {
    return this.last_update + ON_TRADE_OFFER_CHANGE_HANDLER_EXPIRATION < new Date();
};