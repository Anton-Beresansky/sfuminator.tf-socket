module.exports = Sfuminator;
var events = require('events');
var Logs = require('./lib/logs.js');
var Users = require('./modules/users.js');
var Shop = require('./modules/shop.js');
var AjaxResponses = require('./modules/ajaxResponses.js');
var Interrupts = require('./lib/interrupts.js');
var BotPorting = require('./steambot/v3_bot_porting.js');

var Valve = require("./valve.js");

function Sfuminator(cloud, db) {
    this.cloud = cloud;
    this.db = db;
    this.log = new Logs("Sfuminator");
    this.log.setLevel(0);
    this.interrupts = new Interrupts([
        {name: "updateCurrency", delay: 60000, tag: "internal"},
        {name: "updateScannedProfiles", delay: 30000, tag: "global"},
        {name: "updateShopInventory", delay: 2000, tag: "internal"}
    ]);
    this.responses = new AjaxResponses(this);
    this.users = new Users(this, this.db, cloud);
    this.shop = new Shop(this);
    this.shopTrade_decay = 15000;

    this.botPorting = new BotPorting(this);

    this.scannedProfiles = 0;
    events.EventEmitter.call(this);
    this.init();
}

require("util").inherits(Sfuminator, events.EventEmitter);

Sfuminator.prototype.init = function () {
    var self = this;
    this.shop.on("ready", function () {
        self.interrupts.startInternals();
        //self.interrupts.startGlobals();
        self.bindInterrupts();
        self.loadActiveTrades(function () {
            self.log.debug("-- Sfuminator socket is ready --", 0);
            self.emit("ready");
        });
    });
};

Sfuminator.prototype.bindInterrupts = function () {
    var self = this;
    this.interrupts.on("updateCurrency", function () {
        self.shop.tf2Currency.update();
    });
    this.interrupts.on("updateScannedProfiles", function () {
        self.updateScannedProfiles();
    });
    this.interrupts.on("updateShopInventory", function () {
        self.shop.inventory.update();
    });
};

Sfuminator.prototype.loadActiveTrades = function (callback) {
    var self = this;
    var tryCallbackCount = 0;
    var tradeCount = 0;
    var tryCallback = function () {
        tryCallbackCount += 1;
        if (tradeCount === tryCallbackCount) {
            callback();
        }
    };
    this.shop.getActiveTrades(function (active_trades) {
        tradeCount = active_trades.length;
        if (tradeCount === 0) {
            callback();
        } else {
            for (var i = 0; i < active_trades.length; i += 1) {
                var shopTrade = self.users.get(active_trades[i].partnerID).makeShopTrade();
                shopTrade.setID(active_trades[i].id);
                shopTrade.load(function () {
                    tryCallback();
                });
            }
        }
    });
};

Sfuminator.prototype.onRequest = function (request, callback) {
    var self = this;
    this.log.debug("Processing sfuminator request", 3);
    if (request.isValid() && request.getAction()) {
        this.log.debug("Sfuminator request is valid", 3);
        request.parseRequester(this.users, function () {
            self.onAction(request, callback);
        });
    } else {
        callback(false);
    }
};

Sfuminator.prototype.onAction = function (request, callback) {
    /** OLD BOT PORTING **/
    if (this.botPorting.requestAvailable(request)) {
        this.botPorting.onRequest(request, callback);
        return;
    }
    ///////////////////////
    var data = request.getData();
    var requester = request.getRequester();
    switch (request.getAction()) {
        case "fetchShopInventory": //Ajax request fired from shop
            this.fetchShopInventory(request, callback);
            break;
        case "updateShop":
            if (requester.privilege === "user") {
                callback(this.getUpdates(request));
            } else {
                callback(this.responses.notLogged);
            }
            break;
        case "requestTradeOffer":
            if (requester.privilege === "user") {
                this.requestTradeOffer(request, callback);
            } else {
                callback(this.responses.notLogged);
            }
            break;
        case "cancelTrade":
            if (requester.privilege === "user") {
                this.cancelTrade(request, callback);
            } else {
                callback(this.responses.notLogged);
            }
            break;
        case "searchItem":
            this.shop.search.saveRequest(request);
            callback(this.shop.search.find(request.getData().text));
            break;
        case "getShopItem":
            callback(this.shop.getItem(parseInt(data.id)));
            break;
        case "storeAllBackpacks":
            this.allBackpackFetch();
            callback("ok");
            break;
        case "updateUser":
            this.getBackpackCached(data.steamid);
            this.updateUser(data.steamid);
            callback("ok");
            break;
        case "i_ve_been_here":
            var justForValve = new Valve(request);
            justForValve.process(callback);
            break;
        default:
            callback(this.responses.methodNotRecognised);
    }
};

