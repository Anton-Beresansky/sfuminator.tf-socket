module.exports = new CFG();

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
 * @returns {{steamid: String, username: String, password: String, steamApiKey: String}}
 */
CFG.prototype.getBotCredentials = function (steamid) {
    var types = this.getBotTypes();
    for (var i = 0; i < types.length; i += 1) {
        var botType = types[i];
        for (var index in this.sfuminator.bots[botType]) {
            if (this.sfuminator.bots[botType][index].steamid === steamid) {
                return this.sfuminator.bots[botType][index];
            }
        }
    }
};

/**
 * Trade bots steam ids
 * @returns {Array}
 */
CFG.prototype.getTradeBots = function () {
    var steamidList = [];
    for (var index in this.sfuminator.bots.trading) {
        steamidList.push(this.sfuminator.bots.trading[index].steamid);
    }
    return steamidList;
};

/**
 * All bots steam ids
 * @returns {Array}
 */
CFG.prototype.getBots = function () {
    return this.getTradeBots();
};

CFG.prototype.getBotTypes = function () {
    var types = [];
    for (var type in this.sfuminator.bots) {
        types.push(type);
    }
    return types;
};