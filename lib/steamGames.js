// Sfuminator.tf | Steam Games

module.exports = new SteamGames();

/**
 * @class SteamGames
 * @constructor
 */
function SteamGames() {
    /**
     * TF2
     * @type {SteamGame}
     */
    this.TF2 = new SteamGame(440, "Team Fortress 2");
    /**
     * CSGO
     * @type {SteamGame}
     */
    this.CSGO = new SteamGame(730, "Counter Strike Global Offensive");
    /**
     * STEAM
     * @type {SteamGame}
     */
    this.STEAM = new SteamGame(753, "Steam Inventory");

    this.CONTEXT = {
        GAME_GIFT: 1,
        GAME_ITEM: 2,
        COUPON: 3,
        TRADING_CARD: 6,
        REWARD: 7
    };
}

/**
 * @class SteamGame
 * @param {Number} id
 * @param {String} name
 * @constructor
 */
function SteamGame(id, name) {
    this.id = id;
    this.name = name;
}

SteamGame.prototype.getID = function () {
    return this.id;
};

SteamGame.prototype.getName = function () {
    return this.name;
};