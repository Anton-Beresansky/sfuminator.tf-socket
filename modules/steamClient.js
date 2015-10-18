module.exports = SteamClient;

var events = require("events");
var CFG = require("../cfg.js");
var Logs = require("../lib/logs.js");
var Steam = require("steam");
var SteamGames = require("../lib/steamGames.js");
var SteamTradeOffers = require('steam-tradeoffers');

/**
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

    this.loggingIn = false;
    this.lastLoginSucceded = false;
    this.attemptsSinceLastSuccessfulLogin = 0;
    this.attemptsInterval = 15000;
    this.tradeOffersCount = 0;
    this.gamePlayed = null;

    this.log = new Logs({applicationName: "Steam " + this.steamid, color: "yellow", dim: true});
    events.EventEmitter.call(this);

    this._bindHandlers();
}

require("util").inherits(SteamClient, events.EventEmitter);

SteamClient.prototype._bindHandlers = function () {
    var self = this;
    this.on('loggedIn', function () {
        self.lastLoginSucceded = true;
        self.attemptsSinceLastSuccessfulLogin = 0;
    });
    this.client.on('error', function () {
        if (!self.isLogged()) {
            self.log.warning("Disconnected from Steam");
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

    });
    this.friends.on('friendMsg', function (steamid, message) {

    });
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

SteamClient.prototype.isConnected = function () {
    return this.client.connected;
};

SteamClient.prototype.isLogged = function () {
    return this.client.loggedOn;
};

SteamClient.prototype.getSteamid = function () {
    return this.steamid;
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
        this.emit('loggedIn');
    } else if (logonResp.eresult === Steam.EResult.AccountLogonDenied) {
        this.log.warning("Login denied, probably steam guard code is needed");
    } else if (logonResp.eresult === Steam.EResult.InvalidLoginAuthCode) {
        this.log.warning("Invalid LoginAuthCode provided");
    } else {
        this.log.warning("Unhandled logon response: " + this._encodeEResult(Steam.EResult, logonResp.eresult));
    }
};

SteamClient.prototype._retryLogin = function () {
    var interval;
    if (this.attemptsSinceLastSuccessfulLogin < 4) {
        interval = this.attemptsInterval;
    } else if (this.attemptsSinceLastSuccessfulLogin < 20) {
        interval = this.attemptsInterval * 2;
    } else {
        interval = this.attemptsInterval * 4;
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