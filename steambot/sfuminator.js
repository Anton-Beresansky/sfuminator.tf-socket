var events = require("events");
var SteamAPI = require("../lib/steamapi.js");
var sfuminatorSocket = require("./socket.js");
var fs = require("fs");
var tf2, steamTrade;
var api = new SteamAPI("***REMOVED***");
var socket = new sfuminatorSocket("***REMOVED***");
var HOUR = 360; //Actually is 6 min
var BACKPACKREFRESHLIMIT = 3;
var FRIENDLIST_LIMIT = 170;
var FRIENDLIST_WHITELIST = ["76561198045065602", "76561198145778912", "***REMOVED***", "76561198046649970", "76561197982700608"];
var MODERATORS = ["***REMOVED***", "76561198046649970"];
var sfr_group_gid = "6337159";
var metals = ["refined", "reclaimed", "scrap"];
var qualityLookup = ["", "Genuine", "", "Vintage", "", "Unusual", "", "Community", "Valve", "Self-Made", "", "Strange", "", "Haunted", "Collector's"];
var mySteamID = "76561198145778912"; //axefish: 76561198045065602 //sfuminator: 76561198145778912
var usersFileName = 'sfr_users_' + mySteamID + '.txt';
api.on("error", function (msg) {
    console.log("SteamAPI: " + msg);
});
module.exports = Sfuminator;
//user object:
//steamid: {
//  personaname: string,
//  personastate: int,
//  realname: string,
//  loccountrycode: string,
//  relationship: "friend"/"not_friend",
//  friend_since: int,
//  steamp_group: "joined"/"not_joined",
//  in_queue: boolean,
//  metal_reservation: boolean,
//  reserving : boolean,
//  queue: [{
//      steamid: string,
//      position: int,
//      mode: string,
//      modePlus: string,
//      items: [
//          {
//              name: string,
//              defindex: int,
//              level: int,
//              quality: int,
//              id: string,
//              original_id: string,
//              scrapPrice: int
//          }
//      ],
//      additional: {object}
//  }],
//  behavior: {
//      first_greeting: boolean,
//      last_greeting: int,
//      last_trade: int,
//      last_activity: int,
//      afk_counter: int,
//      number_of_trades: int,
//      pending_answer: {
//          status: boolean, //if waiting for answer just set this
//          type: string 
//      },
//      discussions: {
//          type: {
//              answered: boolean,
//              when: int
//          }
//      }
//}

//.tradeOffer method: (myItem structure)
//
// myItems {
//  items: [array of ids or array of items with id property]
//  currency: {
//      metal: {
//          quantity: int
//      },
//      key: {
//          quantity: int
//      }
//  }
// }

