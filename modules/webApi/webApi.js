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
    this.tf2 = new TF2API(this, "***REMOVED***", {debug: true});
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
    setTimeout(function () {
        self.getKeyPrice(function () {
            self.tf2.update(function () {
                if (typeof callback == "function") {
                    callback();
                }
            });
        });
    }, 2000);
};

WebApi.prototype.getKeyPrice = function (callback) {
    var self = this;
    this.keyPricer.fetch(function () {
        if (typeof callback === "function") {
            callback(self.keyPricer.get());
        }
    })
};

/**
 * @param currentBackpack {Backpack}
 * @param callback {function}
 * @param options {object}
 */
WebApi.prototype.getBackpack = function (currentBackpack, callback, options) {
    var self = this;
    //Abstraction layer added for multiple games
    this.backpacks.read(currentBackpack, function (err, steamBackpack) {
        if (!err) {
            end(null, steamBackpack);
        } else if (err.message === "steam_api_down") {
            self.backpacks.read(currentBackpack, function (err, dbBackpack) {
                //We just hope there won't be errors :D
                end(err, err ? 1 : dbBackpack);
            }, options);
        } else if (err.message === "anti_spam") {
            end(err);
        }
    }, options);

    var end = function (err, bp) {
        if (typeof callback === "function") {
            callback(err, bp);
        }
    }
};

WebApi.prototype._handleOnceReady = function () {
    for (var i = 0; i < this.onceReadyCallbacks.length; i += 1) {
        this.onceReadyCallbacks[i]();
    }
    this.onceReadyCallbacks = [];
};