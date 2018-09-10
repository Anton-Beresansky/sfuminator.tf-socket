module.exports = SteamFriend;

var LogLog = require("log-log");

/**
 * @parameter {SteamClient} steamClient
 * @parameter {String} steamid
 * @parameter {Date} [friend_since]
 * @constructor
 */
function SteamFriend(steamClient, steamid, friend_since) {
    /**
     * @type {SteamClient}
     */
    this.steamClient = steamClient;
    this.steamid = steamid;
    if (friend_since instanceof Date) {
        this.friend_since = friend_since;
    } else {
        this.friend_since = new Date();
    }

    this.log = LogLog.create({applicationName: "SteamFriend " + this.steamid, color: "red", dim: true});
}

SteamFriend.prototype.getSteamid = function () {
    return this.steamid;
};

/**
 * @returns {SteamClient}
 */
SteamFriend.prototype.getSteamClient = function () {
    return this.steamClient;
};

/**
 * @returns {Date}
 */
SteamFriend.prototype.getFriendSince = function () {
    return this.friend_since;
};

SteamFriend.prototype.sendMessage = function (message) {
    if (this.steamid) {
        this.steamClient.sendMessage(this.steamid, message);
    }
};

SteamFriend.prototype.remove = function () {
    this.steamClient.removeFriend(this.steamid);
};

/**
 * @param {String} comment
 * @param {Function} [callback]
 */
SteamFriend.prototype.postProfileComment = function (comment, callback) {
    this.steamClient.postProfileComment(this.steamid, comment, callback)
};