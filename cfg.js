var SENTRYFILES_PATH = './sentryFiles/';

var fs = require("fs");
var crypto = require("crypto");
var SteamTotp = require('steam-totp');
var LogLog = require("log-log");

/**
 * Class for socket configuration and loading cfg
 * @class CFG
 * @constructor
 */
function CFG(name) {
    this.log = LogLog.create({applicationName: "CFG", color: "red", dim: true});
    this.setConfigFile(name);
}

/*
CFG Structure
{
  "name": "",
  "root_key": "",
  "application": "", // "main" | "dev"
  "http_listen_port": , // port number
  "bot_friend_list_limit": 170,
  "bot_automatic_trade_cancel_time": 600000,
  "bot_pre_smelted_quantity": 12,
  "bot_pre_smelted_max_quantity": 24,
  "bot_busy_distribution_manager_timeout_time": 300000,
  "shop_max_fetch_attempts": 5,
  "shop_versioning_snapshots": 10,
  "trade_add_friend_timeout": 120000,
  "trade_check_escrow_max_attempts": 2,
  "inventory_keys_refined_minimum_ratio": 0.15,
  "inventory_fetch_timeout": 3000,
  "sfuminator": {
    "admin": [ // Steamid list
      "76561197992634049"
    ],
    "market_disabled": [ // Steamid list
      "76561198045065602"
    ],
    "bots": {
      "trading": {
        "76561198195936315": {
          "steamid": "",
          "username": "",
          "password": "",
          "tradeToken": "",
          "steamApiKey": "",
          "steamGuardCode": "",
          "mobileAuth": {
                //maFile object
          }
        },
        "76561198045065602": {

        },
        "76561198228007284": {

        },
        "76561198145778912": {

        }
      },
      "other": {

      }
    }
  }
}
 */

CFG.prototype.create = function (name) {
    return new CFG(name);
};

CFG.prototype.setConfigFile = function (name) {
    try {
        var config = JSON.parse(require("fs").readFileSync('./' + name));
    } catch (e) {
        this.log.error("Couldn't read socket config: " + e);
        config = JSON.parse(require("fs").readFileSync('../' + name));
    }
    for (var prop in config) {
        if (config.hasOwnProperty(prop)) {
            this[prop] = config[prop];
        }
    }
};

CFG.prototype.getHTTPListenPort = function () {
    return this.http_listen_port;
};

/**
 * Admin steam ids
 * @returns {Array}
 */
CFG.prototype.getAdmins = function () {
    return this.sfuminator.admin;
};

CFG.prototype.getDatabaseCredentials = function (db_name) {
    return {user: this.db_credentials.user, password: this.db_credentials.password, database: db_name};
};

CFG.prototype.getApiKey = function (name) {
    return this.api_keys[name];
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

CFG.prototype.isBot = function (steamid) {
    for (var type in this.sfuminator.bots) {
        for (var bot_steamid in this.sfuminator.bots[type]) {
            if (bot_steamid === steamid) {
                return true;
            }
        }
    }
    return false;
};

CFG.prototype.isMarketDisabled = function (steamid) {
    if (!this.sfuminator.hasOwnProperty("market_disabled")) {
        return false;
    }
    for (var i = 0; i < this.sfuminator.market_disabled.length; i += 1) {
        if (steamid === this.sfuminator.market_disabled[i]) {
            return true;
        }
    }
    return false;
};

var events = require('events');

/**
 * @class BotCredentials
 * @constructor
 */
function BotCredentials(data) {
    this.botCredentials = data;
    this.steamid = this.botCredentials.steamid;
    this.log = LogLog.create({applicationName: "BotCredentials " + this.steamid, color: "red", dim: true});

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

module.exports = new CFG('socket_config.json');