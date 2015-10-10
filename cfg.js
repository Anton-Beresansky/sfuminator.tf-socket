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
 * Trade bots steam ids
 * @returns {Array}
 */
CFG.prototype.getTradeBots = function () {
    return this.sfuminator.trade_bots;
};

/**
 * All bots steam ids
 * @returns {Array}
 */
CFG.prototype.getBots = function () {
    return this.getTradeBots();
};