Sfuminator.prototype.fetchShopInventory = function (request, callback) {
    var data = request.getData();
    var self = this;
    switch (data.type) {
        case "mine":
            if (request.getRequester().privilege === "user") {
                var steamid = request.getRequester().id;
                var user = this.users.get(steamid);
                user.tf2Backpack.getCached(function (backpack) {
                    callback(self.shop.getMine(backpack));
                });
            } else {
                callback(this.responses.notLogged);
            }
            break;
        default:
            if (this.shop.sectionExist(data.type)) {
                callback(this.shop.getClientBackpack(data.type));
            } else {
                callback(this.responses.sectionNotFound);
            }
            break;
    }
};

Sfuminator.prototype.getUpdates = function (request) {
    var data = request.getData();
    var response = this.responses.make({update: true, methods: {}});
    var user = this.users.get(request.getRequesterSteamid());
    if (user.hasActiveShopTrade()) {
        var trade = user.getShopTrade();
        if (data.hasOwnProperty("trade") && data.trade === "aquired") {
            response.methods.updateTrade = trade.getClientChanges(data.last_update_date);
        } else if (!trade.isClosed()) {
            response.methods.startTrade = trade.valueOf();
        }
    }
    if (data.hasOwnProperty("section") && data.section && this.shop.sectionExist(data.section.type)) { //Items
        var itemChanges = this.shop.sections[data.section.type].getClientChanges(data.section.last_update_date);
        if (itemChanges !== false) {
            response.methods.updateItemsVersioning = itemChanges;
        } else {
            response.methods.freshBackpack = this.shop.getClientBackpack(data.section.type);
        }
    }
    if (data.hasOwnProperty("section") && data.section.type === "mine" && !isNaN(data.section.last_update_date)) {
        if (user.getTF2Backpack().getLastUpdateDate() > new Date(data.section.last_update_date)) {
            response.methods.freshBackpack = this.shop.getMine(user.getTF2Backpack());
        }
    }
    if (data.hasOwnProperty("last_reservation_date")) { //Reservations
        var reservationsChanges = this.shop.reservations.getClientChanges(data.last_reservation_date);
        if (reservationsChanges !== false) {
            response.methods.updateReservationsVersioning = reservationsChanges;
        } else {
            response.methods.freshReservations = this.shop.reservations.getClientList();
        }
    }
    response.compactUserUpdate();
    return response;
};

Sfuminator.prototype.requestTradeOffer = function (request, callback) {
    var self = this;
    var data = request.getData();
    if (!data.hasOwnProperty("items") || (typeof data.items !== "object") || this.responses.make().isObjectEmpty(data.items) || !data.items) {
        callback(this.responses.noItems);
        return;
    }
    var user = this.users.get(request.getRequesterSteamid());
    if (!user.hasActiveShopTrade()) {
        var trade = user.makeShopTrade(data.items);
        trade.on("response", function (response) {
            callback(response);
        });
        trade.verifyItems(function (success) {
            self.log.debug("Request Trade Offer item verification, success: " + success);
            if (success) {
                trade.setMode("offer");
                trade.reserveItems();
                trade.send();
                callback(self.responses.tradeRequestSuccess(trade));
            }
        });
    } else {
        if (user.getShopTrade().isClosed()) {
            callback(this.responses.shopTradeCooldown(user.getShopTrade().getLastUpdateDate()));
        } else {
            callback(this.responses.alreadyInTrade);
        }
    }
};

Sfuminator.prototype.cancelTrade = function (request, callback) {
    var user = this.users.get(request.getRequesterSteamid());
    if (user.hasShopTrade() && !user.getShopTrade().isClosed()) {
        user.getShopTrade().cancel();
        callback(this.responses.tradeCancelled);
    } else {
        callback(this.responses.notInTrade);
    }
};



