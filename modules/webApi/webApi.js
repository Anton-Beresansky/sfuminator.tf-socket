module.exports = WebApi;

var BackpacksAPI = require("./backpacksApi.js");
var TF2API = require("./tf2Api.js");
var KeyPricer = require("./keyPricer.js");

/**
 * @param {Database} db_items
 * @param {SteamAPI} steamApi
 * @constructor
 */
function WebApi(db_items, steamApi) {
    this.db_items = db_items;
    /**
     * @type {SteamAPI}
     */
    this.steamApi = steamApi;
    /**
     * @type {KeyPricer}
     */
    this.keyPricer = new KeyPricer();
    /**
     * @type {TF2Api}
     */
    this.tf2 = new TF2API(this, "526079b44dd7b850058b4568", {debug: true});
    /**
     * @type {BackpacksApi}
     */
    this.backpacks = new BackpacksAPI(this.db_items, this.steamApi, this.tf2, {debug: true});

    this.onceReadyCallbacks = [];
    this.ready = false;
    this.update();
    this._bindHandlers();
}

WebApi.prototype._bindHandlers = function () {
    var self = this;
    this.tf2.on("schema_loaded", function () {
        self.ready = true;
        self._handleOnceReady();
    });
};

WebApi.prototype.onceReady = function (callback) {
    if (this.ready) {
        callback();
    } else {
        this.onceReadyCallbacks.push(callback);
    }
};

WebApi.prototype.update = function (callback) {
    var self = this;
    this.getKeyPrice(function () {
        self.tf2.update(function () {
            if (typeof callback == "function") {
                callback();
            }
        });
    });
};

WebApi.prototype.getKeyPrice = function (callback) {
    var self = this;
    this.keyPricer.fetch(function () {
        if (typeof callback === "function") {
            callback(self.keyPricer.get());
        }
    })
};

WebApi.prototype.getBackpack = function (data, answer) {
    var self = this;
    this.backpacks.get(data.steamid, function (steamBackpack) {
        if (steamBackpack.hasOwnProperty("result") && steamBackpack.result === "error") {
            self.backpacks.read(data.steamid, function (dbBackpack) {
                if (dbBackpack.hasOwnProperty("result") && dbBackpack.result === "error") {
                    if (typeof answer === "function") {
                        answer(steamBackpack);
                    }
                } else {
                    if (typeof answer === "function") {
                        answer(dbBackpack);
                    }
                }
                answer = null;
                steamBackpack = null;
                dbBackpack = null;
            });
        } else {
            if (typeof answer === "function") {
                answer(steamBackpack);
            }
            answer = null;
            steamBackpack = null;
        }
    }, data.options);
};

WebApi.prototype._handleOnceReady = function () {
    for (var i = 0; i < this.onceReadyCallbacks.length; i += 1) {
        this.onceReadyCallbacks[i]();
    }
    this.onceReadyCallbacks = [];
};