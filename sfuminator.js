module.exports = Sfuminator;
var events = require('events');
var Logs = require('./lib/logs.js');
var Users = require('./modules/users.js');
var Shop = require('./modules/shop.js');
var AjaxResponses = require('./modules/ajaxResponses.js');
var Stats = require('./modules/stats.js');
var TradeStatus = require('./modules/trade/status.js');
var Interrupts = require('./lib/interrupts.js');
var BotPorting = require('./steambot/v3_bot_porting.js');

var Valve = require("./valve.js");

function Sfuminator(cloud, db) {
    this.cloud = cloud;
    this.db = db;
    this.log = new Logs("Sfuminator");
    this.log.setLevel(0);
    this.admin = ["76561197992634049"];
    this.interrupts = new Interrupts([
        {name: "updateCurrency", delay: 60000, tag: "internal"},
        {name: "updateShopInventory", delay: 2000, tag: "internal"},
        {name: "updateStats", delay: 1000, tag: "global"},
        {name: "updateTradeStatus", delay: 1000, tag: "global"}
    ]);
    this.responses = new AjaxResponses(this);
    this.users = new Users(this, this.db, cloud);
    this.shop = new Shop(this);
    this.stats = new Stats(this);
    this.status = new TradeStatus(this.db);

    this.shopTrade_decay = 15000;

    this.botPorting = new BotPorting(this);

    events.EventEmitter.call(this);
    this.init();
}

require("util").inherits(Sfuminator, events.EventEmitter);

Sfuminator.prototype.init = function () {
    var self = this;
    this.shop.on("ready", function () {
        self.interrupts.startInternals();
        self.interrupts.startGlobals();
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
    this.interrupts.on("updateStats", function () {
        self.stats.update();
    });
    this.interrupts.on("updateShopInventory", function () {
        self.shop.inventory.update();
    });
    this.interrupts.on("updateTradeStatus", function () {
        self.status.update();
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
        case "getStats":
            callback(this.stats.get(parseInt(data.last_update_date)));
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
    if (!this.status.canTrade() && !this.isAdmin(request.getRequesterSteamid())) {
        callback(this.responses.cannotTrade(this.status.get()));
        return;
    }
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

Sfuminator.prototype.isAdmin = function (steamid) {
    for (var i = 0; i < this.admin.length; i += 1) {
        if (this.admin[i] === steamid) {
            return true;
        }
    }
    return false;
};