Sfuminator.prototype.updateUser = function (steamid) {
    var self = this;
    if (this.userCanBeUpdated(steamid)) {
        this.getUserInfo(steamid, function (_info) {
            for (var i = 0; i < _info.length; i += 1) {
                var info = _info[i];
                if (info && info.hasOwnProperty("personaname") && info.hasOwnProperty("avatarfull") && info.hasOwnProperty("steamid")) {
                    self.log.debug("Updating user: " + info.personaname);
                    self.users[steamid] = new Date();
                    self.updateDatabaseUser(info);
                }
            }
        });
    }
};
Sfuminator.prototype.userCanBeUpdated = function (steamid) {
    if (typeof steamid === "array") {
        return true;
    } else {
        return !(this.users.hasOwnProperty(steamid) && (this.users[steamid] > new Date() - 120000));
    }
};
Sfuminator.prototype.getUserInfo = function (steamid, callback) {
    this.cloud.send("getPlayerSummaries", {steamid: steamid}, function (result) {
        if (result && result.hasOwnProperty("players") && result.players.length > 0) {
            callback(result.players);
        } else {
            callback([]);
        }
    });
};
Sfuminator.prototype.updateDatabaseUser = function (user) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.getUpdateUserQuery(connection, user), function () {
            connection.release();
        });
    });
};
Sfuminator.prototype.getUpdateUserQuery = function (connection, user) {
    return "UPDATE `users` SET `name`=" + (connection.c.escape(user.personaname.toString())) + ", `avatar`='" + user.avatarfull.toString() + "' WHERE steam_id='" + user.steamid + "' LIMIT 1";
};

Sfuminator.prototype.updateScannedProfiles = function () {
    var self = this;
    this.cloud.send("query", "SELECT COUNT(*) as bp_count FROM backpacks", function (result) {
        var count = result[0].bp_count;
        if (count && (self.scannedProfiles !== count)) {
            self.db.connect(function (connection) {
                connection.query("INSERT INTO tasks (of,version) VALUES('scanned_profiles'," + count + ") ON DUPLICATE KEY UPDATE version=" + count, function () {
                    connection.release();
                });
            });
        }
    });
};
Sfuminator.prototype.allBackpackFetch = function () {
    var self = this;
    var i = 0;
    db.connect(function (connection) {
        connection.query("SELECT steam_id FROM allWorldProfiles", function (steamid_list) {
            self.cloud.query("SELECT owner FROM backpacks", function (scanned_steamid_list) {
                var fetchNextBackpack = function () {
                    var thisSteamid = steamid_list[i].steam_id;
                    i += 1;
                    if (!steamidExist(thisSteamid, scanned_steamid_list, "owner")) {
                        self.cloud.send("fetchBackpack", {steamid: thisSteamid}, function (result) {
                            if (result.hasOwnProperty("result") && result.result === "error") {
                                console.log("Error fetching backpack: " + result.code);
                                i -= 1;
                                setTimeout(fetchNextBackpack, 2000);
                            } else if (i < steamid_list.length) {
                                setTimeout(fetchNextBackpack, 0);
                            }
                            console.log("Fetched backpack " + i + "/" + steamid_list.length + " (ping: " + cloud.ping + "ms) | " + thisSteamid + " - " + JSON.stringify(result).slice(0, 100));
                        });
                    } else {
                        if (i < steamid_list.length) {
                            setTimeout(fetchNextBackpack, 0);
                        }
                    }
                };
                fetchNextBackpack();
                setTimeout(function () {
                    fetchNextBackpack();
                }, 500);
                setTimeout(function () {
                    fetchNextBackpack();
                }, 1000);
                setTimeout(function () {
                    fetchNextBackpack();
                }, 1500);
            });
        });
    });
};
function steamidExist(steamid, list, _propname) {
    var prop = "steam_id";
    if (_propname) {
        prop = _propname;
    }
    for (var i = 0; i < list.length; i += 1) {
        if (list[i][prop] === steamid) {
            return true;
        }
    }
    return false;
}