function Sfuminator(tf2Instance, steamTradeInstance) {
    this.busy = false;
    this.in_trade = false;
    this.logging = false;
    this.logged = false;
    this.crafting = false;
    this.reserving = false;
    this.contacting = false;
    this.loadingBackpack = false;
    this.loadingBackpackInterval = 500;
    this.friends = {}; // List of [steamid: {friend_since, relationship}]
    this.users = {}; // List of users (steamid is the index key), with ALL the informations for each user
    this.backpacks = {};
    this.backpack = {
        metal: {
            refined: [],
            reclaimed: [],
            scrap: []
        }, // (refined[id:{reserved: boolean}], reclaimed[], scrap[], getRefinedCount() ...etc)
        items: {}, // Item object id indexed
        num_backpack_slots: 0
    };
    this.sentTradeOffers = {}; //List of sent and active trade offers accessible through steamid. {partnerID: {partnerID, tradeOfferID, when}}
    this.reserveQueue = [];
    this.craftQueue = [];
    this.firstInQueue = {}; //Queue info about the first player in the queue
    this.queue = {}; // Current queue (List of {steamid, position, mode, modePlus, items, additional})
    this.pendingMailVerifications = []; //array containing a list of steamids referring to who has a pending mail verification
    this.lockPendingMailVerification = false;
    this.tradeOffers = {}; //Current list of not closed trade offers (List of {steamid, mode, status, last_change, additional})
    this.tradeFails = 0;
    this.thisTrade = {// All the informations about the current trade
        partnerID: "",
        tradeMode: "",
        tradeModePlus: "",
        myItems: [],
        hisItems: [],
        queue_data: {}
    };
    this.initStatus = {// Init status
        users: false,
        keywords_combinations: false,
        queue: false,
        tradeOffers: false,
        pendingQueueMails: false
    };
    this.timeout = {}; //list of timeouts {obj, time, success}
    this.interval = {}; //list of intervals {obj, time, success}
    this.afkCheckIntervals = {};
    this.logs = {};
    tf2 = tf2Instance;
    steam = tf2._client;
    steamTrade = steamTradeInstance;
    events.EventEmitter.call(this);
    var self = this;
    //////////////////////////////////////////////////////////////////////////////// EVENTS
    this.on("next_reserveQueue", function () {
        if (self.reserveQueue.length > 0) {
            var thisR = self.reserveQueue[0];
            self.emit("debug", "Processing next reserveQueue " + thisR.holderID);
            self.reserveQueue.shift();
            self.reserveMetal(thisR.holderID, thisR.total_refineds, thisR.total_reclaimeds, thisR.total_scraps, thisR.forced);
        }
    });
    this.on("next_craftQueue", function () {
        if (self.craftQueue.length > 0) {
            var thisC = self.craftQueue[0];
            self.emit("debug", "Processing next craftQueue");
            self.craftQueue.shift();
            self.craftMetal(thisC);
        }
    });
}
require("util").inherits(Sfuminator, events.EventEmitter);
//////////////////////////////////////////////////////////////////////////////// INIT AND CLIENT ACTIONS
Sfuminator.prototype.init = function (init_socket) {
    this.socket = socket;
    selfie = this;
    var self = this;
    self.emit("message", "Initializing sfuminator bot...");
    self.on("initLoaded", function (step) {
        self.emit("debug", "init: loaded " + step);
        self.emit("message", "Loaded " + step);
        if (step === "users") {
            self.tradeMetalReserve(null, "all");
        }
        var initComplete = true;
        var status = self.initStatus;
        for (var prop in status) {
            if (status.hasOwnProperty(prop)) {
                if (status[prop] === false) {
                    initComplete = false;
                }
            }
        }
        if (initComplete) {
            self.emit("initComplete");
        }
    });
    self.emit('debug', 'init fired');
    if (init_socket) {
        self.emit("message", "Starting polling procedures...");
        socket.startNormalPollingProcedure();
        socket.startEmergencyPollingProcedure();
        socket.addSocketRequest("queue");
        socket.addSocketRequest("tradeOffers");
        socket.addSocketRequest("pendingQueueMails");
        socket.addSocketPoke("keepAlive");
    } else {
        delete selfie.initStatus.tradeOffers;
        delete selfie.initStatus.queue;
    }
    self.loadUsers();
    self.loadAllKeywordsCombinations();
    self.resetThisTrade();
    self.updateCurrency();
    self.startAutoSave();
    return self;
};
Sfuminator.prototype.play = function () {
    tf2.playTF2();
};
Sfuminator.prototype.newFriend = function (steamid) {
    var self = this;
    self.emit("debug", "newFriend: processing new player...");
    selfie.friends[steamid] = {relationship: "friend", friend_since: Math.round(new Date().getTime() / 1000)};
    if (!selfie.users.hasOwnProperty(steamid)) {
        selfie.updateUser(steamid);
    }
    if (steamid === selfie.firstInQueue.steamid) {
        self.emit("debug", "newFriend: correspond to next person (" + steamid + ")");
        selfie.thisTrade.queue_data = selfie.firstInQueue;
        selfie.thisTrade.partnerID = selfie.firstInQueue.steamid;
        self.emit("tradeNextPerson", selfie.thisTrade.partnerID, true);
    }
    for (var x in selfie.queue) {
        if ((selfie.queue[x].steamid === steamid) && (steamid !== selfie.firstInQueue.steamid)) {
            selfie.message(steamid, "hello_queue");
        }
    }
    while (selfie.removeFriend()) {

    }
};
Sfuminator.prototype.removeFriend = function () {
    var smallest = {steamid: "", friend_since: 0};
    var counter = 0;
    for (var x in selfie.friends) {
        counter += 1;
        if ((parseInt(selfie.friends[x].friend_since) < smallest.friend_since) || (smallest.friend_since === 0)) {
            var flag_remove = true;
            for (var y in FRIENDLIST_WHITELIST) {
                if (String(FRIENDLIST_WHITELIST[y]) === String(x)) {
                    flag_remove = false;
                }
            }
            if (flag_remove) {
                smallest.steamid = x;
                smallest.friend_since = parseInt(selfie.friends[x].friend_since);
            }
        }
    }
    if (counter > FRIENDLIST_LIMIT) {
        selfie.emit("debug", "Too many friends, will remove");
        delete selfie.friends[smallest.steamid];
        selfie.emit("removeFriend", smallest.steamid);
        return true;
    } else {
        return false;
    }
};
Sfuminator.prototype.startAfkCheck = function (steamid) {
    if (!selfie.users[steamid].hasOwnProperty("afkChecking") || selfie.users[steamid].afkChecking === false) {
        selfie.emit("debug", "startAfkCheck: starting afk checking procedure for player: " + steamid);
        selfie.users[steamid].afkChecking = true;
        var afkCheckIntervalMethod = function (steamid) {
            if (!selfie.users[steamid].hasOwnProperty("interval")) {
                selfie.users[steamid].interval = {};
            }
            selfie.afkCheckIntervals[steamid] = setInterval(function () {
                if (selfie.users[steamid].afkChecking === true) {
                    selfie.users[steamid].behavior.afk_counter += 1;
                    var afk_counter = selfie.users[steamid].behavior.afk_counter;
                    var last_activity = selfie.users[steamid].behavior.last_activity;
                    var now = time();
                    if (afk_counter === 240) { //4 minutes
                        if (selfie.isFirstInQueue(steamid)) {
                            selfie.message(steamid, "trade_too_long_alert");
                        } else {
                            selfie.message(steamid, "tradeOffer_trade_too_long_alert");
                        }
                    }
                    if (afk_counter === 270) { //4:30 minutes
                        if (selfie.isFirstInQueue(steamid)) {
                            selfie.message(steamid, "trade_too_long");
                            selfie.endTradeSession();
                        } else {
                            selfie.message(steamid, "tradeOffer_trade_too_long");
                            selfie.endTradeOfferSession(steamid, "afk");
                        }
                    }
                    if (last_activity + 45 === now) { //after 30 secs
                        if (selfie.isFirstInQueue(steamid)) {
                            selfie.message(steamid, "afk_alert");
                            selfie.users[steamid].behavior.pending_answer.status = true;
                        }
                    }
                    if (last_activity + 30 === now && !selfie.in_trade && selfie.isFirstInQueue(steamid)) { //after 15 secs not in trade
                        selfie.message(steamid, "trade_me");
                    }
                    if (last_activity + 60 < now) { //after 60 secs of inactivity
                        if (selfie.isFirstInQueue(steamid)) {
                            selfie.message(steamid, "afk_kick");
                            selfie.endTradeSession();
                        }
                    }
                    if (last_activity + 90 === now) {
                        if (!selfie.isFirstInQueue(steamid)) {
                            selfie.message(steamid, "afk_alert");
                            selfie.users[steamid].behavior.pending_answer.status = true;
                        }
                    }
                    if (last_activity + 120 < now) {
                        if (!selfie.isFirstInQueue(steamid)) {
                            selfie.message(steamid, "tradeOffer_afk_kick");
                            selfie.endTradeOfferSession(steamid, "afk");
                        }
                    }
                    if (last_activity + 90 < now) {
                        if (selfie.hasPendingMailVerification(steamid)) {
                            selfie.message(steamid, "pendingMail_afk_kick");
                            selfie.endTradeSession(steamid);
                        }
                    }
                } else {
                    selfie.emit("error", "afkChecking has been resetted, stopping afkCheckProcedure", 23);
                }
            }, 1000);
        };
        afkCheckIntervalMethod(steamid);
    } else {
        selfie.emit("error", "Couldn't start afkChecking procedure for player " + steamid + ", another instance is already started", 22);
        selfie.stopAfkCheck(steamid);
        selfie.startAfkCheck(steamid);
    }
};
Sfuminator.prototype.stopAfkCheck = function (steamid) {
    clearInterval(selfie.afkCheckIntervals[steamid]);
    selfie.users[steamid].behavior.afk_counter = 0;
    selfie.users[steamid].afkChecking = false;
};
////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////// TRADING
Sfuminator.prototype.startTradeProcedure = function (steamid) {
    if (selfie.users.hasOwnProperty(steamid)) {
        return true;
    } else {
        selfie.emit("error", "startTradeProcedure: User " + steamid + " was not found", 5);
        return false;
    }
};
Sfuminator.prototype.onTradeStart = function (callback) {
    var queue_data = selfie.thisTrade.queue_data;
    var tradeMode = queue_data.tradeMode;
    var tradeModePlus = queue_data.tradeModePlus;
    var steamid = queue_data.steamid;
    selfie.thisTrade.tradeMode = tradeMode;
    selfie.thisTrade.tradeModePlus = tradeModePlus;
    selfie.thisTrade.partnerID = steamid;
    selfie.thisTrade.all_metal_change = {};
    switch (tradeModePlus) {
        case "hatExchange":
            selfie.emit("debug", "onTradeStart: Intialing hatExchange mode");
            selfie.thisTrade.myItems = [];
            for (var x in queue_data.items) {
                selfie.thisTrade.myItems.push(selfie.backpack.items[queue_data.items[x].id]);
            }
            selfie.thisTrade.hisItems = {craftableHats: []};
            selfie.thisTrade.wrongItems = [];
            selfie.thisTrade.iNeed = selfie.thisTrade.myItems.length;
            selfie.thisTrade.metalToChange = 0;
            selfie.thisTrade.metalChanging = 0;
            selfie.thisTrade.hisMetal = 0;
            for (var x in metals) {
                selfie.thisTrade.all_metal_change[metals[x]] = [];
                for (var y in selfie.backpack.metal[metals[x]]) {
                    if (selfie.backpack.metal[metals[x]][y].reserved && selfie.backpack.metal[metals[x]][y].to === selfie.thisTrade.partnerID) {
                        selfie.thisTrade.all_metal_change[metals[x]].push(selfie.backpack.items[y].id);
                    }
                }
            }
            break;
        case "hatShop":
            if (tradeMode === "metal_mine") {
                selfie.emit("debug", "onTradeStart: Intialing hatShop /he_sell mode");
                selfie.thisTrade.iNeed = queue_data.items;
                selfie.thisTrade.myItems = [];
                selfie.thisTrade.hisItems = [];
                selfie.thisTrade.wrongItems = [];
                for (var x in metals) {
                    for (var y in selfie.backpack.metal[metals[x]]) {
                        if (selfie.backpack.metal[metals[x]][y].reserved && selfie.backpack.metal[metals[x]][y].to === selfie.thisTrade.partnerID) {
                            selfie.thisTrade.myItems.push(selfie.backpack.items[y]);
                        }
                    }
                }
            }
            if (tradeMode === "hatShop") {
                selfie.emit("debug", "onTradeStart: Intialing hatShop /he_buy mode");
                selfie.thisTrade.myItems = [];
                selfie.thisTrade.wrongItems = [];
                try {
                    for (var x in queue_data.items) {
                        var _temp_item = selfie.backpack.items[queue_data.items[x].id];
                        _temp_item.scrapPrice = queue_data.items[x].scrapPrice;
                        selfie.thisTrade.myItems.push(_temp_item);
                    }
                } catch (e) {
                    selfie.emit("error", "CRITICAL: Didn't remove person from queue? Forcing restart", 1003);
                    socket.removeFromQueue(steamid, function () {
                        process.exit(1);
                    });
                }
                var scrapiNeed = 0;
                for (var x in queue_data.items) {
                    scrapiNeed += queue_data.items[x].scrapPrice; /////// <---- if myItems is length 0 then this will cause error
                }
                selfie.thisTrade.iNeed = scrapiNeed;
                selfie.thisTrade.all_metal_change = {};
                selfie.thisTrade.metalToChange = 0;
                selfie.thisTrade.metalChanging = 0;
                selfie.thisTrade.hisMetal = 0;
                for (var x in metals) {
                    selfie.thisTrade.all_metal_change[metals[x]] = [];
                    for (var y in selfie.backpack.metal[metals[x]]) {
                        if (selfie.backpack.metal[metals[x]][y].reserved && selfie.backpack.metal[metals[x]][y].to === selfie.thisTrade.partnerID) {
                            selfie.thisTrade.all_metal_change[metals[x]].push(selfie.backpack.items[y].id);
                        }
                    }
                }
            }
            break;
    }
    callback(true);
};
Sfuminator.prototype.onTradeChange = function (added, _item, themAssets) {
    var item = selfie.normalizeTradeItems(_item);
    if (typeof item === "undefined") {
        return;
    }
    if (selfie.thisTrade.tradeModePlus === "hatShop" && selfie.thisTrade.tradeMode === "hatShop") {
        selfie.thisTrade.hisItems = themAssets;
        var metalValue = 0;
        switch (item.defindex) {
            case 5002:
                metalValue = 9;
                break;
            case 5001:
                metalValue = 3;
                break;
            case 5000:
                metalValue = 1;
                break;
            default:
                selfie.thisTrade.wrongItems.push(item);
                break;
        }
        if (added) {
            selfie.thisTrade.hisMetal += metalValue;
        } else {
            selfie.thisTrade.hisMetal -= metalValue;
        }
        selfie.changeMetal();
    }
    if (selfie.thisTrade.tradeModePlus === "hatExchange" && selfie.thisTrade.tradeMode === "hatExchange") {
        if (added) {
            if (item.defindex === 5000) {
                selfie.thisTrade.hisMetal += 1;
            } else if (item.defindex === 5001) {
                selfie.thisTrade.hisMetal += 3;
            } else if (item.defindex === 5002) {
                selfie.thisTrade.hisMetal += 9;
            } else {
                socket.getItem(item.defindex, item.quality, (item.flag_cannot_craft ? "1" : "0"), function (THISITEM) {
                    selfie.emit("debug", "Item recognised, his price is: " + THISITEM.absolute_price);
                    var thisItemRefinedPrice = THISITEM.absolute_price * selfie.currency.usd.refined;
                    selfie.emit("debug", "Or better, in refined: " + thisItemRefinedPrice);
                    if ((THISITEM.item_type_name === "#TF_Wearable_Hat") || ((THISITEM.craft_material_type === "hat"))) {
                        if (thisItemRefinedPrice >= 1.3) {
                            if (!item.flag_cannot_craft) {
                                var flagTooMany;
                                flagTooMany = false;
                                if (selfie.backpack.itemsCount[item.defindex] > 1) {
                                    selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Sorry, I can't accept your: " + item.name + ", I have already too many"});
                                    selfie.thisTrade.wrongItems.push(item);
                                } else {
                                    selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Ok, I can accept your: " + item.name});
                                    selfie.thisTrade.hisItems.craftableHats.push(item);
                                }
                            } else {
                                selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Sorry, I can't accept your: " + item.name + ", it is not craftable"});
                                selfie.thisTrade.wrongItems.push(item);
                            }
                        } else {
                            if (item.flag_cannot_craft) {
                                selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Sorry, I can't accept your: " + item.name + ", it is not craftable"});
                            } else {
                                selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Sorry, I can't accept your: " + item.name});
                            }
                            selfie.thisTrade.wrongItems.push(item);
                        }
                    } else {
                        selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Sorry, I can't accept your: " + item.name + ", it is not an hat"});
                        selfie.thisTrade.wrongItems.push(item);
                    }
                });
            }
        } else {
            for (var x in  selfie.thisTrade.hisItems.craftableHats) {
                if (selfie.thisTrade.hisItems.craftableHats[x].id === item.id) {
                    selfie.thisTrade.hisItems.craftableHats.splice(x, 1); //result.message = "You removed " + item.name;
                    break;
                }
            }
            for (var x in  selfie.thisTrade.wrongItems) {
                if (selfie.thisTrade.wrongItems[x].id === item.id) {
                    selfie.thisTrade.wrongItems.splice(x, 1); //result.message = "You removed " + item.name;
                    break;
                }
            }
            if (item.defindex === 5000) {
                selfie.thisTrade.hisMetal -= 1; //result.message = "You removed 1 scrap metal";
            }
            if (item.defindex === 5001) {
                selfie.thisTrade.hisMetal -= 3; //result.message = "You removed 3 scrap metal";
            }
            if (item.defindex === 5002) {
                selfie.thisTrade.hisMetal -= 9; //result.message = "You removed 9 scrap metal";
            }
        }
        if (item.defindex === 5000 || item.defindex === 5001 || item.defindex === 5002) {
            selfie.changeMetal();
        }
    }
};
Sfuminator.prototype.onTradeReady = function (themAssets) {
    if (selfie.thisTrade.tradeModePlus === "hatShop" && selfie.thisTrade.tradeMode === "hatShop") {
        selfie.thisTrade.hisItems = selfie.normalizeTradeItems(themAssets);
        selfie.thisTrade.wrongItems = [];
        var metalValue = 0;
        var hisMetal = 0;
        for (var x in selfie.thisTrade.hisItems) {
            switch (selfie.thisTrade.hisItems[x].defindex) {
                case 5002:
                    metalValue = 9;
                    break;
                case 5001:
                    metalValue = 3;
                    break;
                case 5000:
                    metalValue = 1;
                    break;
                default:
                    metalValue = 0;
                    selfie.thisTrade.wrongItems.push(selfie.thisTrade.hisItems[x]);
                    break;
            }
            hisMetal += metalValue;
        }
        selfie.thisTrade.hisMetal = hisMetal;
        var metalDelta = selfie.thisTrade.iNeed - selfie.thisTrade.hisMetal;
        if (selfie.thisTrade.wrongItems.length === 0) {
            if (metalDelta > 0) {
                selfie.thisTrade.toAdd = metalDelta;
                selfie.thisTrade.toRemove = 0;
                selfie.message(selfie.thisTrade.partnerID, "trade_wrong_items");
            } else {
                metalDelta = 0 - metalDelta;
                if (metalDelta > 8) {
                    selfie.thisTrade.toAdd = 0;
                    selfie.thisTrade.toRemove = metalDelta - 8;
                    selfie.message(selfie.thisTrade.partnerID, "trade_wrong_items");
                } else {
                    selfie.changeMetal();
                }
            }
            if (selfie.thisTrade.hisMetal === selfie.thisTrade.iNeed + selfie.thisTrade.metalChanging) {
                return true;
            }
        } else {
            selfie.thisTrade.toRemove = selfie.thisTrade.wrongItems;
            selfie.thisTrade.toAdd = 0;
            selfie.message(selfie.thisTrade.partnerID, "trade_wrong_items");
        }
    }
    if (selfie.thisTrade.tradeModePlus === "hatShop" && selfie.thisTrade.tradeMode === "metal_mine") {
        selfie.thisTrade.hisItems = selfie.normalizeTradeItems(themAssets);
        var iNeed = selfie.thisTrade.iNeed;
        selfie.thisTrade.toAdd = elementsMissingFrom(selfie.thisTrade.hisItems, iNeed, ["id"]);
        selfie.thisTrade.toRemove = elementsMissingFrom(iNeed, selfie.thisTrade.hisItems, ["id"]);
        if (selfie.thisTrade.toAdd.length === 0 && selfie.thisTrade.toRemove.length === 0) {
            var scrapsIneed = 0;
            for (var x in iNeed) {
                scrapsIneed += iNeed[x].scrapPrice;
            }
            var myScraps = 0;
            for (var x in selfie.thisTrade.myItems) {
                switch (selfie.thisTrade.myItems[x].defindex) {
                    case 5002:
                        myScraps += 9;
                        break;
                    case 5001:
                        myScraps += 3;
                        break;
                    case 5000:
                        myScraps += 1;
                        break;
                }
            }
            if (myScraps === scrapsIneed) {
                return true;
            } else {
                selfie.emit("error", "CRITICAL! Added wrong amount of metal! Restarting", 1001);
                process.exit(1);
            }
        } else {
            selfie.message(selfie.thisTrade.partnerID, "trade_wrong_items");
        }
    }
    if (selfie.thisTrade.tradeModePlus === "hatExchange" && selfie.thisTrade.tradeMode === "hatExchange") {
        var offer = selfie.normalizeTradeItems(themAssets);
        var flagError;
        var hisScrapCount;
        var hisHatsCount;
        flagError = false;
        hisScrapCount = 0;
        hisHatsCount = 0;
        for (var x in offer) {
            if (offer[x].defindex === 5000) {
                hisScrapCount += 1;
            } else if (offer[x].defindex === 5001) {
                hisScrapCount += 3;
            } else if (offer[x].defindex === 5002) {
                hisScrapCount += 9;
            } else {
                var unexpectedItem;
                unexpectedItem = true;
                for (var y in selfie.thisTrade.hisItems.craftableHats) {
                    if (selfie.thisTrade.hisItems.craftableHats[y].id === offer[x].id) {
                        hisHatsCount += 1;
                        unexpectedItem = false;
                        break;
                    }
                }
                for (var y in selfie.thisTrade.wrongItems) {
                    if (selfie.thisTrade.wrongItems[y].id === offer[x].id) {
                        unexpectedItem = false;
                        break;
                    }
                }
                if (unexpectedItem) {
                    console.log("Warning: unexpected item: " + offer[x].name);
                    selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "Wait a second, I'm checking your items, unready and ready again"});
                    flagError = true;
                }
            }
        }
        selfie.thisTrade.hisMetal = hisScrapCount;
        if (!flagError) {
            if (selfie.thisTrade.wrongItems.length === 0) {
                if (hisHatsCount === selfie.thisTrade.iNeed) {
                    if (selfie.thisTrade.hisMetal === (selfie.thisTrade.iNeed + selfie.thisTrade.metalChanging)) {
                        return true;
                    } else {
                        var metalDelta = selfie.thisTrade.iNeed - selfie.thisTrade.hisMetal;
                        if (metalDelta > 0) {
                            selfie.thisTrade.toAdd = metalDelta;
                            selfie.thisTrade.toRemove = 0;
                            selfie.message(selfie.thisTrade.partnerID, "trade_wrong_items");
                        } else {
                            metalDelta = 0 - metalDelta;
                            if (metalDelta > 8) {
                                selfie.thisTrade.toAdd = 0;
                                selfie.thisTrade.toRemove = metalDelta - 8;
                                selfie.message(selfie.thisTrade.partnerID, "trade_wrong_items");
                            } else {
                                selfie.changeMetal();
                            }
                        }
                    }
                } else {
                    if (hisHatsCount < selfie.thisTrade.iNeed) {
                        selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID,
                            message: "You didn't put enough hats, remember you selected Hat Exchange mode, this means that I trade any Hat for any Hat + Scrap Metal, You have to add "
                                    + (selfie.thisTrade.iNeed - hisHatsCount) + " hat"});
                    } else {
                        selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "You added too many hats!"});
                    }
                }
            } else {
                var mxgData = "";
                for (var x in selfie.thisTrade.wrongItems) {
                    mxgData += selfie.thisTrade.wrongItems[x].name + ",";
                }
                mxgData = mxgData.slice(0, mxgData.length - 1);
                selfie.emit("steamMessage", {steamid: selfie.thisTrade.partnerID, message: "You have to remove the following items first: " + mxgData});
            }
        }
    }
};
Sfuminator.prototype.removeFirstInQueue = function () {
    socket.removeFromQueue(selfie.firstInQueue.steamid);
};
Sfuminator.prototype.manageTradeResult = function (result, thisTrade, callback) {
    selfie.in_trade = false;
    if (result === "failed" || result === "timeout") {
        if (!selfie.thisTrade.hasOwnProperty("fails")) {
            selfie.thisTrade.failCount = 1;
        } else {
            selfie.thisTrade.failCount += 1;
        }
        if (selfie.thisTrade.failCount === 1) {
            selfie.tradeFails += 1;
        }


        if (selfie.tradeFails === 3) {
            socket.alertSteamStatus("down");
        }
        if (selfie.thisTrade.failCount === 5) {
            selfie.message(selfie.thisTrade.partnerID, "trade_too_many_attempts");
            callback("too_many_attempts");
        }
        if (selfie.thisTrade.failCount === 3) {
            selfie.message(selfie.thisTrade.partnerID, "relog");
            callback("relog");
        }
        if (selfie.thisTrade.failCount < 5) {
            if (result === "failed") {
                selfie.message(selfie.thisTrade.partnerID, "trade_fail");
                callback("failed");
            } else {
                selfie.message(selfie.thisTrade.partnerID, "trade_timeout");
                callback("timeout");
            }
        }
    }
    if (result === "complete") {
        if (!selfie.users[thisTrade.partnerID].behavior.hasOwnProperty("number_of_trades")) {
            selfie.users[thisTrade.partnerID].behavior.number_of_trades = 1;
        } else {
            selfie.users[thisTrade.partnerID].behavior.number_of_trades += 1;
        }
        selfie.users[thisTrade.partnerID].behavior.last_trade = time();
        selfie.message(thisTrade.partnerID, "trade_complete");
        socket.appendTrade(thisTrade);
        socket.refreshBackpack();
        selfie.loadBackpack();
        callback("complete");
        selfie.tradeFails = 0;
    }
    if (result === "cancelled") {
        selfie.message(thisTrade.partnerID, "trade_cancel");
        socket.refreshBackpack();
        selfie.loadBackpack();
        callback("cancelled");
    }
};
Sfuminator.prototype.endTradeSession = function (steamid) { //Will jump to next person only if steamid is not given
    if (typeof steamid === "undefined") {
        steamid = selfie.firstInQueue.steamid;
        selfie.jumpToNextQueuePerson();
    }
    selfie.stopAfkCheck(steamid);
    selfie.tradeMetalReserve(null, steamid);
    socket.removeFromQueue(steamid);
    selfie.emit("debug", "endTradeSession: trade session resetted");
};
Sfuminator.prototype.jumpToNextQueuePerson = function () {
    selfie.emit("cancelTrade");
    selfie.resetThisTrade();
    selfie.informSocket("preparing_next_trade");
    selfie.firstInQueue = {};
    selfie.in_trade = false;
    selfie.busy = false;
    selfie.emit("debug", "jumping to NextQueuePerson");
};
Sfuminator.prototype.changeMetal = function () {
    var self = this;
    if (selfie.thisTrade.hisMetal >= selfie.thisTrade.iNeed) {
        if (selfie.thisTrade.hisMetal - 8 <= selfie.thisTrade.iNeed) {
            selfie.thisTrade.metalToChange = selfie.thisTrade.hisMetal - selfie.thisTrade.iNeed;
            var new_change = [];
            var current_change = selfie.thisTrade.change;
            var ttc = selfie.thisTrade.all_metal_change;
            switch (selfie.thisTrade.metalToChange) {
                case 8:
                    new_change = [ttc.reclaimed[0], ttc.reclaimed[1], ttc.scrap[0], ttc.scrap[1]];
                    break;
                case 7:
                    new_change = [ttc.reclaimed[0], ttc.reclaimed[1], ttc.scrap[0]];
                    break;
                case 6:
                    new_change = [ttc.reclaimed[0], ttc.reclaimed[1]];
                    break;
                case 5:
                    new_change = [ttc.reclaimed[0], ttc.scrap[0], ttc.scrap[1]];
                    break;
                case 4:
                    new_change = [ttc.reclaimed[0], ttc.scrap[0]];
                    break;
                case 3:
                    new_change = [ttc.reclaimed[0]];
                    break;
                case 2:
                    new_change = [ttc.scrap[0], ttc.scrap[1]];
                    break;
                case 1:
                    new_change = [ttc.scrap[0]];
                    break;
                case 0:
                    new_change = [];
            }
            var toRemove = elementsMissingFrom(new_change, current_change);
            var toAdd = elementsMissingFrom(current_change, new_change);
            selfie.thisTrade.change = new_change;
            if (selfie.thisTrade.metalToChange > 0) {
                self.emit("debug", "changeMetal: ok, metal change needed (metal to change " + selfie.thisTrade.metalToChange + "), new_change: " + JSON.stringify(new_change));
            } else {
                self.emit("debug", "changeMetal: ok, no metal change is needed");
            }
            if (toAdd.length || toRemove.length) {
                var itemsToAdd = Array();
                var itemsToRemove = Array();
                for (var x in toAdd) {
                    itemsToAdd.push(selfie.backpack.items[toAdd[x]]);
                }
                for (var x in toRemove) {
                    itemsToRemove.push(selfie.backpack.items[toRemove[x]]);
                }
                self.emit("changeMetal", {toAdd: itemsToAdd, toRemove: itemsToRemove});
            }
        } else {
            self.emit("debug", "changeMetal: can't provide change, partner metal is too much");
        }
    }
};
Sfuminator.prototype.normalizeTradeItems = function (item) {
    if (item instanceof Array) {
        var normalizedItems = Array();
        for (var x in item) {
            if (item[x].appid === "440") {
                var normalizedItem = selfie._getRestructuredItem(item[x]);
                if (normalizedItem !== false) {
                    normalizedItems.push(normalizedItem);
                } else {
                    return false;
                }
            } else {
                selfie.emit("error", "normalizeTradeItem: Item " + item[x].name + " is not a tf2 item", 6);
            }
        }
    } else {
        if (item.appid === "440") {
            var normalizedItems = selfie._getRestructuredItem(item);
        } else {
            selfie.emit("error", "normalizeTradeItem: Item " + item.name + " is not a tf2 item", 6);
        }
    }
    return normalizedItems;
};
Sfuminator.prototype._getRestructuredItem = function (item) {
    try {
        var normalizedItem = {
            name: item.name,
            defindex: parseInt(item.app_data.def_index),
            level: parseInt(this._parseLevel(item.type)),
            quality: parseInt(item.app_data.quality),
            flag_cannot_craft: this._parseCraft(item.descriptions),
            flag_cannot_trade: !item.tradable,
            id: item.id
        };
    } catch (e) {
        selfie.emit("error", "Couldnt restructure to normalized item: " + e + " | Original item: " + JSON.stringify(item), 45);
        return false;
    }
    return normalizedItem;
};
Sfuminator.prototype._parseLevel = function (attribute) {
    var strlvl = attribute.replace("Level ", "");
    var lvl = "";
    for (var _x in strlvl) {
        if (strlvl !== " ") {
            lvl += strlvl[_x];
        } else {
            break;
        }
    }
    return parseInt(lvl);
};
Sfuminator.prototype._parseCraft = function (descriptions) {
    if (descriptions instanceof Array) {
        for (var _x in descriptions) {
            if (descriptions[_x].value === '( Not Usable in Crafting )') {
                return true;
            }
        }
    }
    return false;
};
//////////////////////////////////////////////////////////////////////////////// TRADE OFFERS
Sfuminator.prototype.tradeOfferStep = function (tradeOffer, status) {
    selfie.trackEvent(tradeOffer.steamid);
    var steps = {
        "hold": function (tradeOffer) {
            selfie.startAfkCheck(tradeOffer.steamid);
        },
        "active": function (tradeOffer) {
            var steamid = tradeOffer.steamid;
            selfie.message(steamid, "tradeOffer_hello");
            selfie.loadBackpack(function () {
                selfie.loadPersonBackpack(steamid, function (backpack) {
                    if (backpack === "private") {
                        selfie.endTradeOfferSession(steamid, "private");
                        selfie.emit("steamMessage", {steamid: steamid, message: "I can't retrive your inventory, is your profile or backpack set to public? You can check here: http://steamcommunity.com/my/edit/settings"});
                        return;
                    }
                    if (backpack === "error") {
                        selfie.endTradeOfferSession(steamid, "inventory_error");
                        selfie.emit("steamMessage", {steamid: steamid, message: "There was an error retriving your inventory, you might have to check your privacy settings."});
                        return;
                    }
                    var response = selfie.verifyTradeOfferItems(tradeOffer, backpack);
                    if (response.result === "success") {
                        var tradeItems = selfie.parseTradeOfferItems(tradeOffer);
                        if (tradeItems) {
                            selfie.tradeOffer(steamid, tradeItems.myItems, tradeItems.hisItems, "Here you go ;)");
                        } else {
                            selfie.emit("error", "Ohhh shittt! FIX THIS NOW", 1002);
                            selfie.emit("steamMessage", {steamid: steamid, message: "Unknown error #81, cancelling trade offer, please report this to an admin thanks"});
                            selfie.endTradeOfferSession(steamid, "error_81");
                        }
                    } else {
                        if (response.result === "fail") {
                            selfie.emit("steamMessage", {steamid: steamid, message: "Unknown error #82, cancelling trade offer, please report this to an admin thanks"});
                        } else {
                            selfie.message(steamid, response.result);
                        }
                        selfie.endTradeOfferSession(steamid, response.result);
                    }
                });
            });
        },
        "sent": function (tradeOffer) {
            var steamid = tradeOffer.steamid;
            if (selfie.sentTradeOffers.hasOwnProperty(steamid)) {
                tradeOffer.tradeOfferID = selfie.sentTradeOffers[steamid].tradeOfferID;
                selfie.message(steamid, "tradeOffer_sent");
            } else {
                selfie.emit("steamMessage", {steamid: steamid, message: "Unknown error #83, cancelling trade offer, please report this to an admin thanks"});
                selfie.endTradeOfferSession(steamid, "error_83");
            }
        },
        "closed": function (tradeOffer) {
            if (tradeOffer.additional === "cancelled") {
                var delayedCheck = function (tradeOffer) {
                    setTimeout(function () {
                        var steamid = tradeOffer.steamid;
                        if (selfie.sentTradeOffers.hasOwnProperty(steamid)) {
                            selfie.message(steamid, "tradeOffer_cancel");
                            selfie.endTradeOfferSession(steamid, "cancelled");
                        }
                    }, 8000);
                };
                delayedCheck(tradeOffer);
            }
        },
        "accepted": function (tradeOffer) {
            var steamid = tradeOffer.steamid;
            if (!selfie.users[steamid].behavior.hasOwnProperty("number_of_trades")) {
                selfie.users[steamid].behavior.number_of_trades = 1;
            } else {
                selfie.users[steamid].behavior.number_of_trades += 1;
            }
            selfie.users[steamid].behavior.last_trade = time();
            selfie.message(steamid, "trade_complete");
            var appendableTrade = selfie.getAppendableTrade(steamid);
            if (appendableTrade) {
                socket.appendTrade(appendableTrade);
            }
            selfie.endTradeOfferSession(steamid, "accepted");
            socket.refreshBackpack();
            selfie.loadBackpack();
        },
        "declined": function (tradeOffer) {
            var steamid = tradeOffer.steamid;
            selfie.message(steamid, "tradeOffer_declined");
            selfie.endTradeOfferSession(steamid, "declined");
        }
    };
    if (steps.hasOwnProperty(status) && selfie.initStatus.tradeOffers) {
        if (selfie.users[tradeOffer.steamid].hasOwnProperty("steamid")) {
            steps[status](tradeOffer);
        } else {
            selfie.emit("debug", "WARNING: no steamid in the user object, updating structure");
            selfie.users[tradeOffer.steamid].steamid = tradeOffer.steamid;
            steps[status](tradeOffer);
        }
    }
}; //***********************
Sfuminator.prototype.verifyTradeOfferItems = function (tradeOffer, opponentInventory) {
    var response = {result: "fail"};
    var myMetal = selfie.backpack.metal;

    var hisScrapCount = metal_convertToScraps(opponentInventory.metal.getRefinedCount(), opponentInventory.metal.getReclaimedCount(), opponentInventory.metal.getScrapCount());
    var myScrapCount = metal_convertToScraps(myMetal.getRefinedCount(), myMetal.getReclaimedCount(), myMetal.getScrapCount());

    var iNeed = 0;
    for (var x in tradeOffer.items.me) {
        iNeed += tradeOffer.items.me[x].scrapPrice;
    }
    for (var x in tradeOffer.items.them) {
        iNeed -= tradeOffer.items.them[x].scrapPrice;
    }
    if (hisScrapCount < iNeed) {
        response.result = "insufficent_hisMetal";
    } else {
        response.result = "success";
    }

    if (myScrapCount < (-iNeed)) {
        response.result = "insufficent_myMetal";
    }
    for (var x in tradeOffer.items.them) {
        if (!opponentInventory.items.hasOwnProperty(tradeOffer.items.them[x].id)) {
            response.result = "inexistent_hisItem";
        }
    }
    if (response.result === "fail") { //if inalterated resposne
        response.result = "success";
    }

    return response;
}; //***********PORTED************
Sfuminator.prototype.parseTradeOfferItems = function (tradeOffer) {//***********************
    var tradeOfferItems = {};

    var iNeed = 0;
    for (var x in tradeOffer.items.me) {
        iNeed += tradeOffer.items.me[x].scrapPrice;
    }
    for (var x in tradeOffer.items.them) {
        iNeed -= tradeOffer.items.them[x].scrapPrice;
    }

    if (iNeed > 0) {
        var hisMetal = [];
        var hisBackpackMetal = selfie.backpacks[tradeOffer.steamid].metal;
        var refined_pointer = 0;
        var reclaimed_pointer = 0;
        for (var x in hisBackpackMetal.refined) {
            if (iNeed < 9) {
                refined_pointer = x;
                break;
            }
            hisMetal.push(x);
            iNeed -= 9;
        }
        var addedReclaimed = 0;
        var addedScrap = 0;
        for (var x in hisBackpackMetal.reclaimed) {
            if (iNeed < 9) {
                var remainingMetal = ((hisBackpackMetal.getReclaimedCount() - addedReclaimed) * 3) + hisBackpackMetal.getScrapCount();
                if (remainingMetal < iNeed) {
                    break;
                }
            }
            if (iNeed < 3) {
                reclaimed_pointer = x;
                break;
            }
            hisMetal.push(x);
            iNeed -= 3;
            addedReclaimed += 1;
        }
        for (var x in hisBackpackMetal.scrap) {
            if (iNeed < 9) {
                var remainingMetal = hisBackpackMetal.getScrapCount() - addedScrap;
                if (remainingMetal < iNeed) {
                    break;
                }
            }
            if (iNeed < 1) {
                break;
            }
            hisMetal.push(x);
            iNeed -= 1;
            addedScrap += 1;
        }
    }
    if (iNeed > 0) {
        if (refined_pointer > 0) {
            hisMetal.push(refined_pointer);
            iNeed -= 9;
        }
        if (reclaimed_pointer > 0) {
            hisMetal.push(reclaimed_pointer);
            iNeed -= 3;
        }
    }

    var heNeed = 0;
    if (iNeed < 0) {
        heNeed = -iNeed;
    }

    tradeOfferItems.myItems = {
        items: tradeOffer.items.me,
        currency: {metal: {quantity: heNeed}}
    };
    tradeOfferItems.hisItems = {
        items: hisMetal.concat(tradeOffer.items.them)
    };

    return tradeOfferItems;
}; //***********PORTED************
Sfuminator.prototype.getAppendableTrade = function (steamid) {
    var tradeOffer = selfie.tradeOffers[steamid];
    var finalTradeOffer = {partnerID: steamid};
    if (tradeOffer.mode === "hatShopSell") {
        finalTradeOffer.tradeMode = "metal_mine";
        finalTradeOffer.tradeModePlus = "hatShop";
        finalTradeOffer.iNeed = tradeOffer.items;
    } else {
        finalTradeOffer.tradeMode = "hatShop";
        finalTradeOffer.tradeModePlus = "hatShop";
        finalTradeOffer.myItems = tradeOffer.items;
    }
    return finalTradeOffer;
};
Sfuminator.prototype.tradeOffer = function (partnerID, myItems, hisItems, message, secure) {
    selfie.emit("debug", "tradeOffer: generating trade offer for " + partnerID);
    if (selfie.sentTradeOffers.hasOwnProperty(partnerID)) {
        if (secure) {
            selfie.emit("error", "Can't send trade offer to " + partnerID + " there is already a pending offer waiting to be accepted/declined", 31);
            return;
        } else {
            selfie.emit("debug", "There is already a pending offer for " + partnerID + ", will drop the current offer and create the new one");
            selfie.dropTradeOffer(partnerID);
            selfie.tradeOffer(partnerID, myItems, hisItems, message);
            return;
        }
    }
    if (!selfie.users.hasOwnProperty(partnerID)) {
        selfie.emit("error", "User " + partnerID + " not found, will create it and retry");
        selfie.updateUser(partnerID);
        selfie.tradeOffer(partnerID, message, myItems, hisItems);
        return;
    }
    selfie.users[partnerID].tradeOffer = {partnerSteamId: partnerID, itemsFromMe: [], itemsFromThem: [], message: message};
    selfie.users[partnerID].tradeOffer_flags = {itemsFromMe: false, itemsFromThem: false, pendingTradeOffer: true};
    if (myItems === null) {
        selfie.users[partnerID].tradeOffer.itemsFromMe = [];
        selfie.users[partnerID].tradeOffer_flags.itemsFromMe = true;
    } else {
        if (myItems.hasOwnProperty("currency")) {
            if (myItems.currency.hasOwnProperty("metal")) {
                var myItemsMetal = myItems.currency.metal;
                if (myItemsMetal.hasOwnProperty("quantity") && !isNaN(myItemsMetal.quantity)) {
                    var org_quantity = metal_convertToOrganic(myItemsMetal.quantity);
                    var reserveMetalForPartner = function (partnerID) {
                        selfie.reserveMetal(partnerID, org_quantity.refined, org_quantity.reclaimed, org_quantity.scrap, true, function (result) {
                            if (result) {
                                for (var x in metals) {
                                    for (var y in selfie.backpack.metal[metals[x]]) {
                                        if (selfie.backpack.metal[metals[x]][y].reserved && (selfie.backpack.metal[metals[x]][y].to === partnerID)) {
                                            selfie.users[partnerID].tradeOffer.itemsFromMe.push(trade_offer_object(y));
                                        }
                                    }
                                }
                                selfie.users[partnerID].tradeOffer_flags.itemsFromMe = true;
                                selfie.triggerTradeOffer(partnerID);
                            } else {
                                selfie.emit("error", "tradeOffer: couldn't reserve metal for " + partnerID + " unable to generate trade offer", 30);
                            }
                        });
                    };
                    reserveMetalForPartner(partnerID);
                } else {
                    selfie.emit("error", "tradeOffer: unspecified metal quantity", 29);
                    return;
                }
            }
            if (myItems.currency.hasOwnProperty("key")) {
                var myItemsKey = myItems.currency.key;
                if (myItemsKey.hasOwnProperty("quantity") && !isNaN(myItemsKey.quantity)) {
                    var quantity = parseInt(myItemsKey.quantity);
                    var myBackpackItems = selfie.backpack.items;
                    var selectedKeys = 0;
                    for (var x in myBackpackItems) {
                        if ((myBackpackItems[x].defindex === 5021) && (!myBackpackItems[x].flag_cannot_craft)) {
                            selfie.users[partnerID].tradeOffer.itemsFromMe.push(trade_offer_object(myBackpackItems[x].id));
                            selectedKeys += 1;
                            if (selectedKeys === quantity) {
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (myItems.hasOwnProperty("items")) {
            if (myItems.items.length > 0) {
                for (var x in myItems.items) {
                    if (myItems.items[x].hasOwnProperty("id")) {
                        selfie.users[partnerID].tradeOffer.itemsFromMe.push(trade_offer_object(myItems.items[x].id));
                    } else if (!isNaN(myItems.items[x])) {
                        selfie.users[partnerID].tradeOffer.itemsFromMe.push(trade_offer_object(myItems.items[x]));
                    }
                }
            }
        }
        if (!myItems.currency.hasOwnProperty("metal")) { //If not reserving
            selfie.users[partnerID].tradeOffer_flags.itemsFromMe = true;
        }
    }

    if (hisItems === null) {
        selfie.users[partnerID].tradeOffer.itemsFromThem = [];
        selfie.users[partnerID].tradeOffer_flags.itemsFromThem = true;
    } else {
        /*if (hisItems.hasOwnProperty("currency")) {
         if (hisItems.currency.hasOwnProperty("metal")) {
         var hisItemsMetal = hisItems.currency.metal;
         if (hisItemsMetal.hasOwnProperty("quantity") && !isNaN(hisItemsMetal.quantity)) {
         var org_quantity = metal_convertToOrganic(hisItemsMetal.quantity);
         
         for (var x in metals) {
         for (var y in selfie.backpack.metal[metals[x]]) {
         if (selfie.backpack.metal[metals[x]][y].reserved && (selfie.backpack.metal[metals[x]][y].to === partnerID)) {
         selfie.users[partnerID].tradeOffer.itemsFromThem.push(trade_offer_object(y));
         }
         }
         }
         selfie.users[partnerID].tradeOffer_flags.itemsFromThem = true;
         selfie.triggerTradeOffer(partnerID);
         
         } else {
         selfie.emit("error", "tradeOffer: unspecified metal quantity", 29);
         return;
         }
         }
         if (hisItems.currency.hasOwnProperty("key")) {
         var hisItemsKey = hisItems.currency.key;
         if (hisItemsKey.hasOwnProperty("quantity") && !isNaN(hisItemsKey.quantity)) {
         var quantity = parseInt(hisItemsKey.quantity);
         var hisBackpackItems = selfie.backpacks[partnerID].items;
         var selectedKeys = 0;
         for (var x in hisBackpackItems) {
         if ((hisBackpackItems[x].defindex === 5021) && (!hisBackpackItems[x].flag_cannot_craft)) {
         selfie.users[partnerID].tradeOffer.itemsFromThem.push(trade_offer_object(hisBackpackItems[x].id));
         selectedKeys += 1;
         if (selectedKeys === quantity) {
         break;
         }
         }
         }
         }
         }
         }*/
        if (hisItems.hasOwnProperty("items")) {
            if (hisItems.items.length > 0) {
                for (var x in hisItems.items) {
                    if (hisItems.items[x].hasOwnProperty("id")) {
                        selfie.users[partnerID].tradeOffer.itemsFromThem.push(trade_offer_object(hisItems.items[x].id));
                    } else if (!isNaN(hisItems.items[x])) {
                        selfie.users[partnerID].tradeOffer.itemsFromThem.push(trade_offer_object(hisItems.items[x]));
                    }
                }
            }
        }
        selfie.users[partnerID].tradeOffer_flags.itemsFromThem = true;
    }
    selfie.triggerTradeOffer(partnerID);
}; //***********************
Sfuminator.prototype.endTradeOfferSession = function (steamid, statusinfo) {
    selfie.stopAfkCheck(steamid);
    socket.setTradeOfferStatus(steamid, "closed:" + statusinfo);
    selfie.dropTradeOffer(steamid, statusinfo);
};
Sfuminator.prototype.triggerTradeOffer = function (steamid) {
    selfie.emit("debug", "Triggering trade offer to " + steamid + "\n" + JSON.stringify(selfie.users[steamid].tradeOffer_flags));
    if (selfie.users[steamid].hasOwnProperty("tradeOffer_flags")
            && selfie.users[steamid].tradeOffer_flags.pendingTradeOffer
            && selfie.users[steamid].tradeOffer_flags.itemsFromMe
            && selfie.users[steamid].tradeOffer_flags.itemsFromThem)
    {
        selfie.emit("sendTradeOffer", selfie.users[steamid].tradeOffer);
        selfie.users[steamid].tradeOffer_flags = {itemsFromMe: false, itemsFromThem: false, pendingTradeOffer: false};
    }
};
Sfuminator.prototype.appendTradeOffer = function (partnerID, offerid) {
    selfie.emit("debug", "appendTradeOffer: appending trade offer for " + partnerID);
    selfie.sentTradeOffers[partnerID] = {partnerID: partnerID, tradeOfferID: offerid, when: time()};
    /*for (var x in selfie.tradeOffers) {
     if (selfie.tradeOffers[x].steamid === partnerID) {
     socket.setTradeOfferStatus(partnerID, "sent:" + offerid);
     break;
     }
     }*/ //In case of tradeOffer printed out from server as list
    if (selfie.tradeOffers.hasOwnProperty(partnerID)) {
        socket.setTradeOfferStatus(partnerID, "sent:" + offerid);
    }//In case of tradeOffer printed out from server as indexed list
}; //***********************
Sfuminator.prototype.dropTradeOffer = function (partnerID, statusinfo) {
    selfie.emit("debug", "dropTradeOffer: dropping offer for " + partnerID);
    if (selfie.sentTradeOffers.hasOwnProperty(partnerID) && selfie.sentTradeOffers[partnerID].hasOwnProperty("tradeOfferID") && (statusinfo !== "accepted")) {
        selfie.emit("cancelTradeOffer", selfie.sentTradeOffers[partnerID].tradeOfferID);
    }
    selfie.tradeMetalReserve(null, partnerID);
    if (selfie.sentTradeOffers.hasOwnProperty(partnerID)) {
        delete selfie.sentTradeOffers[partnerID];
    }
};
function trade_offer_object(id) {
    return {
        appid: 440,
        contextid: 2,
        amount: 1,
        assetid: id.toString()
    };
}
//////////////////////////////////////////////////////////////////////////////// METAL RESERVATION
Sfuminator.prototype.tradeMetalReserve = function (_toReserve, _toCancel) {
    var self = this;
    var proceed = true;
    var toReserve = [], toCancel = [];
    if (!(_toReserve instanceof Array) && (_toReserve !== null)) {
        if (typeof _toReserve === "string") {
            toReserve.push(_toReserve);
        } else {
            proceed = false;
        }
    } else {
        toReserve = _toReserve;
    }
    if (!(_toCancel instanceof Array) && (_toCancel !== null)) {
        if (typeof _toCancel === "string") {
            toCancel.push(_toCancel);
        } else {
            proceed = false;
        }
    } else {
        toCancel = _toCancel;
    }
    if (proceed) {
        if (toCancel) {
            if (toCancel[0] === "all") {
                self.emit("debug", "Cancelling all metal reservations");
                for (var x in metals) {
                    for (var y in selfie.backpack.metal[metals[x]]) {
                        selfie.backpack.metal[metals[x]][y].reserved = false;
                        selfie.backpack.metal[metals[x]][y].to = null;
                    }
                }
                for (var x in selfie.users) {
                    selfie.users[x].reserving = false;
                    selfie.users[x].metal_reservation = false;
                }
            } else {
                for (var x in toCancel) {
                    thisSteamID = toCancel[x];
                    thisName = selfie.users[thisSteamID].personaname;
                    self.emit("debug", "Cancelling user " + thisName + " metal reservation (steamid:" + thisSteamID + ")");
                    for (var y in metals) {
                        for (var x in selfie.backpack.metal[metals[y]]) {
                            if (selfie.backpack.metal[metals[y]][x].reserved && (selfie.backpack.metal[metals[y]][x].to === thisSteamID)) {
                                selfie.backpack.metal[metals[y]][x].reserved = false;
                                selfie.backpack.metal[metals[y]][x].to = null;
                            }
                        }
                    }
                    selfie.users[thisSteamID].metal_reservation = false;
                }
            }
        }
        if (toReserve) {
            for (var x in toReserve) {
                var thisSteamID = toReserve[x];
                var thisName = selfie.users[thisSteamID].personaname;
                if (!selfie.users[thisSteamID].metal_reservation) {
                    if (!selfie.users[thisSteamID].reserving) {
                        if (selfie.users[thisSteamID].in_queue) {
                            var doublecheck = true;
                            for (var y in metals) {
                                for (var x in selfie.backpack.metal[metals[y]]) {
                                    if (selfie.backpack.metal[metals[y]][x].reserved && (selfie.backpack.metal[metals[y]][x].to === thisSteamID)) {
                                        doublecheck = false;
                                        break;
                                    }
                                }
                            }
                            if (doublecheck === true) {
                                self.emit("debug", "User " + thisName + " has no metal reservation, reservating... (steamid:" + thisSteamID + ")");
                                var tradeInfo = selfie.users[thisSteamID].queue;
                                var metalToReserve = {};
                                if (tradeInfo.tradeMode === "hatShop" && tradeInfo.tradeModePlus === "hatShop") { //He is buying, need to reserve change
                                    metalToReserve.refined = 0;
                                    metalToReserve.reclaimed = 2;
                                    metalToReserve.scrap = 2;
                                }
                                if (tradeInfo.tradeMode === "hatExchange" && tradeInfo.tradeModePlus === "hatExchange") {//Hat exchange, need to reserve metal change
                                    metalToReserve.refined = 0;
                                    metalToReserve.reclaimed = 2;
                                    metalToReserve.scrap = 2;
                                }
                                if (tradeInfo.tradeMode === "metal_mine" && tradeInfo.tradeModePlus === "hatShop") {//He is selling, need to reserve precise metal
                                    var totalScrapPrice = 0;
                                    for (var x in tradeInfo.items) {
                                        totalScrapPrice += tradeInfo.items[x].scrapPrice;
                                    }
                                    metalToReserve = metal_convertToOrganic(totalScrapPrice);
                                }
                                selfie.reserveMetal(thisSteamID, metalToReserve.refined, metalToReserve.reclaimed, metalToReserve.scrap, false);
                            } else {
                                self.emit("error", "Double check has spotted an error, there is already some metal reserved for " + thisSteamID + ", will try to fix problem...", x);
                                selfie.tradeMetalReserve(null, thisSteamID);
                                selfie.tradeMetalReserve(thisSteamID, null);
                            }
                        } else {
                            self.emit("message", "WARNING: User " + thisName + " is not in the queue, can't reserve items");
                        }
                    } else {
                        self.emit("message", "WARNING: User " + thisName + " has a reservation being processed, doing nothing (steamid: " + thisSteamID + ")");
                    }
                } else {
                    self.emit("message", "WARNING: User " + thisName + " has already a metal reservation, doing nothing (steamid:" + thisSteamID + ")");
                }
            }
        }
    } else {
        self.emit("error", "tradeMetalReserve: wrong variable type, string steamid or steamids array is needed", 16);
    }
}; //list of steamids or single string id
Sfuminator.prototype.reserveMetal = function (holderID, total_refineds, total_reclaimeds, total_scraps, forced, callback) {
    var self = this;
    var refineds_to_reserve = [];
    selfie.users[holderID].reserving = true;
    self.emit("debug", "reserveMetal: got reservation request");
    if (selfie.users[holderID].metal_reservation) {
        self.emit("error", "User " + holderID + " has already a metal reservation, can't reserve", 19);
        if (callback) {
            callback(false);
        }
        return;
    }
    if (selfie.reserving) {
        self.emit("debug", "reserveMetal: metal reservation added in the queue (|||" + total_refineds + ", ||" + total_reclaimeds + ", |" + total_scraps + " @" + holderID + ")");
        selfie.reserveQueue.push({holderID: holderID, total_refineds: total_refineds, total_reclaimeds: total_reclaimeds, total_scraps: total_scraps, forced: forced});
    } else {
        selfie.tradeMetalReserve(null, holderID); //Safe precaution
        selfie.reserving = true;
        var metal = selfie.backpack.metal;
        var original_refinedList = metal.refined;
        var counter = 0;
        for (var x in original_refinedList) {
            if (counter === total_refineds) {
                break;
            }
            if (!original_refinedList[x].reserved) {//if not reserved
                refineds_to_reserve.push(x);
                selfie.backpack.metal.refined[x].reserved = true;
                counter += 1;
            }
        }
        if (counter < total_refineds) {
            self.emit("error", "reserveMetal: when reserving, not enough metal in my inventory!", 1);
            return;
        }

        lowTierMetalReserve(total_reclaimeds, total_scraps, {reclaimed: [], scrap: []}, function (low_tier_metal_to_reserve) {
            var metal_to_reserve = {refined: refineds_to_reserve, reclaimed: low_tier_metal_to_reserve.reclaimed, scrap: low_tier_metal_to_reserve.scrap};
            if (forced || selfie.users[holderID].in_queue) {
                if (refineds_to_reserve.length === total_refineds && low_tier_metal_to_reserve.reclaimed.length === total_reclaimeds && low_tier_metal_to_reserve.scrap.length === total_scraps) {
                    for (var x in metals) {
                        for (var y in metal_to_reserve[metals[x]]) {
                            try {
                                selfie.backpack.metal[metals[x]][metal_to_reserve[metals[x]][y]].reserved = true;
                                selfie.backpack.metal[metals[x]][metal_to_reserve[metals[x]][y]].to = holderID;
                            } catch (e) {
                                selfie.emit("error", "CRITICAL! Couldn't reserve metal (" + metals[x] + "): " + metal_to_reserve[metals[x]][y] + ", object seems undefined \n more info: " + e, 1000);
                                process.exit(1);
                            }
                        }
                    }
                    selfie.users[holderID].metal_reservation = true;
                    self.emit("debug", "reserveMetal: metal reserved! (|||" + total_refineds + ", ||" + total_reclaimeds + ", |" + total_scraps + " @" + holderID + ")");
                    self.emit("metalReservation", holderID);
                } else {
                    selfie.emit("error", "reserveMetal: Something went wrong with the reservation for " +
                            holderID + ": (|||" + total_refineds + ",||" + total_reclaimeds + ",|" + total_scraps + ")->(|||" + refineds_to_reserve.length + ",||" + low_tier_metal_to_reserve.reclaimed.length + ",|" + low_tier_metal_to_reserve.scrap.length + ")", 2);
                    //Be sure to cancel previus metal reservations
                    try {
                        for (var x in metals) {
                            for (var y in metal_to_reserve[metals[x]]) {
                                selfie.backpack.metal[metals[x]][metal_to_reserve[metals[x]][y]].reserved = false;
                                selfie.backpack.metal[metals[x]][metal_to_reserve[metals[x]][y]].to = null;
                            }
                        }
                    } catch (e) {
                        selfie.emit("error", "reserveMetal: something went wrong when cancelling residue reservation: " + e, 16);
                    }
                    selfie.users[holderID].metal_reservation = false;
                }
            } else {
                self.emit("message", "WARNING: user " + selfie.users[holderID].personaname + " is no more in queue skipped metal reservation. (" + holderID + ")");
                //Be sure to cancel previus metal reservations
                try {
                    for (var x in metals) {
                        for (var y in metal_to_reserve[metals[x]]) {
                            selfie.backpack.metal[metals[x]][metal_to_reserve[metals[x]][y]].reserved = false;
                            selfie.backpack.metal[metals[x]][metal_to_reserve[metals[x]][y]].to = null;
                        }
                    }
                } catch (e) {
                    selfie.emit("error", "reserveMetal: something went wrong when cancelling residue reservation: " + e, 16);
                }
                selfie.users[holderID].metal_reservation = false;
            }

            //<- Very important ->
            selfie.reserving = false;
            selfie.users[holderID].reserving = false;
            selfie.emit("next_reserveQueue");
            if (callback) {
                callback(true);
            }
        });
    }
}; //if forced -> no check if user still in queue on actual reserving
Sfuminator.prototype.craftMetal = function (metal_instructions, callback) {
    //metal_instructions object:
    //{
    //  action: string// smelt - craft
    //  refined: int, //amount
    //  reclaimed: int, //amount
    //  additional: {}
    //}
    if (selfie.crafting) {
        selfie.emit("message", "WARNING: Got craftMetal request during crafting, this should not happen! Holding request...");
        selfie.craftQueue.push(metal_instructions);
    } else {
        selfie.crafting = true;
        selfie.emit("debug2", "craftMetal: metal_instructions: " + JSON.stringify(metal_instructions));
        var crafting_recipe = [];
        var result = {};
        if (metal_instructions.action === "craft") {
            result = get_metal_to_craft(metal_instructions);
            crafting_recipe = result.recipe;
        }
        if (metal_instructions.action === "smelt") {
            result = get_metal_to_smelt(metal_instructions);
            crafting_recipe = result.recipe;
        }
        craftRecipe(crafting_recipe, function (result) {
            if (result) {
                if (result.queued_smelting) {
                    var second_result = get_metal_to_smelt(result.metal_instructions);
                    craftRecipe(second_result.recipe, function () {
                        selfie.crafting = false;
                        selfie.emit("next_craftQueue");
                        if (callback) {
                            callback(true);
                        }
                        return;
                    });
                } else {
                    selfie.crafting = false;
                    selfie.emit("next_craftQueue");
                    if (callback) {
                        callback(true);
                    }
                    return;
                }
            } else {
                selfie.crafting = false;
                selfie.emit("next_craftQueue");
                if (callback) {
                    callback(false);
                }
                return;
            }
        });
    }
};
function lowTierMetalReserve(total_reclaimeds, total_scraps, metal_to_reserve, callback) {
    var metal_instructions = {action: "smelt", refined: 0, reclaimed: 0};
    var metal = selfie.backpack.metal;
    var original_reclaimedList = metal.reclaimed;
    var original_scrapList = metal.scrap;
    var reserved_reclaimeds = 0;
    var reserved_scraps = 0;
    var need_smelt = false;
    for (var x in original_reclaimedList) {
        if (reserved_reclaimeds === total_reclaimeds) {
            break;
        }
        if (!original_reclaimedList[x].reserved) {
            metal_to_reserve.reclaimed.push(x);
            selfie.backpack.metal.reclaimed[x].reserved = true;
            reserved_reclaimeds += 1;
        }
    }
    if (reserved_reclaimeds < total_reclaimeds) {
        selfie.emit("debug", "lowTierMetalReserve: Not enough reclaimeds available, will proceed with smelting");
        need_smelt = true;
        metal_instructions.refined = (parseInt((total_reclaimeds - reserved_reclaimeds) / 3) + 1);
    }

    for (var x in original_scrapList) {
        if (reserved_scraps === total_scraps) {
            break;
        }
        if (!original_scrapList[x].reserved) {
            metal_to_reserve.scrap.push(x);
            selfie.backpack.metal.scrap[x].reserved = true;
            reserved_scraps += 1;
        }
    }
    if (reserved_scraps < total_scraps) {
        selfie.emit("debug", "lowTierMetalReserve: Not enough scraps available, will proceed with smelting");
        need_smelt = true;
        metal_instructions.reclaimed = (parseInt((total_scraps - reserved_scraps) / 3) + 1);
    }
    selfie.emit("debug2", "lowTierMetalReserve: need_smelt: " + need_smelt + " metal_to_reserve: " + JSON.stringify(metal_to_reserve));
    if (need_smelt) {
        selfie.craftMetal(metal_instructions, function () {
            lowTierMetalReserve(total_reclaimeds - reserved_reclaimeds, total_scraps - reserved_scraps, metal_to_reserve, callback);
        });
    } else {
        callback(metal_to_reserve);
    }
}
function get_metal_to_craft(metal_to_craft) {
    var backpack_scraps = selfie.backpack.metal.scrap;
    var backpack_reclaimeds = selfie.backpack.metal.reclaimed;
    var total_refineds = metal_to_craft.refined;
    var total_reclaimeds = metal_to_craft.reclaimed;
    var recipe_counter = 0;
    var crafting_recipe = [];
    var temp_single_recipe = [];
    if (total_reclaimeds > 0) {
        for (var x in backpack_scraps) {
            if (recipe_counter === total_reclaimeds) {
                break;
            }
            if (!backpack_scraps[x].reserved) {
                temp_single_recipe.push(x);
            }
            if (temp_single_recipe.length === 3) {
                crafting_recipe.push(temp_single_recipe);
                recipe_counter += 1;
                temp_single_recipe = [];
            }
        }
        if (recipe_counter < total_reclaimeds) {
            selfie.emit("debug", "WARNING: no more scraps available, some reclaimeds were not crafted");
        }
    }
    recipe_counter = 0;
    var temp_single_recipe = [];
    if (total_refineds > 0) {
        for (var x in backpack_reclaimeds) {
            if (recipe_counter === total_refineds) {
                break;
            }
            if (!backpack_reclaimeds[x].reserved) {
                temp_single_recipe.push(x);
            }
            if (temp_single_recipe.length === 3) {
                crafting_recipe.push(temp_single_recipe);
                recipe_counter += 1;
                temp_single_recipe = [];
            }
        }
        if (recipe_counter < total_refineds) {
            selfie.emit("debug", "WARNING: no more reclaimeds available, some refineds were not crafted");
        }
    }
    return {recipe: crafting_recipe};
    ;
}
function get_metal_to_smelt(metal_to_smelt) {
    var backpack_refineds = selfie.backpack.metal.refined;
    var backpack_reclaimeds = selfie.backpack.metal.reclaimed;
    var total_refineds = metal_to_smelt.refined;
    var total_reclaimeds = metal_to_smelt.reclaimed;
    var crafting_recipe = [];
    var queued_smelting = false;
    var refineds_to_smelt = 0;
    var reclaimeds_to_smelt = 0;
    if (total_reclaimeds > 0) {
        for (var x in backpack_reclaimeds) {
            if (reclaimeds_to_smelt === total_reclaimeds) {
                break;
            }
            if (!backpack_reclaimeds[x].reserved) {
                crafting_recipe.push([x]);
                reclaimeds_to_smelt += 1;
            }
        }
        if (reclaimeds_to_smelt < total_reclaimeds) {
            selfie.emit("debug2", "No more reclaimeds available, going to smelt an additional refined");
            queued_smelting = true;
            total_refineds += 1 + parseInt((total_reclaimeds - reclaimeds_to_smelt - 0.1) / 3);
        } else {
            queued_smelting = false;
        }
    }
    refineds_to_smelt = 0;
    if (total_refineds > 0) {
        for (var x in backpack_refineds) {
            if (refineds_to_smelt === total_refineds) {
                break;
            }
            if (!backpack_refineds[x].reserved) {
                crafting_recipe.push([x]);
                refineds_to_smelt += 1;
            }
        }
        if (refineds_to_smelt < total_refineds) {
            selfie.emit("debug", "WARNING: no more refineds available, some were not smelted");
        }
    }
    return {recipe: crafting_recipe, queued_smelting: queued_smelting,
        metal_instructions: {action: "smelt", refined: 0, reclaimed: total_reclaimeds - reclaimeds_to_smelt}};
}
function craftRecipe(recipe, callback) {
    if (recipe.length > 0) {
        for (var x in recipe) {
            tf2Craft(recipe[x]);
        }
        var refreshCounter = 1;
        var oneid = recipe[x];
        var refreshBackpack = function (oldid) {
            captureMetalChange(oldid, function (result) {
                if (result) {
                    callback(true);
                    return;
                } else {
                    setTimeout(function () {
                        refreshCounter += 1;
                        if (refreshCounter < BACKPACKREFRESHLIMIT) {
                            refreshBackpack(oldid);
                        } else {
                            selfie.emit("message", "WARNING: too many same backpack, stop checking");
                            callback(true);
                            return;
                        }
                    }, (2000 * refreshCounter));
                }
            });
        };
        refreshBackpack(oneid);
    } else {
        selfie.emit("error", "craftRecipe: Empty recipe given", 3);
        callback(false);
        return;
    }
}
function tf2Craft(recipe) {
    steam.gamesPlayed([440]);
    var item_names = "[";
    for (var x in recipe) {
        item_names += selfie.backpack.items[recipe[x]].name + ",";
    }
    item_names = item_names.slice(0, item_names.length - 1) + "]";
    selfie.emit("debug", "tf2Craft: " + JSON.stringify(recipe) + " -> " + item_names);
    tf2.craftItems(recipe);
}
function captureMetalChange(oldid, callback) {
    selfie.loadBackpack(function () {
        if (selfie.backpack.items.hasOwnProperty(oldid)) {
            callback(false);
        } else {
            callback(true);
        }
    });
}
////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////// SFUMINATOR OBJECT HANDLING
/*Sfuminator.prototype.loadAPIBackpack = function(callback) {
 var self = this;
 self.initStatus.backpack = false;
 self.emit("debug", "Fetching backpack...");
 /*api.getPlayerItems(mySteamID, function(raw_backpack) {
 if (raw_backpack.hasOwnProperty("result")) {
 var items = raw_backpack.result.items;
 selfie.backpack.num_backpack_slots = raw_backpack.result.num_backpack_slots;
 var changed = selfie.injectBackpack(items, true);
 self.initStatus.backpack = true;
 if (callback) {
 callback(changed);
 }
 return;
 } else {
 self.emit("error", "loadBackpack: Backpack response is empty!", 9);
 if (callback) {
 callback(null);
 }
 }
 });
 self.initStatus.backpack = true;
 callback(true);
 };*/
Sfuminator.prototype.startAutoSave = function () {
    var self = this;
    self.interval.autosave = {time: 1000 * 60 * 5};
    var autoSaveInterval = setInterval(function () {
        self.emit("debug", "AutoSave: saving...");
        try {
            var textToSave = JSON.stringify(selfie.users, null, "\t");
            fs.writeFileSync(usersFileName, textToSave);
        } catch (e) {
            self.emit("error", "autoSave: when autosaving users: " + e, 7);
        }
        try {
            for (var x in selfie.logs) {
                var thisFileName = getNiceDateTime(true, new Date()) + "_" + x + "_" + mySteamID + "_logs.txt";
                var textToSave = selfie.logs[x];
                try {
                    var oldLogs = fs.readFileSync(x + "/" + thisFileName);
                    fs.writeFileSync(x + "/" + thisFileName, textToSave + oldLogs);
                    selfie.logs[x] = "";
                } catch (e) {
                    self.emit("debug", "autoSave: " + thisFileName + " doesn't exist, creating a new one.");
                    fs.writeFileSync(x + "/" + thisFileName, textToSave);
                }
            }
        } catch (e) {
            self.emit("error", "autoSave: when autosaving logs: " + e, 8);
        }
    }, self.interval.autosave.time);
    self.interval.autosave.obj = autoSaveInterval;
};
Sfuminator.prototype.loadBackpack = function (callback) {
    if (!selfie.loadingBackpack) {
        selfie.loadingBackpack = true;
        selfie.emit("debug", "loadBackpack: Updating backpack...");
        api.getPlayerItems(mySteamID, function (response) {
            if (response.hasOwnProperty("result")) {
                var inventory = response.result.items;
                selfie.handleInventoryInjection(inventory, callback, true);
                setTimeout(function () {
                    selfie.loadingBackpack = false;
                }, selfie.loadingBackpackInterval);
            } else {
                selfie.emit("debug", "WARNING: wasn't able to load api backpack, retrying with steam inventory");
                selfie.loadBackpack_SteamInventory(callback);
            }
        });
    } else {
        selfie.emit("debug", "loadBackpack: got another request too early, skipping");
        if (callback) {
            callback(true);
        }
    }
};
Sfuminator.prototype.loadBackpack_SteamInventory = function (callback) {
    if (!selfie.loadingBackpack) {
        selfie.loadingBackpack = true;
        selfie.emit("debug", "loadBackpack: Updating backpack...");
        steam.gamesPlayed([]);
        steam.gamesPlayed([440]);
        steamTrade.loadInventory(440, 2, function (inventory) {
            selfie.handleInventoryInjection(inventory, callback);
            setTimeout(function () {
                selfie.loadingBackpack = false;
            }, selfie.loadingBackpackInterval);
        });
    } else {
        selfie.emit("debug", "loadBackpack: got another request too early, skipping");
        if (callback) {
            callback(true);
        }
    }
};
Sfuminator.prototype.handleInventoryInjection = function (inventory, callback, normalized) {
    var injection = selfie.injectBackpack(inventory, normalized);
    if (injection.result === "success") {
        selfie.emit("debug", "loadBackpack: Success! " + (injection.changed ? " Loaded new backpack" : " Loaded backpack, still the same."));
    } else {
        selfie.emit("debug", "loadBackpack: " + injection.result + ", " + injection.error);
        selfie.emit("error", "Wasn't able to inject backpack", 44);
    }
    if (callback) {
        callback(true);
    }
};
Sfuminator.prototype.loadPersonBackpack = function (steamid, callback) {
    steamTrade.loadPersonInventory(steamid, function (inventory) {
        if (inventory === "error" || inventory === "private") {
            callback(inventory);
        } else {
            var injection = selfie.injectPersonBackpack(steamid, inventory);
            if (injection.result === "success") {
                callback(selfie.backpacks[steamid]);
            } else {
                selfie.loadPersonBackpack(steamid, callback);
            }
        }
    });
}; //***********************
Sfuminator.prototype.dropPersonBackapck = function (steamid) {
    if (selfie.backpacks.hasOwnProperty(steamid)) {
        delete selfie.backpacks[steamid];
        selfie.emit("debug", "Dropped " + steamid + " backpack");
    }
}; //***********************
Sfuminator.prototype.injectPersonBackpack = function (steamid, items, normalized) {
    //INJECT ITEMS
    var self = this;
    if (!selfie.backpacks.hasOwnProperty(steamid)) {
        selfie.backpacks[steamid] = {
            metal: {
                refined: [],
                reclaimed: [],
                scrap: []
            }, // (refined[id:{reserved: boolean}], reclaimed[], scrap[], getRefinedCount() ...etc)
            items: [], // Raw item list paro paro steamapi
            num_backpack_slots: 0
        };
    }
    selfie.backpacks[steamid].num_backpack_filled = items.length;
    var finalItems = {};
    var refined_list = [], reclaimed_list = [], scrap_list = [];
    var normalized_items;
    if (normalized) {
        normalized_items = items;
    } else {
        normalized_items = self.normalizeTradeItems(items);
        if (normalized_items === false) {
            return {result: "fail", error: "normalize"};
        }
    }
    var oldIDs = [];
    var newIDs = [];
    for (var x in normalized_items) {
        newIDs.push(normalized_items[x].id);
    }
    for (var x in selfie.backpacks[steamid].items) {
        oldIDs.push(selfie.backpacks[steamid].items[x].id);
    }

    if (!arrayCompare(oldIDs, newIDs)) {
        for (var x in normalized_items) {
            if (normalized_items[x].defindex === 5002) {
                refined_list.push(normalized_items[x].id);
            }
            if (normalized_items[x].defindex === 5001) {
                reclaimed_list.push(normalized_items[x].id);
            }
            if (normalized_items[x].defindex === 5000) {
                scrap_list.push(normalized_items[x].id);
            }
            finalItems[normalized_items[x].id] = {
                name: normalized_items[x].name,
                defindex: normalized_items[x].defindex,
                level: normalized_items[x].level,
                quality: normalized_items[x].quality,
                flag_cannot_trade: normalized_items[x].flag_cannot_trade,
                flag_cannot_craft: normalized_items[x].flag_cannot_craft,
                id: normalized_items[x].id,
                non_standard_item: items[x]
            };
        }
        selfie.backpacks[steamid].items = finalItems;
        /// INJECT ITEMS COUNT
        selfie.backpacks[steamid].itemsCount = {};
        for (var x in selfie.backpacks[steamid].items) {
            if (!selfie.backpacks[steamid].itemsCount.hasOwnProperty(selfie.backpacks[steamid].items[x].defindex)) {
                selfie.backpacks[steamid].itemsCount[selfie.backpacks[steamid].items[x].defindex] = 1;
            } else {
                selfie.backpacks[steamid].itemsCount[selfie.backpacks[steamid].items[x].defindex] += 1;
            }
        }

        /// INJECT METAL
        if (selfie.backpacks[steamid].hasOwnProperty("metal")) {
            old_metal = JSON.parse(JSON.stringify(selfie.backpacks[steamid].metal));
        }
        selfie.backpacks[steamid].metal.refined = {};
        selfie.backpacks[steamid].metal.reclaimed = {};
        selfie.backpacks[steamid].metal.scrap = {};
        for (var x in refined_list) {
            if (old_metal.refined.hasOwnProperty(refined_list[x])) {
                selfie.backpacks[steamid].metal.refined[refined_list[x]] = {reserved: old_metal.refined[refined_list[x]].reserved, to: old_metal.refined[refined_list[x]].to};
            } else {
                selfie.backpacks[steamid].metal.refined[refined_list[x]] = {reserved: false, to: null};
            }
        }
        for (var x in reclaimed_list) {
            if (old_metal.reclaimed.hasOwnProperty(reclaimed_list[x])) {
                selfie.backpacks[steamid].metal.reclaimed[reclaimed_list[x]] = {reserved: old_metal.reclaimed[reclaimed_list[x]].reserved, to: old_metal.reclaimed[reclaimed_list[x]].to};
            } else {
                selfie.backpacks[steamid].metal.reclaimed[reclaimed_list[x]] = {reserved: false, to: null};
            }
        }
        for (var x in scrap_list) {
            if (old_metal.scrap.hasOwnProperty(scrap_list[x])) {
                selfie.backpacks[steamid].metal.scrap[scrap_list[x]] = {reserved: old_metal.scrap[scrap_list[x]].reserved, to: old_metal.scrap[scrap_list[x]].to};
            } else {
                selfie.backpacks[steamid].metal.scrap[scrap_list[x]] = {reserved: false, to: null};
            }
        }
        selfie.backpacks[steamid].metal.getRefinedCount = function () {
            var count = 0;
            for (var prop in this.refined) {
                if (this.refined.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };
        selfie.backpacks[steamid].metal.getReclaimedCount = function () {
            var count = 0;
            for (var prop in this.reclaimed) {
                if (this.reclaimed.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };
        selfie.backpacks[steamid].metal.getScrapCount = function () {
            var count = 0;
            for (var prop in this.scrap) {
                if (this.scrap.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };
        self.emit("debug", "InjectPersonBackpack: injected new backpack! (" + steamid + ")", 5);
        return {result: "success", changed: true};
    } else {
        self.emit("debug", "InjectPersonBackpack: same inventory request (" + steamid + "), doing nothing", 5);
        return {result: "success", changed: false};
    }
}; //***********************
Sfuminator.prototype.injectBackpack = function (items, normalized) {
    //INJECT ITEMS
    var self = this;
    selfie.backpack.num_backpack_filled = items.length;
    var finalItems = {};
    var refined_list = [], reclaimed_list = [], scrap_list = [];
    var normalized_items;
    if (normalized) {
        normalized_items = items;
    } else {
        normalized_items = self.normalizeTradeItems(items);
        if (normalized_items === false) {
            return {result: "fail", error: "normalize"};
        }
    }
    var oldIDs = [];
    var newIDs = [];
    for (var x in normalized_items) {
        newIDs.push(normalized_items[x].id);
    }
    for (var x in selfie.backpack.items) {
        oldIDs.push(selfie.backpack.items[x].id);
    }

    if (!arrayCompare(oldIDs, newIDs)) {
        for (var x in normalized_items) {
            if (normalized_items[x].defindex === 5002) {
                refined_list.push(normalized_items[x].id);
            }
            if (normalized_items[x].defindex === 5001) {
                reclaimed_list.push(normalized_items[x].id);
            }
            if (normalized_items[x].defindex === 5000) {
                scrap_list.push(normalized_items[x].id);
            }
            var itemID = normalized_items[x].id;
            if (selfie.backpack.items.hasOwnProperty(itemID) && normalized) {
                var non_standard_item = selfie.backpack.items[itemID].non_standard_item;
            } else {
                non_standard_item = items[x];
            }
            finalItems[itemID] = {
                name: normalized_items[x].name,
                defindex: normalized_items[x].defindex,
                level: normalized_items[x].level,
                quality: normalized_items[x].quality,
                flag_cannot_trade: normalized_items[x].flag_cannot_trade,
                flag_cannot_craft: normalized_items[x].flag_cannot_craft,
                id: normalized_items[x].id,
                non_standard_item: non_standard_item
            };
        }
        selfie.backpack.items = finalItems;
        /// INJECT ITEMS COUNT
        selfie.backpack.itemsCount = {};
        for (var x in selfie.backpack.items) {
            if (!selfie.backpack.itemsCount.hasOwnProperty(selfie.backpack.items[x].defindex)) {
                selfie.backpack.itemsCount[selfie.backpack.items[x].defindex] = 1;
            } else {
                selfie.backpack.itemsCount[selfie.backpack.items[x].defindex] += 1;
            }
        }

        /// INJECT METAL
        var old_metal = JSON.parse(JSON.stringify(selfie.backpack.metal));
        selfie.backpack.metal.refined = {};
        selfie.backpack.metal.reclaimed = {};
        selfie.backpack.metal.scrap = {};
        for (var x in refined_list) {
            if (old_metal.refined.hasOwnProperty(refined_list[x])) {
                selfie.backpack.metal.refined[refined_list[x]] = {reserved: old_metal.refined[refined_list[x]].reserved, to: old_metal.refined[refined_list[x]].to};
            } else {
                selfie.backpack.metal.refined[refined_list[x]] = {reserved: false, to: null};
            }
        }
        for (var x in reclaimed_list) {
            if (old_metal.reclaimed.hasOwnProperty(reclaimed_list[x])) {
                selfie.backpack.metal.reclaimed[reclaimed_list[x]] = {reserved: old_metal.reclaimed[reclaimed_list[x]].reserved, to: old_metal.reclaimed[reclaimed_list[x]].to};
            } else {
                selfie.backpack.metal.reclaimed[reclaimed_list[x]] = {reserved: false, to: null};
            }
        }
        for (var x in scrap_list) {
            if (old_metal.scrap.hasOwnProperty(scrap_list[x])) {
                selfie.backpack.metal.scrap[scrap_list[x]] = {reserved: old_metal.scrap[scrap_list[x]].reserved, to: old_metal.scrap[scrap_list[x]].to};
            } else {
                selfie.backpack.metal.scrap[scrap_list[x]] = {reserved: false, to: null};
            }
        }
        selfie.backpack.metal.getRefinedCount = function () {
            var count = 0;
            for (var prop in this.refined) {
                if (this.refined.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };
        selfie.backpack.metal.getReclaimedCount = function () {
            var count = 0;
            for (var prop in this.reclaimed) {
                if (this.reclaimed.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };
        selfie.backpack.metal.getScrapCount = function () {
            var count = 0;
            for (var prop in this.scrap) {
                if (this.scrap.hasOwnProperty(prop)) {
                    count += 1;
                }
            }
            return count;
        };
        self.emit("debug", "InjectBackpack: injected new backpack!");
        return {result: "success", changed: true};
    } else {
        self.emit("debug", "InjectBackpack: same inventory request, doing nothing");
        return {result: "success", changed: false};
    }
};
Sfuminator.prototype.loadUsers = function () {
    var self = this;
    self.initStatus.users = false;
    self.emit("message", "Loading users...");
    self.emit("debug", "loadUsers fired");
    var users = {};
    try {
        var usersFile = fs.readFileSync(usersFileName);
        users = JSON.parse(usersFile);
    } catch (e) {
        self.emit("debug", "loadUsers: " + usersFileName + " doesn't exist, creating a new one.");
        fs.writeFileSync(usersFileName, "{}");
    }
    selfie.users = users;
    api.getFriendList(mySteamID, function (rawfriendList) {
        var friendList = Array();
        try {
            friendList = rawfriendList.friendslist.friends;
        } catch (e) {
            selfie.emit("error", "Couldn't parse friendlist, recovering from local steam object", 45);
            for (var x in steam.friends) {
                friendList.push({steamid: x, relationship: "friend", friend_since: 0});
            }
        }
        for (var prop in selfie.users) {
            selfie.users[prop].relationship = "not_friend";
            selfie.users[prop].steam_group = "not_joined";
        }
        var sPlayerSummaries = Array();
        var sPlayerSummariesTemp = Array();
        var sfrFriendList = {};
        var z = 0, y = 0;
        for (var x in friendList) {
            if (!selfie.users.hasOwnProperty(friendList[x].steamid)) {
                selfie.users[friendList[x].steamid] = {};
            }
            selfie.users[friendList[x].steamid].relationship = friendList[x].relationship;
            if (friendList[x].friend_since > 0) {
                selfie.users[friendList[x].steamid].friend_since = friendList[x].friend_since;
            }
            y = x - (z * 100);
            if (y >= 100) {
                sPlayerSummaries.push(sPlayerSummariesTemp);
                sPlayerSummariesTemp = Array();
                z += 1;
            }
            sPlayerSummariesTemp.push(friendList[x].steamid);
            sfrFriendList[friendList[x].steamid] = {relationship: friendList[x].relationship, friend_since: friendList[x].friend_since};
        }
        sPlayerSummaries.push(sPlayerSummariesTemp);
        selfie.friends = sfrFriendList;
        self.emit("debug", "loadUsers: friend list updated");
        var allPlayerInfos = Array();
        var callbacked = 0;
        for (var x in sPlayerSummaries) {
            api.getPlayerSummaries(sPlayerSummaries[x], function (playerInfos) {
                if (callbacked === 0) {
                    allPlayerInfos = playerInfos.response.players;
                } else {
                    try {
                        allPlayerInfos = allPlayerInfos.concat(playerInfos.response.players);
                    } catch (e) {
                        selfie.emit("error", "loadUsers: " + e, 10);
                    }
                }
                callbacked += 1;
                if (callbacked === sPlayerSummaries.length) {
                    for (var x in allPlayerInfos) {
                        var iPerson = allPlayerInfos[x];
                        selfie.createUser(iPerson);
                    }
                    self.emit("debug", "loadUsers: enhanced friend list updated");
                    self.emit("debug", "loadUsers: updated " + usersFileName);
                    self.initStatus.users = true;
                    self.emit("initLoaded", "users");
                    api.getGroupSummaries(sfr_group_gid, function (rawgroup) {
                        var groupUserSteamIDs = Array();
                        try {
                            groupUserSteamIDs = rawgroup.memberList.members[0].steamID64;
                            for (var x in groupUserSteamIDs) {
                                if (!selfie.users.hasOwnProperty(groupUserSteamIDs[x])) {
                                    selfie.users[groupUserSteamIDs[x]] = {};
                                }
                                selfie.users[groupUserSteamIDs[x]].steam_group = "joined";
                            }
                        } catch (e) {
                            self.emit("error", "COULDN'T PARSE GROUP MEMBERS THIS HAS TO BE FIXED ONE DAY", 50);
                        }
                        self.emit("debug", "loadUsers: group joined updated");
                        fs.writeFileSync(usersFileName, JSON.stringify(selfie.users, null, "\t"));
                    });

                }
            });
        }
    });
};
Sfuminator.prototype.updateUser = function (steamid, callback) {
    //(if not exist will create a new user, callback -> new user infos)
    selfie.createUserObjectStructure(steamid);
    api.getPlayerSummaries(steamid, function (playerInfos) {
        try {
            var iPerson = playerInfos.response.players[0];
            selfie.createUser(iPerson);
        } catch (e) {
            selfie.emit("error", "updateUser: " + e, 11);
        }
        if (callback) {
            callback(selfie.users[steamid]);
        }
        selfie.emit("debug", "updateUser: user " + steamid + " updated");
    });
};
Sfuminator.prototype.createUser = function (userData) {
    selfie.createUserObjectStructure(userData.steamid);
    selfie.users[userData.steamid].steamid = userData.steamid;
    selfie.users[userData.steamid].personaname = userData.personaname;
    selfie.users[userData.steamid].personastate = userData.personastate;
    selfie.users[userData.steamid].realname = userData.realname;
    selfie.users[userData.steamid].loccountrycode = userData.loccountrycode;
    selfie.users[userData.steamid].last_summaries_update = time();
    return true;
};
Sfuminator.prototype.createUserObjectStructure = function (steamid) {
    if (!selfie.users.hasOwnProperty(steamid)) {
        selfie.users[steamid] = {steamid: steamid};
    }
    if (!selfie.users[steamid].hasOwnProperty("behavior")) {
        selfie.users[steamid].behavior = {};
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("discussions")) {
        selfie.users[steamid].behavior.discussions = {};
    }
    if (!selfie.users[steamid].behavior.discussions.hasOwnProperty("thanks")) {
        selfie.users[steamid].behavior.discussions.thanks = {flagged: true};
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("first_greeting")) {
        selfie.users[steamid].behavior.first_greeting = false;
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("last_greeting")) {
        selfie.users[steamid].behavior.last_greeting = 0;
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("pending_answer")) {
        selfie.users[steamid].behavior.pending_answer = {status: false, type: ""};
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("number_of_trades")) {
        selfie.users[steamid].behavior.number_of_trades = 0;
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("last_activity")) {
        selfie.users[steamid].behavior.last_activity = 0;
    }
    if (!selfie.users[steamid].behavior.hasOwnProperty("afk_counter")) {
        selfie.users[steamid].behavior.afk_counter = 0;
    }
};
Sfuminator.prototype.resetThisTrade = function () {
    selfie.thisTrade = {// All the informations about the current trade
        partnerID: "",
        tradeMode: "",
        tradeModePlus: "",
        myItems: [],
        hisItems: [],
        queue_data: {}
    };
};
Sfuminator.prototype.updateCurrency = function () {
    socket.getCurrency(function (currency) {
        selfie.currency = currency;
    });
};
Sfuminator.prototype.trackEvent = function (steamid) {
    if (selfie.users.hasOwnProperty(steamid) && (typeof selfie.users[steamid] !== "undefined") && (typeof selfie.users[steamid].behavior !== "undefined")) {
        selfie.users[steamid].behavior.last_activity = time();
    } else {
        if (typeof steamid !== "undefined") {
            selfie.emit("debug", "Couldn't trackEvent for user " + steamid + " doesn't exist, will update a user structure for it and retry to track");
            selfie.updateUser(steamid);
            selfie.trackEvent(steamid);
        } else {
            selfie.emit("error", "Fired tracking for undefined steamid", 44);
        }
    }
};
Sfuminator.prototype.loadAllKeywordsCombinations = function () {
    selfie.initStatus.keywords_combinations = false;
    selfie.emit("message", "Generating all possible keywords combinations");
    answer_generate_all_variations();
    selfie.emit("message", "All possible keywords combinations generated");
    selfie.initStatus.keywords_combinations = true;
    selfie.emit("initLoaded", "keywords_combinations");
};
Sfuminator.prototype.getStatus = function () {
    console.log("Current status: " + "\n" +
            "- in_trade: " + this.in_trade + "\n" +
            "- logging: " + this.logging + "\n" +
            "- trade partner: " + this.thisTrade.partnerID + "");
};
Sfuminator.prototype.isFirstInQueue = function (steamid) {
    if (selfie.firstInQueue.steamid === steamid) {
        return true;
    } else {
        return false;
    }
};
Sfuminator.prototype.tradesInProgress = function () {
    var tradesCount = 0;
    if (selfie.firstInQueue.steamid !== "" && selfie.in_trade) {
        tradesCount += 1;
    }
    for (var x in selfie.tradeOffers) {
        if (selfie.tradeOffers[x].status !== "closed") {
            tradesCount += 1;
        }
    }
    return tradesCount;
};
Sfuminator.prototype.isTrading = function (steamid) {
    if (selfie.tradeOffers.hasOwnProperty(steamid) || ((selfie.users.hasOwnProperty(steamid) && selfie.users[steamid].in_queue)) || selfie.hasPendingMailVerification(steamid)) {
        return true;
    } else {
        return false;
    }
};
Sfuminator.prototype.hasPendingMailVerification = function (steamid) {
    for (var i = 0; i < this.pendingMailVerifications.length; i += 1) {
        if (this.pendingMailVerifications[i] === steamid) {
            return true;
        }
    }
    return false;
};
Sfuminator.prototype.lockPendingMailVerificationChanges = function () {
    selfie.lockPendingMailVerification = true;
};
Sfuminator.prototype.unlockPendingMailVerificationChanges = function () {
    selfie.lockPendingMailVerification = false;
};
////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////// SOCKET HANDLING
Sfuminator.prototype.informSocket = function (message) {
    if (message_bot_trade_step.hasOwnProperty(message)) {
        socket.setQueueStatus(message_bot_trade_step[message]);
    } else {
        selfie.emit("error", "No '" + message + "' property found.", 21);
    }
};
socket.on("socket_pendingQueueMails", function (pendingMailVerifications) {
    if (!selfie.lockPendingMailVerification) {
        selfie.pendingMailVerifications = pendingMailVerifications;
    }
    if (!selfie.initStatus.pendingQueueMails) { //First time
        selfie.initStatus.pendingQueueMails = true;

        for (var i = 0; i < pendingMailVerifications.length; i += 1) {
            var steamid = pendingMailVerifications[i];
            if (!selfie.users.hasOwnProperty(steamid)) {
                selfie.emit("debug", "User " + steamid + " not found, creating...");
                selfie.users[steamid] = {};
                selfie.updateUser(steamid);
            } else {
                selfie.updateUser(steamid);
            }
            selfie.trackEvent(steamid);
            selfie.startAfkCheck(steamid);
        }

        selfie.emit("initLoaded", "pendingQueueMails");
    }
});
socket.on("socket_queue", function (queue) {
    if (selfie.logged) {
        var old_queue = selfie.queue;
        var toReserve = [];
        var toCancel = [];
        if (JSON.stringify(old_queue) !== JSON.stringify(queue)) {
            selfie.emit("debug", "Queue changed, updating...");
            selfie.queue = JSON.parse(JSON.stringify(queue));
            for (var x in queue) {
                if (!selfie.users.hasOwnProperty(queue[x].steamid)) {
                    selfie.emit("debug", "User " + queue[x].steamid + " not found, creating...");
                    selfie.users[queue[x].steamid] = {};
                    selfie.updateUser(queue[x].steamid);
                }
                selfie.users[queue[x].steamid].in_queue = true;
                selfie.users[queue[x].steamid].queue = queue[x];
                if (!selfie.users[queue[x].steamid].metal_reservation) {
                    toReserve.push(queue[x].steamid);
                }
            }
            for (var x in old_queue) { // Remove players that exited the queue
                var remove_user_from_queue = true;
                for (var y in queue) {
                    if (queue[y].steamid === old_queue[x].steamid) {
                        remove_user_from_queue = false;
                        break;
                    }
                }
                if (remove_user_from_queue) {
                    selfie.users[old_queue[x].steamid].in_queue = false;
                    if (!selfie.hasPendingMailVerification(old_queue[x].steamid)) {
                        toCancel.push(old_queue[x].steamid);
                    }
                }
            }
            selfie.tradeMetalReserve(toReserve, toCancel);
            selfie.emit("queue", queue);
            if ((JSON.stringify(selfie.firstInQueue) !== JSON.stringify(queue[0])) && selfie.busy) {
                selfie.message(selfie.thisTrade.partnerID, "exited_queue");
                selfie.endTradeSession();
            }
            if (queue.length > 0) {
                selfie.firstInQueue = JSON.parse(JSON.stringify(queue[0]));
            } else {
                selfie.firstInQueue = {steamid: ""};
            }
            if (queue.length > 0 && !selfie.in_trade && !selfie.busy) {
                selfie.emit("debug", "I can trade next person, firing 'contactNextPerson'");
                selfie.emit("contactNextPerson", selfie.firstInQueue);
            }
        }

        if (!selfie.initStatus.queue) {
            selfie.initStatus.queue = true;
            selfie.emit("initLoaded", "queue");
        }
    }
});
socket.on("socket_tradeOffers", function (tradeOffers) {
    if (selfie.logged) {
        var old_tradeOffers = selfie.tradeOffers;
        if (JSON.stringify(old_tradeOffers) !== JSON.stringify(tradeOffers)) {//IF OFFERS CHANGED
            selfie.emit("debug", "Trade offers changed, updating...");
            selfie.tradeOffers = JSON.parse(JSON.stringify(tradeOffers));
            for (var x in tradeOffers) {
                var steamid = tradeOffers[x].steamid;
                if (!selfie.users.hasOwnProperty(steamid)) {
                    selfie.emit("debug", "User " + steamid + " not found, creating...");
                    selfie.users[steamid] = {};
                    selfie.updateUser(steamid);
                }
            }
            for (var x in tradeOffers) {
                var tradeOfferFound = false;
                for (var y in old_tradeOffers) {
                    if (old_tradeOffers[y].steamid === tradeOffers[x].steamid) {
                        tradeOfferFound = true;
                        if (old_tradeOffers[y].status !== tradeOffers[x].status) { //
                            selfie.tradeOfferStep(tradeOffers[x], tradeOffers[x].status);
                        }
                    }
                }
                if (!tradeOfferFound) { //There is a new trade offer
                    selfie.tradeOfferStep(tradeOffers[x], tradeOffers[x].status);
                }
            }
        }

        for (var x in tradeOffers) {//FRIEND ACCEPT CHECK
            var steamid = tradeOffers[x].steamid;
            if ((tradeOffers[x].status === "hold" || tradeOffers[x].status === "noFriend")) {//If trade is in hold
                if (steam.friends.hasOwnProperty(steamid) && (steam.friends[steamid] === 3)) {//If friends
                    selfie.emit("debug", "Setting tradeOffer status to active (relation with " + steamid + ": " + steam.friends[steamid]);
                    socket.setTradeOfferStatus(steamid, "active");
                } else if (!selfie.users[steamid].hasOwnProperty("pendingFriendRequest") || !selfie.users[steamid].pendingFriendRequest) {
                    socket.setTradeOfferStatus(steamid, "noFriend");
                    selfie.emit("addFriend", steamid);
                    selfie.users[steamid].pendingFriendRequest = true;
                }
            }
        }

        if (!selfie.initStatus.tradeOffers) { //First time
            selfie.initStatus.tradeOffers = true;
            selfie.emit("initLoaded", "tradeOffers");
        }
    }
}); //***********************
////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////// MESSAGING
Sfuminator.prototype.message = function (steamid, type) {
//type list: trade_hello, trade_session_start
    var message = "";
    if (isFunction(message_senteces[type].message)) {
        var user = selfie.users[steamid];
        message = message_senteces[type].message(user);
    } else {
        var messageList = message_senteces[type].message;
        message = randomElement(messageList);
    }
    if (message_senteces[type].hasOwnProperty("need_answer") && message_senteces[type].need_answer && message !== "") {
        selfie.users[steamid].behavior.need_answer = {status: true, type: type};
    } else {
        delete selfie.users[steamid].behavior.need_answer;
    }
    selfie.raw_message(steamid, message, type);
};
Sfuminator.prototype.raw_message = function (steamid, message, type) {
    if (typeof type === "undefined") {
        type = message;
    }
    if (message.replace(" ", "") !== "") {
        selfie.emit("steamMessage", {steamid: steamid, message: message});
        selfie.addToLogs("I say to " + steamid + ": " + type, "chatFull");
        selfie.users[steamid].behavior.my_last_message = message;
    }
};
Sfuminator.prototype.answer = function (steamid, message) {
    var context = answer_understand(message);
    var this_behavior = selfie.users[steamid].behavior;
    var final_answer = "";
    var bestAffinity = 60;
    var type = "not_understood";
    for (var z in context) {
        if (context[z].affinity > bestAffinity) {
            type = context[z].type;
            bestAffinity = context[z].affinity;
        }
    }
    if (this_behavior.hasOwnProperty("need_answer") && this_behavior.need_answer.status) {
        if (message_senteces.hasOwnProperty(this_behavior.need_answer.type)) {
            if (message_senteces[this_behavior.need_answer.type].hasOwnProperty("onAnswer")) {
                var answerAccepted = message_senteces[this_behavior.need_answer.type].onAnswer(steamid, type);
                if (answerAccepted) {
                    delete selfie.users[steamid].behavior.need_answer;
                }
            } else {
                delete selfie.users[steamid].behavior.need_answer;
                selfie.emit("error", "Can't handle needed answer: '" + type + "' has no method onAnswer", 42);
            }
        } else {
            delete selfie.users[steamid].behavior.need_answer;
            selfie.emit("error", "Can't handle needed answer '" + type + "' it's not defined in message_senteces", 41);
        }
    } else if (type !== "not_understood") {
        var answerList = message_senteces[type].message;
        var answer = randomElement(answerList);
        switch (type) {
            case "hello":
                if (!this_behavior.first_greeting) {
                    answer = randomElement(message_senteces.hello.message) + " " + randomElement(message_senteces.who_are_you.message) + ". " + randomElement(message_senteces.you_trade.message);
                    if (final_answer !== "") {
                        final_answer = answer + ", " + final_answer;
                    } else {
                        final_answer = answer;
                    }
                    this_behavior.first_greeting = true;
                } else {
                    if (time() > (this_behavior.last_greeting + HOUR)) {
                        if (final_answer !== "") {
                            final_answer = answer + ", " + final_answer;
                        } else {
                            final_answer = answer;
                        }
                    }
                }
                this_behavior.last_greeting = time();
                break;
            case "boolean_answer_yes":
                if (this_behavior.pending_answer.status) {
                    final_answer += answer + " ";
                    selfie.users[steamid].behavior.pending_answer.status = false;
                }
                break;
            case "boolean_answer_no":
                if (this_behavior.pending_answer.status) {
                    if (this_behavior.hasOwnProperty("pending_answer") && this_behavior.pending_answer.hasOwnProperty("type") && (typeof message_senteces[this_behavior.pending_answer.type] !== "undefined")) {
                        answer = answer + ". " + randomElement(message_senteces[this_behavior.pending_answer.type].message);
                    } else {
                        answer = answer + ". ";
                    }
                    final_answer += answer + " ";
                    selfie.users[steamid].behavior.pending_answer.status = false;
                }
                break;
            default:
                if (type === "bye") {
                    answer_reset_times(steamid);
                }
                if (!this_behavior.discussions.hasOwnProperty(type)) {
                    final_answer += answer + " ";
                } else {
                    if (this_behavior.discussions[type].hasOwnProperty("flagged")) {
                        if (this_behavior.discussions[type].flagged) {
                            final_answer += answer + " ";
                            selfie.users[steamid].behavior.discussions[type].flagged = false;
                        } else {
                            answer = randomElement(message_senteces.already_answered.message);
                            final_answer += answer + " ";
                            selfie.users[steamid].behavior.pending_answer = {status: true, type: type};
                            selfie.users[steamid].behavior.discussions.thanks.flagged = true; // temp
                        }
                    } else {
                        if (time() > (this_behavior.discussions[type].when + HOUR)) {
                            final_answer += answer + " ";
                        } else {
                            answer = randomElement(message_senteces.already_answered.message);
                            final_answer += answer + " ";
                            selfie.users[steamid].behavior.pending_answer = {status: true, type: type};
                        }
                        selfie.users[steamid].behavior.discussions.thanks.flagged = true; // temp
                    }
                }

                selfie.users[steamid].behavior.discussions[type] = {answethisWordred: true, when: time()};
                break;
        }
    }
    selfie.addToLogs(steamid + " says: " + message, "chatFull");
    if (message_senteces.hasOwnProperty(type) && message_senteces[type].hasOwnProperty("need_answer")) {
        selfie.message(steamid, type);
    } else if (type !== "not_understood") {
        selfie.raw_message(steamid, final_answer);
    } else {
        selfie.addToLogs("Couldn't understand message: " + message + " after i say: " + selfie.users[steamid].behavior.my_last_message, "chat");
    }
};
function answer_reset_times(steamid) {
    for (var x in selfie.users[steamid].behavior.discussions) {
        selfie.users[steamid].behavior.discussions[x].when = 0;
    }
    selfie.users[steamid].behavior.last_greeting = 0;
}
function answer_understand(original_message) {
    var result = Array();
    ///////////////////////////// REMOVE SYMBOLS AND NORMALIZE MESSAGE
    var original_normalized_message = (original_message.replace(/[^A-Z0-9]+/ig, ",")).toLowerCase();
    var original_normalized_message = answer_remove_double_letters(original_normalized_message);
    if (original_normalized_message[0] === ",") {
        original_normalized_message = original_normalized_message.slice(1);
    }
    if (original_normalized_message[original_normalized_message.length - 1] === ",") {
        original_normalized_message = original_normalized_message.slice(0, original_normalized_message.length - 1);
    }
    selfie.emit("debug", "answering to: " + original_message + " |NORMALIZED: " + original_normalized_message, 5);
    var kl = answer_keywords.list;
    var new_affinity = {};
    var old_affinity = {};
    /////////////////////////////// PARTICLUAR AFFINITY
    var original_normalized_message_particularized = original_normalized_message;
    var wordsToRemove = Array();
    for (var x in kl) {
        var klt = kl[x].type;
        var particular_affinity = answer_getParticularAffinity(klt, original_normalized_message);
        new_affinity[klt] = particular_affinity.affinity;
        if (old_affinity.hasOwnProperty(klt)) {
            if (new_affinity[klt] > old_affinity[klt]) {
                old_affinity[klt] = new_affinity[klt];
            }
            wordsToRemove.push(particular_affinity.to_remove);
        } else {
            old_affinity[klt] = new_affinity[klt];
            wordsToRemove.push(particular_affinity.to_remove);
        }
    }
    for (var x in wordsToRemove) {
        var rep0 = new RegExp(wordsToRemove[x], 'g');
        original_normalized_message_particularized = original_normalized_message_particularized.replace(rep0, "");
    }

/////////////////////////////////// FILTER MISLEADING WORDS
    for (var x in words_to_filter) {
        original_normalized_message_particularized = answer_normalizedWordReplace(words_to_filter[x], original_normalized_message_particularized);
    }

///////////////////////////////// PRIORITY AND AFFINITY
    for (var x in kl) {
        var klt = kl[x].type;
        var priority_coefficent = answer_getPriorityCoefficent(kl[x], original_normalized_message);
        var all_variations = answer_keywords_getAllVariations(klt);
        for (var y in all_variations) {
            var normalized_message = original_normalized_message_particularized;
            var original_compatted_message = normalized_message.replace(/,/g, "");
            var thisVariationList = all_variations[y].split(",");
            var compatted_message = normalized_message.replace(/,/g, "");
            var non_removed = 0;
            for (var z in thisVariationList) {
                var preremoval = normalized_message;
                var rep4 = new RegExp(thisVariationList[z], "g");
                normalized_message = answer_normalizedWordReplace(thisVariationList[z], normalized_message);
                compatted_message = compatted_message.replace(rep4, "");
                if (preremoval === normalized_message) {
                    non_removed += 1;
                }
            }
            var non_removed_factor = ((thisVariationList.length - non_removed) / thisVariationList.length);
            var normalized_message_compatted = normalized_message.replace(/,/g, "");
            var partial_replacement_factor = 1;
            if (normalized_message_compatted !== compatted_message) {
                partial_replacement_factor = 5;
            }
            var charsAffinity = (((original_compatted_message.length - normalized_message_compatted.length) * 100) / original_compatted_message.length);
            var orginal_nwords = (original_normalized_message_particularized.split(",")).length;
            var new_nwords = (normalized_message.split(",")).length;
            var wordsAffinity = ((orginal_nwords - new_nwords) * 100) / orginal_nwords;
            var consideredAffinity;
            if (charsAffinity > wordsAffinity) {
                consideredAffinity = charsAffinity;
            } else {
                consideredAffinity = wordsAffinity;
                partial_replacement_factor = 1;
            }
            new_affinity[klt] = parseInt((consideredAffinity * non_removed_factor) / partial_replacement_factor);
            if (old_affinity.hasOwnProperty(klt)) {
                if (new_affinity[klt] > old_affinity[klt]) {
                    old_affinity[klt] = new_affinity[klt];
                }
            } else {
                old_affinity[klt] = new_affinity[klt];
            }
        }
        result.push({type: klt, affinity: parseInt(old_affinity[klt] * priority_coefficent), priority: priority_coefficent});
    }
    result.sort(function (a, b) {
        if (a.affinity > b.affinity) {
            return -1;
        }
        if (a.affinity < b.affinity) {
            return 1;
        }
        return 0;
    });
    return result;
}
function answer_remove_double_letters(normalized_message) {
    var wordList = normalized_message.split(",");
    var final_msg = "";
    for (var x in wordList) {
        var thisWord = wordList[x];
        var firstLetter = thisWord[0];
        var zpointer = 1;
        while (thisWord[zpointer] === firstLetter && zpointer < thisWord.length) {
            zpointer += 1;
        }
        var thisWord = thisWord.slice(zpointer - 1, thisWord.length);
        zpointer = 0;
        var count_same = 0;
        var thisNewWord = "";
        while (zpointer < thisWord.length) {
            var last_char = new_char;
            var new_char = thisWord[zpointer];
            if (new_char === last_char) {
                count_same += 1;
            }
            if (new_char !== last_char || count_same < 2) {
                thisNewWord += thisWord[zpointer];
                if (count_same > 1) {
                    count_same = 0;
                }
            }
            zpointer += 1;
        }
        if (thisNewWord[thisNewWord.length - 1] === thisNewWord[thisNewWord.length - 2]) {
            thisNewWord = thisNewWord.slice(0, thisNewWord.length - 1);
        }
        final_msg += thisNewWord + ",";
    }
    return final_msg.slice(0, final_msg.length - 1);
}
function answer_getParticularAffinity(type, normalized_message) {
    switch (type) {
        case "hello":
            var old_affinity = 0;
            var splitted_message = normalized_message.split(',');
            var h = 0;
            for (var g in splitted_message) {
                h += 1;
                if (g > 1) {
                    break;
                }
                var new_affinity = answer_matchWord(type, splitted_message[g]);
                if (new_affinity > old_affinity) {
                    var wordmatch = splitted_message[g];
                    old_affinity = new_affinity;
                    break;
                }
            }
            var to_remove = "";
            if (splitted_message.length > 1) {
                to_remove = wordmatch;
            }
            return {affinity: parseInt(old_affinity / h), matched_word: wordmatch, to_remove: to_remove};
        default:
            return {affinity: 0, matched_word: ""};
    }
}
function answer_getPriorityCoefficent(kl, normalized_message) {
    var coefficent = 0.8;
    if (kl.hasOwnProperty("priority")) {
        var pr_words_non_splitted = kl.priority;
        var replaced_words = 0;
        for (var x in pr_words_non_splitted) {
            var pr_words = pr_words_non_splitted[x].split(",");
            for (var z in pr_words) {
                var pr_word_variations = answer_keywords_getAllWordVarations(pr_words[z]);
                for (var y in pr_word_variations) {
                    var new_normalized_message = answer_normalizedWordReplace(pr_word_variations[y], normalized_message);
                    if (new_normalized_message !== normalized_message) {
                        replaced_words += 1;
                        break;
                    }
                }
            }
            if (replaced_words === pr_words.length) {
                coefficent = 1.6;
                break;
            }
        }
    } else {
        coefficent = 1;
    }
    return coefficent;
}
function answer_normalizedWordReplace(replacement, normalized_message) {
    if (normalized_message !== "") {
        if (normalized_message.indexOf(",") === -1) {
            if (normalized_message === replacement) {
                normalized_message = "";
            }
        } else {
            var rep1 = new RegExp("," + replacement + ",", 'g');
            normalized_message = normalized_message.replace(rep1, ",");
            var firstCommaIndex = normalized_message.indexOf(",");
            var lastCommaIndex = normalized_message.lastIndexOf(",");
            var first_word = normalized_message.slice(0, firstCommaIndex);
            var last_word = normalized_message.slice(lastCommaIndex + 1, normalized_message.length);
            if (first_word === replacement) {
                normalized_message = normalized_message.slice(firstCommaIndex + 1, normalized_message.length);
            }
            if (last_word === replacement) {
                normalized_message = normalized_message.slice(0, lastCommaIndex);
            }
        }
    }
    return normalized_message;
}
function answer_matchWord(keyword, word) {
    var variations = answer_keywords.variations[keyword];
    var affinity = 0;
    if (variations) {
        var variationsList = (variations.split(",")).concat(keyword);
        for (var x in variationsList) {
            if (variationsList[x] === word) {
                affinity = 100;
                break;
            }
        }
    }
    return affinity;
}
function answer_keywords_getAllVariations(type) {
    return answer_keywords_all_variations[type];
}
function answer_generate_all_variations() {
    var answer_list = answer_keywords.list;
    for (var ip in answer_list) {
        var allVariations = Array();
        var keywords_full = answer_list[ip].keywords;
        for (var x in keywords_full) {
            var single_keyword_splitted = (keywords_full[x]).split(",");
            var single_keyword_variations = Array();
            for (var y in single_keyword_splitted) {
                single_keyword_variations.push(answer_keywords_getAllWordVarations(single_keyword_splitted[y]));
            }
            allVariations = allVariations.concat(answer_variations_allPossibleCases(single_keyword_variations));
        }
        answer_keywords_all_variations[answer_list[ip].type] = allVariations;
    }
}
function answer_variations_allPossibleCases(arr) {
    if (arr.length === 0) {
        return [];
    }
    else if (arr.length === 1) {
        return arr[0];
    }
    else {
        var result = [];
        var allCasesOfRest = answer_variations_allPossibleCases(arr.slice(1)); // recur with the rest of array
        for (var c in allCasesOfRest) {
            for (var i = 0; i < arr[0].length; i++) {
                result.push(arr[0][i] + "," + allCasesOfRest[c]);
            }
        }
        return result;
    }
}
function answer_keywords_getAllWordVarations(word) {
    var variations = Array();
    if (answer_keywords.variations.hasOwnProperty(word)) {
        variations = answer_keywords.variations[word].split(",");
    }
    variations.push(word);
    return variations;
}

var message_bot_trade_step = {
    friend_added: {
        personal: "Ax & Pijama has just added you to its friend list, waiting for you to accept...",
        global: "Sent friend request to '#player'...",
        step: 1
    },
    invited_to_trade: {
        personal: "You have been invited to trade...",
        global: "Inviting '#player' to trade...",
        step: 2
    },
    in_trade: {
        personal: "You are trading...",
        global: "Trading with '#player'...",
        step: 3
    },
    trade_fail: {
        personal: "Trade failed, no items were exchanged, inviting you to trade again.",
        global: "Trade with '#player' failed, oh steam...",
        step: 10
    },
    trade_timeout: {
        personal: "Trade timeout, inviting you to trade again.",
        global: "Trading with '#player'...",
        step: 11
    },
    seems_afk: {
        personal: "Hey are you there?",
        global: "'#player' seems afk...",
        step: 99
    },
    afk: {
        personal: "You were afk too much, sorry.",
        global: "'#player' was afk too much, removing from the queue...",
        step: 100
    },
    preparing_next_trade: {
        personal: "Preparing for next trade, hold on...",
        global: "Preparing for next trade...",
        step: 99
    }
};
var answer_keywords = {
    variations: {
        are: "re,ar,is,is",
        ask: "tell,request",
        bot: "robot,software",
        buy: "buying,buy,buyng",
        bye: "bb,cya,goodbye,byebye",
        can: "could,coud,culd",
        do: "does,do,doesn,don",
        give: "giv,gave,gve,have",
        going: "goin",
        hello: "hi,heya,hey,ola,ciao,helo,hy,ello,salut,yo,hiya",
        how: "haw,hiw,hpw",
        i: "me,im",
        is: "s",
        link: "url",
        me: "i,us",
        need: "ned,want,wanted,deserve",
        nice: "good,wanderfull,awesome,great",
        no: "nope,nop,n,nein,na,not,t,didn,nah",
        not: "t",
        of: "on,to",
        ok: "k,oki,okay,kk",
        question: "demand,request,ask",
        remember: "remembre",
        selling: "sell,sel,seling",
        site: "website,web-site,web,page,sfuminator,link",
        something: "smthing,someting,somethin",
        still: "stil,again",
        thanks: "ty,thx,thank,thankyou,thenks,thk,thnk,tty",
        the: "de,te",
        trade: "trde",
        yes: "yep,y,ya,da,yeah,sure,yep",
        you: "u,yu,ya,yo",
        your: "ur,you,yours,the",
        want: "wanted,wnat",
        wassap: "wasap,wassup",
        what: "wat,wich,whitch,witch,which",
        who: "whos,wo,whos"
    },
    list: [
        {
            type: "hello",
            keywords: ["hello"],
            priority: ["hello"]
        },
        {
            type: "bye",
            keywords: ["bye", "have,a,nice,day", "bye,have,a,nice,day"],
            priority: ["bye"]
        },
        {
            type: "how_are_you",
            keywords: ["how,are,you", "how,is,going", "are,you,ok", "what,is,up", "sup", "wassap"]
        },
        {
            type: "thanks",
            keywords: ["thank,you", "thanks"]
        },
        {
            type: "generic_question",
            keywords: ["can,I,ask,you,something", "I,would,like,to,ask,you,a,question", "I,want,to,ask,you,something", "I,have,a,question"],
            priority: ["ask,question"]
        },
        {
            type: "who_are_you",
            keywords: ["who,are,you", "do,i,know,you"]
        },
        {
            type: "are_you_bot",
            keywords: ["are,you,a,bot"],
            priority: ["you,bot"]
        },
        {
            type: "you_trade",
            keywords: ["trade", "can,we,trade", "shell,we,trade", "let,s,trade", "i,want,to,trade"],
            priority: ["trade"]
        },
        {
            type: "your_site",
            keywords: ["what,is,your,site", "can,give,link,of,your,site", "i,do,not,remember,your,site", "give,the,site", "can,your,give,me,site", "site"],
            priority: ["site"]
        },
        {
            type: "boolean_answer_yes",
            keywords: ["yes"],
            priority: ["yes"]
        },
        {
            type: "boolean_answer_no",
            keywords: ["no"],
            priority: ["no"]
        },
        {
            type: "are_you_there",
            keywords: ["are,you,there", "you,there", "are,you,still,there", "you,still,there"]
        },
        {
            type: "i_love_you",
            keywords: ["i,love,you", "love,you"]
        },
        {
            type: "you_sell",
            keywords: ["are,you,selling"],
            priority: ["you,selling"]
        },
        {
            type: "i_buy",
            keywords: ["i,buy", "buy"],
            priority: ["buy"]
        },
        {
            type: "you_best",
            keywords: ["you,are,the,best"],
            priority: ["you,best"]
        },
        {
            type: "help",
            keywords: ["i,need,help", "help"],
            priority: ["help"]
        }
    ]
};

//{
// message: array/function (returns 1 message)
// need_answer: boolean,
// onAnswer: function(steamid, type), //has to retoorn bool -> true: valid answer, false: no
//}
var message_senteces = {
    help: {
        message: [
            "Your message is going to trigger a help request to the online staff, are you sure you want to continue?"
        ],
        need_answer: true,
        onAnswer: function (steamid, type) {
            if (type === "boolean_answer_yes") {
                selfie.raw_message(steamid, "Okay, if there is a supervisor available, you should be contacted soon, if not, maybe the website FAQ could help you");
                for (var x in MODERATORS) {
                    selfie.emit("steamMessage", {steamid: MODERATORS[x], message: "User " + selfie.users[steamid].personaname + " is asking for help, contact: #chat " + steamid + "\nFast message: Hello! You are now talking with a sfuminator.tf staff member, how can I help you?"});
                }
                return true;
            } else if (type === "boolean_answer_no") {
                selfie.raw_message(steamid, "Alright");
                return true;
            } else {
                selfie.raw_message(steamid, "Answer yes or no, please.");
                return false;
            }
        }
    },
    i_love_you: {
        message: [
            "Me too <3",
            "Aww so sweet, of course I love you too!",
            "^^ you make me blush",
            "I love you too!",
            "010010010010000001101100011011110111011001100101001000000111100101101111011101010010000001110100011011110110111100100001"
        ]
    },
    you_sell: {
        message: [
            "I'm selling hats and misc, if you want to buy them, please go here: http://sfuminator.tf/hats/buy/ select which one you want and I'll trade you."
        ]
    },
    i_buy: {
        message: [
            "If you want to buy or sell hats and misc, please go here: http://sfuminator.tf/ select which one you want and I'll trade you."
        ]
    },
    you_best: {
        message: [
            "Thank you! 010000100111010101110100001000000111100101101111011101010010000001100001011100100110010100100000011001010111011001100101011011100010000001100010011001010111010001110100011001010111001000100001",
            "Ohhh thanks! <3",
            "So nice of you, thanks :D"
        ]
    },
    hello: {
        message: [
            "Hello!",
            "Hey =D",
            "Hi",
            "Hello my friend ^^",
            "Bip bu bi bup... oh hey!",
            "Hey",
            "Hello"
        ]
    },
    bye: {
        message: [
            "Bye bye!",
            "Bye, have a nice day =D",
            "Bye, hope to see you again",
            "Bye :)",
            "Bye bye, have a nice day!"
        ]
    },
    how_are_you: {
        message: [
            "I'm fine thanks ^^",
            "It's all good!",
            "My bits are perfectly working ...well... i hope :P",
            "My bits are perfectly working!",
            "I'm ok, thank you",
            "I think that I'm fine, although not sure if I can really think of it :S",
            "I'm fine thanks"
        ]
    },
    are_you_there: {
        message: [
            "Yeah... I think so",
            "Yes I'm here",
            "Yep",
            "Yeah bip biup bip, I'm here"
        ]
    },
    are_you_bot: {
        message: [
            "Bip bup biip, yes I'm I bot. No, seriously, I'm a bot.",
            "Yep, I'm a bot",
            "Yes... I think so =D",
            "Yeah, I'm a bot",
            "Yes",
            "Yes, I'm a bot"
        ]
    },
    who_are_you: {
        message: [
            "I'm the Sfuminator bot",
            "I'm the Sfuminator bot",
            "I'm a bot",
            "Bip bup bip... I'm a bot!",
            "Bip bip buuuup, I'm the Sfuminator bot"
        ]
    },
    you_trade: {
        message: [
            "If you want to trade me please go here and select what you want to do: http://sfuminator.tf/",
            "In order to trade with me you have to go on our website and select what you want to do: http://sfuminator.tf/",
            "If you would like to trade with me, please visit our website and select what you want to do there: http://sfuminator.tf/",
            "If you are looking to trade with me, please select what you want on our website: http://sfuminator.tf/",
            "If you would like to trade with me, take a look at our website and choose what to trade there: http://sfuminator.tf/"
        ]
    },
    your_site: {
        message: [
            "My website is: http://sfuminator.tf/",
            "Here is the link: http://sfuminator.tf/"
        ],
        pending_answer: ["thanks"]
    },
    thanks: {
        message: [
            "You are welcome :D",
            "You are welcome",
            "No problem my friend!",
            "No problem!",
            "Thanks to you ;)",
            "You are welcome!"
        ]
    },
    boolean_answer_yes: {
        message: [
            "Ok",
            "Alright"
        ]
    },
    boolean_answer_no: {
        message: [
            "Oh.. ok",
            "Oh"
        ]
    },
    already_answered: {
        message: [
            "I think I've already answered to that...",
            "Hmm, didn't I tell you that already?",
            "I did answer already to that... I think...",
            "I think I've already answered to that...",
            "Didn't I just tell you that?"
        ],
        pending_answer: ["boolean_answer_yes", "boolean_answer_no"]
    },
    generic_question: {
        message: [
            "Yeah, hope that I can answer... =P But I'll take note of your question if not.",
            "Sure go haead",
            "Yeah, sure",
            "Yes, tell me",
            "Ok, hope that I can answer :D",
            "Bip bup bip... ok my bits are listening you"
        ]
    },
    trade_too_long_alert: {
        message: [
            "Trade is taking too much time, sorry but you will be kicked from the queue in 30 seconds",
            "Hey, sorry but this trade is taking too much time, I will end this session in 30 seconds",
            "This trade is taking too much time, sorry but in 30 seconds you will be kicked from the queue"
        ]
    },
    trade_too_long: {
        message: [
            "Sorry, I removed you from the queue, trade took too much time",
            "Sorry but trade took too much time, I removed you from the queue"
        ]
    },
    afk_alert: {
        message: [
            "Hey, are you there?",
            "Everything ok? Are you there?",
            "Hello? Are you there?"
        ],
        pending_answer: ["boolean_answer_yes"]
    },
    afk_kick: {
        message: [
            "Sorry but you were afk too much, you have been kicked from the queue",
            "Sorry, I removed you from the queue, you were afk too much"
        ]
    },
    trade_hello: {
        message: function (user) {
            if (user.behavior.hasOwnProperty("number_of_trades")) {
                var number_of_trades = user.behavior.number_of_trades;
            } else {
                number_of_trades = 0;
            }
            var last_greeting = user.last_greeting;
            var message = [
                [
                    "This is your first time trading with me eh? Alright, let's do this!",
                    "Nice to meet you, let's trade :D",
                    "Oh welcome on the sfuminator community! Let's trade",
                    "Hope that all was nice and easy, alright one more step =P let's trade!",
                    "What's up? Nice to meet you, let's trade!"
                ], [
                    "Nice to see you again :), let's trade!",
                    "Nice to see you again, let's trade",
                    "Alright let's trade ^^",
                    "It's you! Alright let's trade!",
                    "Oh, it's you! Alright let's trade...",
                    "What's up? Happy to trade with you again, let's do this :D",
                    "I'm ready, let's trade!",
                    "Was waiting for you, hope you were as well! Let's trade =D"
                ], [
                    "Here's my pal, let's trade",
                    "Here's my pal, let's trade!",
                    "Here's my pal, let's do this",
                    "You know how this works... let's trade :D",
                    "Well, you know the procedure... =P",
                    "How's going? Hope it's all good, let's trade!",
                    "What's up? Hope it's all good, let's trade!",
                    "How's going? Hope you are ok, let's trade!",
                    "Yes! it's you! Let's trade :D",
                    "It's you, again! Happy that you like our service, let's trade!",
                    "Nice to see you again! And again, and again, and again and again and again *hitting with a spoon* ...ehmm ok let's trade...",
                    "Wow, this is your trade number // with me, you should be a veteran by now!"
                ]
            ];
            if (number_of_trades > 0 && number_of_trades < 10) {
                number_of_trades = 1;
            }
            if (number_of_trades >= 10) {
                number_of_trades = 2;
            }
            var hello_message = "";
            if (time() > (last_greeting + HOUR)) {
                hello_message = randomElement(message_senteces.hello.message) + " ";
            }
            return hello_message + randomElement(message[number_of_trades]).replace("//", user.behavior.number_of_trades);
        }
    },
    trade_session_start: {
        message: function (user) {
            var message = {
                hatExchange: [
                    "I'm loading the items, during the trade you can check if your hat is ok but putting it on the offers.",
                    "Loading items... hold on a sec, by the way you can check if your hat is ok by putting it on the offers.",
                    "I can tell you if your hat is ok if you put it on the offers."
                ],
                iBuy: [
                    "When you are ok, just ready and I'll tell you if the trade is ok!",
                    "If you don't remember anymore which hats you have to put don't worry, you can ready any moment and I'll tell you what is missing.",
                    "Loading items... by the way, when you are ok with the trade just ready, and I'll do the rest ;)"
                ],
                iSell: [
                    "When you are ok, just ready and I'll tell you if the trade is ok!",
                    "If you don't remember anymore how much metal you have to put don't worry, you can ready any moment and I'll tell you what is missing.",
                    "Loading items... by the way, when you are ok with the trade just ready, and I'll do the rest ;)"
                ]
            };
            var mode = "";
            var tradeMode = user.queue.tradeMode;
            var tradeModePlus = user.queue.tradeModePlus;
            if (tradeMode === "hatExchange") {
                mode = tradeMode;
            }
            if (tradeMode === "metal_mine" && tradeModePlus === "hatShop") {
                mode = "iBuy";
            }
            if (tradeMode === "hatShop" && tradeModePlus === "hatShop") {
                mode = "iSell";
            }
            return randomElement(message[mode]);
        }
    },
    trade_wrong_items: {
        message: function () {
            var message = [
                "Herr, there is something wrong with your items.",
                "Hold on, I think your items are not correct.",
                "Hum, I think that your items are not ok.",
                "Are you sure your items are ok?",
                "There is something wrong with your items."
            ];
            var toAdd = selfie.thisTrade.toAdd;
            var toRemove = selfie.thisTrade.toRemove;
            var additionalInfo = "";
            if (selfie.thisTrade.tradeMode === "metal_mine" && selfie.thisTrade.tradeModePlus === "hatShop") {
                if (toAdd.length > 0) {
                    additionalInfo += "I think you have to add: ";
                    for (var x in toAdd) {
                        if (toAdd.length > 1 || toRemove.length > 1) {
                            additionalInfo += "\n\t";
                        }
                        if (qualityLookup[toAdd[x].quality] !== "") {
                            additionalInfo += qualityLookup[toAdd[x].quality] + " ";
                        }
                        additionalInfo += toAdd[x].name + " lv.";
                        additionalInfo += toAdd[x].level;
                    }
                }
                if (toRemove.length > 0) {
                    if (toAdd.length > 0) {
                        additionalInfo += "\nAnd you should remove: ";
                    } else {
                        additionalInfo += "I think that you have to remove: ";
                    }
                    for (var x in toRemove) {
                        if (toAdd.length > 1 || toRemove.length > 1) {
                            additionalInfo += "\n\t";
                        }
                        //quality lookup not needed in "to remove" becoz is already a steamcommunity well formatted name
                        additionalInfo += toRemove[x].name + " lv.";
                        additionalInfo += toRemove[x].level;
                    }
                }
            }
            if ((selfie.thisTrade.tradeMode === "hatShop" && selfie.thisTrade.tradeModePlus === "hatShop") || (selfie.thisTrade.tradeMode === "hatExchange" && selfie.thisTrade.tradeModePlus === "hatExchange")) {
                if (toAdd > 0) {
                    additionalInfo += "I think you have to add: " + metal_convertToNiceSentence(toAdd) + "\nIf you don't have the precise amount don't worry, I can provide change.";
                } else {
                    if (toRemove instanceof Array) {
                        additionalInfo += "I think that you have to remove: ";
                        for (var x in toRemove) {
                            if (toRemove.length > 1) {
                                additionalInfo += "\n\t";
                            }
                            //quality lookup not needed in "to remove" becoz is already a steamcommunity well formatted name
                            additionalInfo += toRemove[x].name + " lv.";
                            additionalInfo += toRemove[x].level;
                        }
                    } else {
                        if (toRemove > 0) {
                            additionalInfo += "You added too much metal, you should remove at least " + metal_convertToNiceSentence(toRemove) + "\nIf you don't have the precise amount don't worry, I can provide change.";
                        } else {
                            selfie.emit("error", "message.trade_wrong_items: (hatShop /he_buy) toAdd and toRemove are both 0, what the hell am I supposed to say?", 18);
                        }
                    }
                }
            }
            return randomElement(message) + "\n" + additionalInfo;
        }
    },
    trade_complete: {
        message: function (user) {
            var number_of_trades = 1;
            if (user.behavior.hasOwnProperty("number_of_trades") && user.behavior.number_of_trades > 0) {
                number_of_trades = user.behavior.number_of_trades;
            }
            number_of_trades -= 1; //Needed to be compatible with array index
            var message = [[
                    "Yay! Thanks a lot! Hope that all went nice and easy also for you.",
                    "Thanks a lot! Everything went well? I hope so!",
                    "Thank you! If you didn't already, you can join our group to keep in touch with the community and get notified for the incoming events http://steamcommunity.com/groups/tf2sfuminator"
                ], [
                    "Thanks a lot! It has been a pleasure to trade with you, if you want, remember that you can join our group! http://steamcommunity.com/groups/tf2sfuminator",
                    "Thank you very much! Hope to trade with you again, meanwhile if you didn't already, you might want to join our group!  http://steamcommunity.com/groups/tf2sfuminator",
                    "Thanks a lot!! Hope to trade with you again",
                    "Thank you! Enjoy your new items!"
                ], [
                    "Thanks!",
                    "Thank you!",
                    "Thanks a lot!"
                ]];
            if (number_of_trades > 0 && number_of_trades < 10) {
                number_of_trades = 1;
            }
            if (number_of_trades >= 10) {
                number_of_trades = 2;
            }
            /*if (!user.behavior.hasOwnProperty("repped")) {
             setTimeout(function () {
             selfie.message(user.steamid, "ask_rep");
             }, 2000);
             }*/
            return randomElement(message[number_of_trades]);
        },
        pending_answer: ["thanks"]
    },
    trade_cancel: {
        message: [
            "Oh, it seems you cancelled the trade...",
            "You cancelled the trade...",
            "It seems you cancelled the trade",
            "Oh... you cancelled the trade"
        ]
    },
    trade_timeout: {
        message: [
            "Ops, something went wrong with the connection...",
            "Hum, timeout.",
            "Timeout... hmm something went wrong with the connection."
        ]
    },
    trade_fail: {
        message: [
            "Trade failed! No items were exchanged :( ",
            "Something went wrong with steam, trade failed.",
            "Oh... trade failed."
        ]
    },
    trade_retry: {
        message: [
            "Let's retry the trade.",
            "Shell we try this again?",
            "I'll invite you to trade again",
            "Let's retry to trade."
        ]
    },
    trade_too_many_attempts: {
        message: [
            "We tried too many times, sorry I think that there is something wrong with steam, let's retry this later.",
            "Sorry, we tried too many times, let's retry this later.",
            "It seems that there is something wrong with steam, let's retry this later.",
            "Sorry but trade failed too many times, I think that there is something wrong with steam, let's retry later."
        ]
    },
    tradeOffer_hello: {
        message: function (user) {
            if (user.behavior.hasOwnProperty("number_of_trades")) {
                var number_of_trades = user.behavior.number_of_trades;
            } else {
                number_of_trades = 0;
            }
            var last_greeting = user.last_greeting;
            var message = [
                [
                    "This is your first time trading with me eh? Alright, let's do this!",
                    "Nice to meet you, your request is being processed...",
                    "Oh, welcome to the sfuminator community! I'm processing your request...",
                    "Hope that all was nice and easy, alright one more step!",
                    "What's up? Nice to meet you, I'm processing your request..."
                ], [
                    "Nice to see you again :), your trade is being processed...",
                    "Nice to see you again, your trade is being processed...",
                    "Alright let's do this! ^^",
                    "It's you! let's do this!",
                    "Oh, it's you! Alright I'm processing your trade...",
                    "What's up? Happy to trade with you again, hold on a sec :D",
                    "I'm ready, let me process your trade",
                    "Was waiting for you. Let's do this =D"
                ], [
                    "Here's my pal, hold on a sec...",
                    "Here's my pal ^^ what's up?",
                    "Here's my pal, let's do this",
                    "Hey",
                    "Well, you know the procedure... =P",
                    "How's going? Hope it's all good!",
                    "What's up? Hope it's all good! Hold on a sec...",
                    "How's going? Hope you are ok",
                    "Hey! It's you! Wait a sec :D",
                    "It's you, again! Happy that you like our service! Wait a sec",
                    "Nice to see you again! And again, and again, and again and again and again *hitting with a spoon* ...ehmm ok let's do this trade...",
                    "Wow, this is your trade number // with me, you should be a veteran by now!",
                    "Hello!",
                    "Sup :)",
                    "What's up :D",
                    "Hey! ^^"
                ]
            ];
            if (number_of_trades > 0 && number_of_trades < 10) {
                number_of_trades = 1;
            }
            if (number_of_trades >= 10) {
                number_of_trades = 2;
            }
            var hello_message = "";
            if (time() > (last_greeting + HOUR)) {
                hello_message = randomElement(message_senteces.hello.message) + " ";
            }
            return hello_message + randomElement(message[number_of_trades]).replace("//", user.behavior.number_of_trades);
        }
    },
    tradeOffer_sent: {
        message: function (user) {
            var message = [
                "I just sent you a trade offer",
                "Ok! I sent you a trade offer",
                "Alright, trade offer has been sent :D",
                "Here you go! Trade offer sent ^^"
            ];
            return randomElement(message) + "  (the offer will be available for the next 2 minutes)\nhttp://steamcommunity.com/tradeoffer/" + selfie.sentTradeOffers[user.steamid].tradeOfferID + "/";
        }
    },
    tradeOffer_afk_kick: {
        message: [
            "Sorry, but you were afk too much, your trade offer has been cancelled",
            "Sorry, you were too much afk, your trade offer has been cancelled"
        ]
    },
    tradeOffer_trade_too_long: {
        message: [
            "Sorry, but it took too much to accept the trade, your trade offer has been cancelled"
        ]
    },
    tradeOffer_trade_too_long_alert: {
        message: [
            "Sorry but this is taking too much time, your trade offer will be cancelled in 30 seconds"
        ]
    },
    tradeOffer_declined: {
        message: [
            "Oh, it seems you declined the trade offer...",
            "Oh... you declined the trade offer :(",
            "It seems you declined the trade offer... D:",
            "Oh, It seems you declined the trade offer"
        ]
    },
    tradeOffer_cancel: {
        message: [
            "Alright, I cancelled your trade",
            "Okay, your trade has been succesfully cancelled",
            "I cancelled your trade"
        ]
    },
    insufficent_hisMetal: {
        message: [
            "Sorry, but it seems you don't have enough metal in your backpack, I'm cancelling the trade... If you have keys, you can type '#magic <number of keys>' and bot will give you some metal (ex: #magic 1)"
        ]
    },
    insufficent_myMetal: {
        message: [
            "Sorry, but I don't have enough metal to buy your hats, I'm cancelling the trade..."
        ]
    },
    inexistent_hisItem: {
        message: [
            "Sorry, but it seems that one or more items you selected are no more in your backpack..."
        ]
    },
    relog: {
        message: [
            "It seems I have some problems with steam, let me try to relog",
            "Seems I have some problems with steam, wait a second, I'll try to relog",
            "I think I have some problems with steam, hold on, I'm going to relog into steam"
        ]
    },
    trade_me: {
        message: [
            "If you didn't get any trade request, or you weren't able to accept in time, try to invite me to trade.",
            "Did you get my trade request? If not, or you just weren't able to accept my request in time, try to invite me to trade."
        ]
    },
    exited_queue: {
        message: [
            "Oh, It seems you quit the queue.",
            "Oh, It seems you exited the queue..."
        ]
    },
    hello_queue: {
        message: function (user) {
            if (user.behavior.hasOwnProperty("number_of_trades")) {
                var number_of_trades = user.behavior.number_of_trades;
            } else {
                number_of_trades = 0;
            }
            var message = [
                [
                    "Thanks for accepting my invite, As soon as it's your turn I'm going to trade you ;)",
                    "What's up? At the moment there is someone before you in the queue, but I will trade you as soon as it is your turn"
                ], [
                    "Hey! I'll get to you as soon as I can ;)"
                ]
            ];
            if (number_of_trades > 1) {
                return "";
            } else {
                return randomElement(message[number_of_trades]);
            }

        }
    },
    ask_rep: {
        message: function (user) {
            if (typeof user === "undefined") {
                selfie.emit("error", "User is still undefined when asking for rep, not asking", 43);
                return "";
            }
            if (user.hasOwnProperty("behavior") && !user.behavior.hasOwnProperty("repped")) {
                var message = [
                    "Would you like me to leave a +rep on your profile?",
                    "Would you like a +rep on your profile?"
                ];
                return randomElement(message);
            } else {
                return "";
            }
        },
        need_answer: true,
        onAnswer: function (steamid, type) {
            if (type === "boolean_answer_yes") {
                selfie.message(steamid, "yes_rep");
                selfie.users[steamid].behavior.repped = {status: true, when: time()};
                selfie.emit("postProfileComment", steamid, randomElement(message_senteces.rep_comment.message));
                return true;
            } else if (type === "boolean_answer_no") {
                selfie.message(steamid, "no_rep");
                selfie.users[steamid].behavior.repped = {status: false, when: time()};
                return true;
            } else {
                selfie.raw_message(steamid, "Please answer yes or no");
                return false;
            }
        }
    },
    yes_rep: {
        message: [
            "Ok! I left you a +rep comment",
            "Alright, I just left you a nice +rep"
        ]
    },
    no_rep: {
        message: [
            "Okay sorry, I wont post anything on your profile ^^'"
        ]
    },
    rep_comment: {
        message: [
            "+rep | A great individual! We're proud to deliver the best hat prices for you at http://sfuminator.tf/",
            "+rep | Thank you for using our bot and joining our community! A big thank you from http://sfuminator.tf/",
            "+rep | Thank you for being a part of the http://sfuminator.tf/ community! We hope you enjoy our fair prices and plentiful hat stock!",
            "+rep | Enjoy your new items bought from http://sfuminator.tf/",
            "+rep | I would totally invite this handsome lad for dinner at my mother's house! After all, he uses http://sfuminator.tf/ ;)",
            "+rep | This guy understands how easy and fast trading can be! Thank you for using http.//sfuminator.tf/",
            "+rep | What's cooler than a penguin in a disco? This guy! After all, he uses http://sfuminator.tf/",
            "+rep | I'd totally take this lovely fella to a picnic for a few sandviches! After all, he uses http://sfuminator.tf/",
            "+rep | I'm italian and I promise to you, this fella makes the best pasta in the world! After all, he uses http://sfuminator.tf/ Just kidding. I make the best pasta. But he is a good second.",
            "+rep | I'd totally invite him to water my plants while I'm on a vacation. After all, he uses http://sfuminator.tf/"
        ]
    },
    pendingMail_afk_kick: {
        message: [
            "Sorry but it seems that you didn't confirm the mail yet. You have been removed from the queue",
            "Sorry but your mail confirmation took too much. You have been removed from the queue"
        ]
    }
};
var words_to_filter = [
    "anyway"
];
var answer_keywords_all_variations = {};
function randomElement(this_array) {
    return this_array[Math.floor(Math.random() * this_array.length)];
}
function time() {
    return Math.round(new Date().getTime() / 1000);
}
////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////// LOW LEVEL FUNCTIONS AND METHODS
Sfuminator.prototype.addToLogs = function (text, type) {
    if (type !== "errors") {
        selfie.emit("debug", text);
    }
    var time = getNiceDateTime();
    selfie.logs[type] = time + " " + text + "\n" + selfie.logs[type];
};
function arrayCompare(array1, array2) {
    // compare lengths - can save a lot of time 
    if (array1.length !== array2.length) {
        return false;
    }
    for (var i = 0, l = array1.length; i < l; i++) {
        // Check if we have nested arrays
        if (array1[i] instanceof Array && array2[i] instanceof Array) {
            // recurse into the nested arrays
            if (!arrayCompare(array1[i], array2[i]))
                return false;
        }
        else if (array1[i] !== array2[i]) {
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;
        }
    }
    return true;
}
function elementsMissingFrom(objectMain, objectToCheck, myParameters) {
    if (myParameters) {
        var parameters = [];
        if (typeof myParameters === "string") {
            parameters.push(myParameters);
        } else if (myParameters instanceof  Array) {
            parameters = myParameters;
        } else {
            parameters = "error";
        }
    } else {
        parameters = null;
    }
    if (parameters !== "error") {
        var missing = [];
        for (var x in objectToCheck) {
            var main_flag = true;
            for (var y in objectMain) {
                if (parameters) {
                    var parameters_flag = true;
                    for (var z in parameters) {
                        if (objectMain[y][parameters[z]] !== objectToCheck[x][parameters[z]]) {
                            parameters_flag = false;
                            break;
                        }
                    }
                    if (parameters_flag) {
                        main_flag = false;
                        break;
                    }
                } else {
                    if (objectMain[y] === objectToCheck[x]) {
                        main_flag = false;
                        break;
                    }
                }
            }
            if (main_flag) {
                missing.push(objectToCheck[x]);
            }
        }
        return missing;
    } else {
        console.log("elementsMissingFrom: wrong parameters, has to be string array or null!!");
    }
}
function getNiceDateTime(mode, myDate) {
    if (myDate) {
        var date = myDate;
    } else {
        var date = new Date();
    }
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    if (mode) {
        return year + "-" + month + "-" + day;
    } else {
        return year + "/" + month + "/" + day + "_" + hour + ":" + min + ":" + sec;
    }
}
function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(),
            diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
}
function isFunction(functionToCheck) {
    var getType = {};
    return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
}
function logMetalReservations() {
    var reserved_text = "Metal reserved:\n";
    for (var x in metals) {
        for (var y in selfie.backpack.metal[metals[x]]) {
            if (selfie.backpack.metal[metals[x]][y].reserved) {
                reserved_text += "-" + y + " (" + selfie.backpack.items[y].name + ") -> " + selfie.backpack.metal[metals[x]][y].to + "\n";
            }
        }
    }
    console.log(reserved_text);
}
function getCoolJSON(obj) {
    return JSON.stringify(obj, null, "\t");
}

function metal_convertToNiceSentence(scraps) {
    var metal_to_add = metal_convertToOrganic(scraps);
    var additionalInfo = "";
    var delayedCoolizer = "";
    for (var x in metal_to_add) {
        additionalInfo += delayedCoolizer;
        delayedCoolizer = "";
        if (metal_to_add[x] > 0) {
            delayedCoolizer = metal_to_add[x] + " " + x + ", ";
        }
    }
    if (delayedCoolizer !== "") {
        if (additionalInfo !== "") {
            additionalInfo = additionalInfo.slice(0, additionalInfo.length - 2);
            additionalInfo += " and ";
        }
        additionalInfo += delayedCoolizer;
        additionalInfo = additionalInfo.slice(0, additionalInfo.length - 2);
    } else {
        if (additionalInfo !== "") {
            additionalInfo = additionalInfo.slice(0, additionalInfo.length - 2);
        }
    }
    return additionalInfo;
}
function metal_convertToOrganic(scraps) {
    var org_refineds = parseInt(scraps / 9);
    var org_reclaimeds = parseInt((scraps - org_refineds * 9) / 3);
    var org_scraps = scraps - org_refineds * 9 - org_reclaimeds * 3;
    return {refined: org_refineds, reclaimed: org_reclaimeds, scrap: org_scraps};
} //Returns object: {refined: int, reclaimed: int, scrap: int}
function metal_convertToScraps(refineds, reclaimeds, scraps) {
    return refineds * 9 + reclaimeds * 3 + scraps;
}//Returns int scrap quantity

////ERROR CODES
//#1 Not enough metal when reserving
//#2 metal reserved is not corresponding with the metal requested for the reservation
//#3 craftRecipe -> Empty recipe given
//#4 craftRecipe -> Couldn't catch any metal change after 4.5s from crafting 
//#5 startTradeProcedure -> user was not found in the sfr.users object
//#6 normalizeTradeItems -> item to normalize is not a tf2 item
//#7 startAutoSave -> error when autosaving users object
//#8 startAutoSave -> error when autosaving logs
//#9 updateBackpack -> steam server resulted in an empty response
//#10 loadUsers -> unspecified error when concatenating bulk of 100 playerSummaries
//#11 updateUser -> unspecified error when parsing playerSummaries
//#12 addSocketRequest -> impossible to add method: method unextisting, has to be specified in "defineUpdateSocketMethods"
//#13 updateSocketData -> impossible update data: method unextisting, has to be specified in "defineUpdateSocketMethods"
//#14 callSfuminatorAPI -> unable to parse JSON when calling sfuminator api
//#15 callSfuminatorAPI -> server didn't respond after 5 retries
//#16 tradeMetalReserve -> wrong variable type, toReserve or toCancel have to be a steamids array or a steamid string
//#17 socket -> unspecified socket error
//#18 message.trade_wrong_items -> thisTrade.toAdd and thisTrade.toRemove are both not specified, one of them hast to be an integer > 0
//#19 reserveMetal -> User has already a metal reservation, can't reserve
//#21 informSocket -> message requested doens't exist
//#22 startAfkCheck -> function has been already called before stopping it
//#23 startAfkCheck -> during interval check, afkChecking variable has been resetted, can't afkCheck anymore
//#24 (scaled down to type: debug message) trackEvent -> couldn't track user, most likely that steamid was undefined, or passed steamid just doesn't exist in the user list
//#25 tradeOffer -> bad myItems structure, this variable has to be an array of items or a key object: {keyword "", quantity: ""}, can be also null
//#26 tradeOffer -> bad hisItems structure, see #25
//#27 tradeOffer -> wrong keyword for myItems: specified keyword it's not handlet by the system
//#28 tradeOffer -> wrong keyword for hisItems, see #27
//#29 tradeOffer -> unspecified metal quantity
//#30 tradeOffer -> couldn't reserve metal for unable to generate trade offer, further investigation is needed, see if 'reserveMetal' emit any error
//#31 tradeOffer -> Can't send trade offer to user, there is already a pending offer waiting to be accepted/declined sent to him
//#32 metalReserve -> Double check has spotted an error when reserving metal, there is actual some residue metal reservation to thisSteamID
//#40 getAppendableTrade -> object indexed with requested steamid does not exist
//#41 answer -> user 'need_answer' but the type specified is not declared in message_senteces, therfore answer can't be handled
//#42 answer -> user 'need_answer' but the type specified declared in message_senteces has no method onAnswer, therfore answer can't be handled
//#43 ask_rep -> user object is undefined when asking rep, this shouldn't happen, ever! Has to be prevented.
//#45 _getRestructuredItem -> Couldnt restructure to normalized item
//#44 trackEvent -> Fired tracking for undefined steamid
//#45 loadUsers -> Couldn't load friend object from steam api
//#CRITICAL ERRORS
//#1000 reserveMetal -> couldn't reserve metal, id to reserve doesn't exist, maybe the metal you are looking to reserve is no more in the backpack?
//#1001 tradeReady -> my metal is in wrong amount
//#1003 person from queue not removed