// Sfuminator.tf | Handling trading status, queue functionality is only for manual trade (obsolete)

module.exports = TradeStatus;

var LogLog = require('log-log');

/**
 * @param sfuminator
 * @constructor
 */
function TradeStatus(sfuminator) {
    this.sfuminator = sfuminator;
    this.db = this.sfuminator.db;
    this.log = LogLog.create({applicationName: "Trade Status", color: "green", dim: true});
    this.update();
    this.steam_status_table = {
        0: "steam_down",
        10: "steam_down",
        11: "maintenance"
    };
}

TradeStatus.prototype.get = function () {
    return this.steam_status_table[this.steam_status.version];
};

TradeStatus.prototype.canTrade = function () {
    return this.steam_status.version === 0 || this.steam_status.version === 10;
};

TradeStatus.prototype.update = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getUpdateQuery(), function (result, errored) {
            connection.release();
            if (!errored) {
                for (var i = 0; i < result.length; i += 1) {
                    self[result[i].of] = result[i];
                    self[result[i].of].last_update_date = new Date(parseInt(result[i].last_server_update) * 1000);
                }
            } else {
                self.log.error("Wasn't able to read trade status");
            }
        });
    });
};

TradeStatus.prototype._getUpdateQuery = function () {
    return "SELECT `of`,`version`,`last_server_update`,`active`,`additional` FROM `tasks`";
};

TradeStatus.prototype.getQueue = function (steamid) {
    var queueList = [];
    for (var i = 0; i < this.sfuminator.activeTrades.length; i += 1) {
        var shopTrade = this.sfuminator.activeTrades[i];
        if (shopTrade.getMode() === "manual" && shopTrade.getStatus() === "hold") {
            var user = shopTrade.getPartner();
            queueList.push({
                position: shopTrade.getID(),
                steamid: user.getSteamid(),
                name: user.getName(),
                avatar_url: user.getAvatar()
            });
        }
    }
    var info = this.getQueueInfo();
    var decodedInfo = info.all;
    if (queueList.length) {
        decodedInfo = decodedInfo.replace("#player", queueList[0].name);
        if (queueList[0].steamid === steamid) {
            decodedInfo = info.me;
        }
    }
    return {list: queueList, botStatus: decodedInfo};
};

TradeStatus.prototype.getQueueInfo = function () {
    return JSON.parse(this.botStatus.additional);
};