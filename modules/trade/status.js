module.exports = TradeStatus;

function TradeStatus(sfuminator) {
    this.sfuminator = sfuminator;
    this.db = this.sfuminator.db;
    this.update();
    this.steam_status_table = {
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

/*
 +-------------------+---------+--------------------+--------+----------------------------------------------------------------------------------------------------------------------------+
 | of                | version | last_server_update | active | additional                                                                                                                 |
 +-------------------+---------+--------------------+--------+----------------------------------------------------------------------------------------------------------------------------+
 | schema            | 2734753 |         1430617654 |      1 |                                                                                                                            |
 | prices            |       0 |         1430617695 |      1 |                                                                                                                            |
 | premium           |       0 |                  0 |      0 |                                                                                                                            |
 | apicalls          |       4 |         1439767838 |      0 |                                                                                                                            |
 | steam_status      |       0 |         1439771233 |      0 |                                                                                                                            |
 | axe_fish_backpack |  878930 |         1427306125 |      0 |                                                                                                                            |
 | botStatus         |       0 |         1439771328 |      1 | {"me":"You are trading...","all":"Trading with '#player'...","additional":3}                                               |
 | homeMessage       |       0 |                  0 |      0 | Happy Easter!                                                                                                              |
 | tradeAlert        |       2 |         1439768416 |      0 |                                                                                                                            |
 | brdMsg            |       0 |                  0 |      0 | {"color":"rgb(0,180,180)","message":"We advice to not trade - many people are reporting items disappearing after a trade"} |
 | betaProgram       |       0 |                  0 |      1 |                                                                                                                            |
 | shopInventory     |  749633 |         1439771312 |      0 |                                                                                                                            |
 | scanned_profiles  |  117064 |                  0 |      0 |                                                                                                                            |
 +-------------------+---------+--------------------+--------+----------------------------------------------------------------------------------------------------------------------------+
 */