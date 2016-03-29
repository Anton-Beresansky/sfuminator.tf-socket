var SENTRYFILES_PATH = './sentryFiles/';

var fs = require("fs");
var crypto = require("crypto");
var SteamTotp = require('steam-totp');
var Logs = require("./lib/logs.js");

module.exports = new CFG();

/**
 * Class for socket configuration and loading cfg
 * @class CFG
 * @constructor
 */
function CFG() {
    this.log = new Logs({applicationName: "CFG", color: "red", dim: true});
    try {
        var config = JSON.parse(require("fs").readFileSync('./socket_config.json'));
    } catch (e) {
        this.log.error("Couldn't read socket config: " + e);
        config = JSON.parse(require("fs").readFileSync('../socket_config.json'));
    }
    for (var prop in config) {
        if (config.hasOwnProperty(prop)) {
            this[prop] = config[prop];
        }
    }
}

CFG.prototype.getHTTPListenPort = function () {
    return this.http_listen_port;
};

CFG.prototype.getConnectCloudPort = function () {
    return this.cloud_ports.connect;
};

CFG.prototype.getListenCloudPort = function () {
    return this.cloud_ports.listen;
};

/**
 * Admin steam ids
 * @returns {Array}
 */
CFG.prototype.getAdmins = function () {
    return this.sfuminator.admin;
};

/**
 * @param steamid
 * @returns {BotCredentials}
 */
CFG.prototype.getBotCredentials = function (steamid) {
    var types = this.getBotTypes();
    for (var i = 0; i < types.length; i += 1) {
        var botType = types[i];
        for (var index in this.sfuminator.bots[botType]) {
            if (this.sfuminator.bots[botType][index].steamid === steamid) {
                return new BotCredentials(this.sfuminator.bots[botType][index]);
            }
        }
    }
};

/**
 * Trade bots steam ids
 * @returns {String[]}
 */
CFG.prototype.getTradeBotSteamids = function () {
    var steamidList = [];
    for (var index in this.sfuminator.bots.trading) {
        steamidList.push(this.sfuminator.bots.trading[index].steamid);
    }
    return steamidList;
};

/**
 * All bots steam ids
 * @returns {String[]}
 */
CFG.prototype.getBotSteamids = function () {
    return this.getTradeBotSteamids();
};

CFG.prototype.getBotTypes = function () {
    var types = [];
    for (var type in this.sfuminator.bots) {
        types.push(type);
    }
    return types;
};

var events = require('events');

/**
 * @class BotCredentials
 * @constructor
 */
function BotCredentials(data) {
    this.botCredentials = data;
    this.steamid = this.botCredentials.steamid;
    this.log = new Logs({applicationName: "BotCredentials " + this.steamid, color: "red", dim: true});

    events.EventEmitter.call(this);
    this._bindHandlers();
}

require("util").inherits(BotCredentials, events.EventEmitter);

BotCredentials.prototype._bindHandlers = function () {
    if (this.hasMobileAuth()) {
        var self = this;
        this._lastGeneratedTwoFactorCode = this.getTwoFactorCode();
        setInterval(function () {
            var newCode = SteamTotp.generateAuthCode(self.getSharedSecret());
            if (newCode !== self._lastGeneratedTwoFactorCode) {
                self._lastGeneratedTwoFactorCode = newCode;
                self.emit("newTwoFactorCode", newCode);
            }
        }, 500);
    }
};

BotCredentials.prototype.getSteamid = function () {
    return this.steamid;
};

BotCredentials.prototype.getUsername = function () {
    return this.botCredentials.username;
};

BotCredentials.prototype.getPassword = function () {
    return this.botCredentials.password;
};

BotCredentials.prototype.getApiKey = function () {
    return this.botCredentials.steamApiKey;
};

BotCredentials.prototype.getTradeToken = function () {
    return this.botCredentials.tradeToken;
};

BotCredentials.prototype.hasSteamGuardCode = function () {
    return this.botCredentials.hasOwnProperty("steamGuardCode");
};

BotCredentials.prototype.getSteamGuardCode = function () {
    return this.botCredentials.steamGuardCode;
};

BotCredentials.prototype.hasMobileAuth = function () {
    return this.botCredentials.hasOwnProperty("mobileAuth");
};

BotCredentials.prototype.getTwoFactorCode = function () {
    var code = "";
    if (this.hasMobileAuth()) {
        code = SteamTotp.generateAuthCode(this.getSharedSecret());
        this.log.debug("Generated Auth Code: " + code);
    } else {
        this.log.warning("Couldn't generate Auth Code. Mobile authentication is not enabled or no shared_secret has been given");
    }
    return code;
};

BotCredentials.prototype.getConfirmationKey = function (tag) {
    if (this.hasMobileAuth()) {
        return SteamTotp.getConfirmationKey(this.getIdentitySecret(), parseInt(new Date().getTime() / 1000), tag);
    }
};

BotCredentials.prototype.getSharedSecret = function () {
    return this.botCredentials.mobileAuth.shared_secret;
};

BotCredentials.prototype.getIdentitySecret = function () {
    return this.botCredentials.mobileAuth.identity_secret;
};

BotCredentials.prototype.hasSentryHash = function () {
    return fs.existsSync(SENTRYFILES_PATH + this.steamid);
};

BotCredentials.prototype.getSentryHash = function () {
    if (!this._sentryBytes) {
        this._sentryBytes = fs.readFileSync(SENTRYFILES_PATH + this.steamid);
    }
    if (this._sentryBytes.length === 20) { //Old steam lib format compatibility
        this.log.debug("Porting old sentry file");
        this._sentryHash = this._sentryBytes;
        this._sentryBytes = null;
    } else {
        this._sentryHash = this._makeSha(this._sentryBytes);
    }
    return this._sentryHash;
};

BotCredentials.prototype.saveSentryFile = function (sentryFile) {
    this._sentryBytes = sentryFile.bytes;
    var self = this;
    fs.writeFile(SENTRYFILES_PATH + this.steamid, this._sentryBytes, function (err) {
        if (err) {
            self.log.error(err);
        } else {
            self.log.debug('Saved sentry file hash');
        }
    });
};

BotCredentials.prototype._makeSha = function (bytes) {
    var hash = crypto.createHash('sha1');
    hash.update(bytes);
    return hash.digest();
};