module.exports = new CFG();

var SENTRYFILES_PATH = './sentryFiles/';
var fs = require("fs");
var crypto = require("crypto");
var Logs = require("./lib/logs.js");

/**
 * Class for socket configuration and loading cfg
 * @class CFG
 * @constructor
 */
function CFG() {
    var config = JSON.parse(require("fs").readFileSync('./socket_config.json'));
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

/**
 * @class BotCredentials
 * @constructor
 */
function BotCredentials(data) {
    this.botCredentials = data;
    this.steamid = this.botCredentials.steamid;
    this.log = new Logs({applicationName: "BotCredentials " + this.steamid, color: "red", dim: true});
}

BotCredentials.prototype.getUsername = function () {
    return this.botCredentials.username;
};

BotCredentials.prototype.getPassword = function () {
    return this.botCredentials.password;
};

BotCredentials.prototype.hasSteamGuardCode = function () {
    return this.botCredentials.hasOwnProperty("steamGuardCode");
};

BotCredentials.prototype.getSteamGuardCode = function () {
    return this.botCredentials.steamGuardCode;
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