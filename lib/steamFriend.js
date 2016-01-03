/**
 * Created by aaronrusso on 03/01/16.
 */

module.exports = SteamFriend;

/**
 * @parameter {SteamClient} steamClient
 * @parameter {String} steamid
 * @constructor
 */
function SteamFriend(steamClient, steamid) {
    /**
     * @type {SteamClient}
     */
    this.steamClient = steamClient;
    this.steamid = steamid;
}

/**
 * @returns {SteamClient}
 */
SteamFriend.prototype.getSteamClient = function () {
    return this.steamClient;
};

SteamFriend.prototype.getSteamid = function () {
    return this.steamid;
};

SteamFriend.prototype.sendMessage = function (message) {
    this.steamClient.sendMessage(this.steamid, message);
};

