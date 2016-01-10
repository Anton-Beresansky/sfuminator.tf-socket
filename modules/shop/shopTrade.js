module.exports = ShopTrade;
var events = require("events");
var Logs = require("../../lib/logs.js");
var ShopItem = require("./inventory/shopItem.js");
var Price = require("../price.js");
var ItemCount = require("./shopItemCount.js");
var TradeConstants = require("../trade/tradeConstants.js");
var SteamTradeOffer = require("../../lib/steamTradeOffer.js");
var SteamTradeError = require("../../lib/steamTradeError.js");
var ShopTradeCurrency = require("./shopTradeCurrency.js");
//Shop Trade Status: hold -> (noFriend) -> active -> sent -> closed/accepted/declined

/**
 * Generic purpose class for Shop Trades
 * @event tradeRequestResponse
 * @event itemsReserved
 * @param {Sfuminator} sfuminator The sfuminator instance
 * @param {User} partner Shop trade partner
 * @returns {ShopTrade}
 * @constructor
 */
function ShopTrade(sfuminator, partner) {
    this.partner = partner;
    this.sfuminator = sfuminator;
    this.shop = sfuminator.shop;
    this.ajaxResponses = sfuminator.responses;
    this.response = this.ajaxResponses.error;
    this.database = new TradeDb(this, sfuminator.db);
    /**
     * @type {ShopItem[]}
     */
    this.assets = [];
    /**
     * @type {ShopTradeCurrency}
     */
    this.currency = new ShopTradeCurrency(this);

    this.log = new Logs({applicationName: "Shop Trade " + this.partner.getSteamid(), color: "green"});
    this._available_modes = ["offer", "manual"];
    this.last_update_date = new Date();
    this.assets_limit = {partner: 20, shop: 20};
    this.steamToken = "";
    this.onceItemsReservedCallbacks = [];
    events.EventEmitter.call(this);

    this._bindHandlers();
}

require("util").inherits(ShopTrade, events.EventEmitter);

ShopTrade.addFriendTimeoutTime = 1000 * 60 * 2; //2 min

ShopTrade.prototype._bindHandlers = function () {
    var self = this;
    this.on("itemsReserved", function () {
        self.itemsReserved = true;
        for (var i = 0; i < self.onceItemsReservedCallbacks.length; i += 1) {
            self.onceItemsReservedCallbacks[i]();
        }
        self.onceItemsReservedCallbacks = [];
    });
    this.on("itemsDereserved", function () {
        self.itemsReserved = false;
    });
};

/**
 * Establish if Shop Trade has been accepted
 * @returns {Boolean}
 */
ShopTrade.prototype.hasBeenAccepted = function () {
    return this.getStatusInfo() === TradeConstants.statusInfo.closed.ACCEPTED;
};

/**
 * Establish if Shop Trade is currently active<br>
 * See ShopTrade.getStatus for more info
 * @returns {Boolean}
 */
ShopTrade.prototype.isActive = function () {
    return this.status && (this.status !== TradeConstants.status.CLOSED || (this.getLastUpdateDate() > new Date(new Date() - this.sfuminator.shopTrade_decay)));
};

/**
 * Establish if Shop Trade is currently closed<br>
 * See ShopTrade.getStatus for more info
 * @returns {Boolean}
 */
ShopTrade.prototype.isClosed = function () {
    return this.status === TradeConstants.status.CLOSED;
};

/**
 * Send Shop Trade to partner<br>
 * Will initiate trade procedures
 */
ShopTrade.prototype.setAsSending = function () {
    if (!this.getMode()) {
        this.log.error("No trade mode set, can't send trade");
    } else if (!this.shop.isBot(this.getAssignedBotUser().getSteamid())) {
        this.log.error("No bot steamid set, can't send trade");
    } else {
        this.setStatus(TradeConstants.status.HOLD);
        this.setStatusInfo("open"); //Are you sure this is needed?
        this.database.save();
        this.log.debug("Sending trade...");
    }
};

ShopTrade.prototype.setAsWaitingForFriendRelation = function () {
    this.setStatus(TradeConstants.status.NO_FRIEND);
    this.setStatusInfo("");
    this.commit();
    var self = this;
    setTimeout(function () {
        //If not friend on steam.............
        if (!self.sfuminator.getBotsController().getBot(self.getAssignedBotUser().getSteamid()).steamClient.isFriend(self.getPartner().getSteamid())) {
            self.emit("friendRequestTimeout");
        }
    }, ShopTrade.addFriendTimeoutTime);
};

ShopTrade.prototype.setAsSent = function (tradeOfferID) {
    this.tradeOfferID = tradeOfferID;
    this.setStatus(TradeConstants.status.SENT);
    this.setStatusInfo(tradeOfferID);
    this.commit();
};

/**
 * Cancel Shop Trade
 * @param {String} [statusInfo]
 */
ShopTrade.prototype.cancel = function (statusInfo) {
    var self = this;
    this.dereserveShopItems();
    if (this.hasSteamTrade()) {
        this.log.debug("Found steamTrade associated, cancelling");
        this.steamTrade.cancel(function () {
            self.unsetSteamTrade();
        });
    }
    this.setStatus(TradeConstants.status.CLOSED);
    if (statusInfo) {
        this.setStatusInfo(statusInfo);
    } else {
        this.setStatusInfo(TradeConstants.statusInfo.closed.CANCELLED);
    }
    this.commit();
    this.log.debug("Trade " + this.getID() + " has been cancelled");
};

/**
 * Mark Shop Trade as accepted
 */
ShopTrade.prototype.setAsAccepted = function () {
    this.unsetSteamTrade();
    this.setStatus(TradeConstants.status.CLOSED);
    this.setStatusInfo(TradeConstants.statusInfo.closed.ACCEPTED);
    this.commit();
    this.log.debug("Trade " + this.getID() + " has been accepted");

    //Old interface porting
    this.sfuminator.botPorting.increaseHatTradeCount(this.getPartner().getSteamid());
    this.sfuminator.botPorting._anticipateItemRemoval(this);
};

/**
 * Will propagate status changes also on database
 * @param {Function} [callback] If passed, will be executed after database query
 * has been completed. No data will be returned.
 */
ShopTrade.prototype.commit = function (callback) {
    if (isNaN(this.getID())) {
        this.log.error("Can't commit trade changes, no trade id associated");
    } else {
        this.database.update(callback);
    }
};

/**
 * @param {SteamTradeOffer} steamTrade
 */
ShopTrade.prototype.injectSteamTrade = function (steamTrade) {
    this.steamTrade = steamTrade;
    for (var i = 0; i < this.assets.length; i += 1) {
        if (this.assets[i].isMineItem()) {
            this.steamTrade.addThemItem(this.assets[i].getTradeOfferAsset());
        } else {
            this.steamTrade.addMyItem(this.assets[i].getTradeOfferAsset());
        }
    }
};

/**
 * @returns {SteamTradeOffer|*}
 */
ShopTrade.prototype.getSteamTrade = function () {
    return this.steamTrade;
};

ShopTrade.prototype.hasSteamTrade = function () {
    return this.steamTrade instanceof SteamTradeOffer;
};

ShopTrade.prototype.unsetSteamTrade = function () {
    this.steamTrade = null;
};

/**
 * Get client formatted changes of this Shop Trade
 * @param {Date|Number} last_update_date Specify changes starting point
 * @returns {Object|Boolean} Will return false if invalid date is given.
 * <br>Object will have the following structure: <br>
 * {<br>
 * &nbsp;status: String,<br>
 * &nbsp;statusInfo: String,<br>
 * &nbsp;last_update_date: Number<br>
 * }
 */
ShopTrade.prototype.getClientChanges = function (last_update_date) {
    last_update_date = new Date(last_update_date);
    if (last_update_date.toString() !== "Invalid Date") {
        if (this.getLastUpdateDate() > last_update_date) {
            return {
                status: this.getStatus(),
                statusInfo: this.getStatusInfo(),
                last_update_date: this.getLastUpdateDate().getTime()
            };
        }
    }
    return false;
};

/**
 * Shop Trade value
 * @returns {{botSteamid: String, partnerID: String, mode: ShopTrade.mode, status: String, statusInfo: String, last_update_date: number, items: {me: ShopTradeAssetDataStructure[], them: ShopTradeAssetDataStructure[], full_list: SectionItemDataStructure[]}}}
 */
ShopTrade.prototype.valueOf = function () {
    return {
        botSteamid: this.getAssignedBotUser().getSteamid(),
        partnerID: this.getPartner().getSteamid(),
        mode: this.getMode(),
        status: this.getStatus(),
        statusInfo: this.getStatusInfo(),
        last_update_date: this.getLastUpdateDate().getTime(),
        items: this.getPlate()
    };
};

/**
 * Load Shop Trade from database<br>
 * Setting trade id is needed
 * @param {Function} [callback] If given, will be executed on loaded.
 * Self is passed.
 */
ShopTrade.prototype.load = function (callback) {
    var self = this;
    this.database.load(function (rows) {
        var trade = rows[0];
        self.setID(trade.id);
        self.setStatus(trade.status);
        self.setStatusInfo(trade.status_info);
        self.setMode(trade.mode);
        self.setBot(self.sfuminator.users.get(trade.bot_steamid));
        var items = {};
        for (var i = 0; i < rows.length; i += 1) {
            var iRow = rows[i];
            if (items.hasOwnProperty(iRow.shop_type)) {
                items[iRow.shop_type].push(iRow.shop_id);
            } else {
                items[iRow.shop_type] = [iRow.shop_id];
            }
        }
        self.setItems(items);
        self.log.debug("Loaded items: " + JSON.stringify(items), 0);
        self.verifyItems(function (success) {
            self.log.debug("Loaded trade " + self.getID() + ", verification success: " + ((success) ? success : JSON.stringify(self.response)));
            self.logAssets();
            if (typeof callback === "function") {
                callback(self);
            }
            if (!success) {
                self.log.warning("Assets list is empty, considering trade as accepted");
                self.setAsAccepted();
                self.log.warning("Cancelling reservations...");
                for (var section in items) {
                    for (var i = 0; i < items[section].length; i += 1) {
                        self.shop.reservations.cancel(items[section][i]);
                    }
                }
            }
        });
    });
};

/**
 * Verify that set items can be shop traded
 * @param {Function} callback When executed will pass a Boolean value
 * that establish if items are valid.
 */
ShopTrade.prototype.verifyItems = function (callback) {
    var self = this;
    this.emptyAssets();
    this.log.debug("Verifying items");
    for (var section in this.items) {
        if (this.shop.sectionExist(section) && this.items[section] instanceof Array) {
            for (var i = 0; i < this.items[section].length; i += 1) {
                if (this.verifyShopItem(this.items[section][i], section)) {
                    this.assets.push(this.shop.inventory.getItem(this.items[section][i]));
                } else {
                    callback(false);
                    return;
                }
            }
        } else if (section !== "mine") {
            this.response = this.ajaxResponses.sectionNotFound;
            this.emit("tradeRequestResponse", this.response);
            callback(false);
            return;
        }
    }
    if (this.getShopItemCount() > this.assets_limit.shop) {
        this.response = this.ajaxResponses.shopAssetsLimit(this.assets_limit.shop);
        this.emit("tradeRequestResponse", this.response);
        callback(false);
        return;
    }
    if (this.items.hasOwnProperty("mine") && this.items.mine instanceof Array) {
        this.verifyMineItems(function (success) {
            if (success) {
                self._verifyItemsFinalStep(callback);
            } else {
                callback(false);
            }
        }, function (item) {
            var shopItem = new ShopItem(self.shop, item);
            shopItem.setAsMineSection();
            self.assets.push(shopItem);
        });
    } else {
        this._verifyItemsFinalStep(callback);
    }
};

ShopTrade.prototype._verifyItemsFinalStep = function (callback) {
    this.currency.loadAssets(); //If I don't put this it will think balance is still 0 :(
    if (this.getPartner().getTF2Backpack().getCurrencyAmount() < this.currency.getSignedTradeBalance()) {
        this.response = this.ajaxResponses.notEnoughCurrency;
        this.emit("tradeRequestResponse", this.response);
        callback(false);
    } else {
        callback(true);
    }
};

/**
 * Get partner items count of this Shop Trade
 * @returns {Number}
 */
ShopTrade.prototype.getPartnerItemCount = function () {
    var count = 0;
    for (var i = 0; i < this.assets.length; i += 1) {
        if (this.assets[i].getItem().getOwner() === this.getPartner().getSteamid()) {
            count += 1;
        }
    }
    return count;
};

/**
 * Get shop items count of this Shop Trade
 * @returns {Number}
 */
ShopTrade.prototype.getShopItemCount = function () {
    return this.assets.length - this.getPartnerItemCount();
};

ShopTrade.prototype.areItemsReserved = function () {
    return this.itemsReserved === true;
};

ShopTrade.prototype.reserveItems = function () {
    var self = this;
    this.currency.on("reserved", function () {
        self.log.debug("Items have been reserved");
        self.emit("itemsReserved");
    });

    this.reserveShopItems();
    this.currency.reserve(); //Used for botsController
    //self.emit("itemsReserved"); //Used only for core.js
};

ShopTrade.prototype.onceItemsReserved = function (callback) {
    this.onceItemsReservedCallbacks.push(callback);
};

/**
 * Reserve shop items for Shop Trade partner
 */
ShopTrade.prototype.reserveShopItems = function () {
    this.log.debug("Reserving items", 3);
    this.logAssets(3);
    for (var i = 0; i < this.assets.length; i += 1) {
        if (!this.assets[i].isMineItem()) {
            this.shop.reservations.add(this.getPartner().getSteamid(), this.assets[i].getID());
        }
    }
};

/**
 * Remove reservation from shop items of this Shop Trade
 * @returns {undefined}
 */
ShopTrade.prototype.dereserveShopItems = function () {
    this.log.debug("Dereserving items", 3);
    this.logAssets(3);
    for (var i = 0; i < this.assets.length; i += 1) {
        this.log.debug("Checking if reservation for #" + this.assets[i].getID() + " exist", 1);
        if (this.shop.reservations.exist(this.assets[i].getID())) {
            this.log.debug("Yes, cancelling", 1);
            this.shop.reservations.cancel(this.assets[i].getID());
        }
    }
    this.emit("itemsDereserved");
};

/**
 * Get Trade Shop plate
 * (me = shop item list, them = partner item list, full_list = shop + partner shop formatted item list)
 * @returns {{me: ShopTradeAssetDataStructure[], them: ShopTradeAssetDataStructure[], full_list: ShopItemDataStructure[]}}
 */
ShopTrade.prototype.getPlate = function () {
    var plate = {me: [], them: [], full_list: []};
    for (var i = 0; i < this.assets.length; i += 1) {
        if (!this.assets[i].isCurrency()) {
            if (this.assets[i].isMineItem()) {
                plate.them.push(new ShopTradeAssetDataStructure(this.assets[i]));
            } else {
                plate.me.push(new ShopTradeAssetDataStructure(this.assets[i]));
            }
            plate.full_list.push(this.assets[i].valueOf());
        }
    }
    return plate;
};

/**
 * Get partner
 * @returns {User}
 */
ShopTrade.prototype.getPartner = function () {
    return this.partner;
};

/**
 * Set bot steamid assigned to this Shop Trade
 * @param {User} bot
 */
ShopTrade.prototype.setBot = function (bot) {
    this.bot = bot;
};

/**
 * Get bot steamid assigned to this Shop Trade
 * @returns {User}
 */
ShopTrade.prototype.getAssignedBotUser = function () {
    return this.bot;
};

/**
 * @returns {ShopTradeCurrency}
 */
ShopTrade.prototype.getCurrencyHandler = function () {
    return this.currency;
};

/**
 * Get Shop Trade id
 * @returns {Number}
 */
ShopTrade.prototype.getID = function () {
    return this.id;
};

/**
 * Get Shop Trade Status
 * Legend:
 * - Hold:[info] => Trade is being processed
 * - Active => Trade is being made
 * - Sent:[info] => Trade has been sent
 * - Accepted => Trade has been accepted by partner
 * - Declined => Trade has been declined by partner
 * - Closed:[info] => Trade ended for other causes
 *
 * [info] tags indicate a StatusInfo associated, see getStatusInfo for more
 * @returns {String}
 */
ShopTrade.prototype.getStatus = function () {
    return this.status;
};

/**
 * Get Shop Trade Status Info
 * Legend:
 * - Hold.noFriend => Partner has to accept friend request
 * - Sent.[String] => Steam trade id of this Shop Trade
 * - Closed.cancelled => Trade has been cancelled
 * - Closed.error => Most likely steam errored
 * - Closed.afk => Partner didn't accept in time
 * @returns {String}
 */
ShopTrade.prototype.getStatusInfo = function () {
    return this.status_info;
};

/**
 * Get Shop Trade Mode (see ShopTrade._available_modes)
 * @returns {ShopTrade.mode}
 */
ShopTrade.prototype.getMode = function () {
    return this.mode;
};

/**
 * Set Shop Trade id
 * @param {Number} id
 * @returns {undefined}
 */
ShopTrade.prototype.setID = function (id) {
    this.id = id;
};

/**
 * Set Shop Trade Status
 * @param {String} status
 */
ShopTrade.prototype.setStatus = function (status) {
    this.status = status;
    this.setLastUpdateDate(new Date());
};

/**
 * Set Shop Trade Status Info
 * @param {String} status_info
 */
ShopTrade.prototype.setStatusInfo = function (status_info) {
    this.status_info = status_info;
    this.setLastUpdateDate(new Date());
};

/**
 * Set Shop Trade Mode<br>
 * Applied only if mode exist (see ShopTrade._available_modes).
 * @param {String} mode
 */
ShopTrade.prototype.setMode = function (mode) {
    if (this.modeExist(mode)) {
        this.mode = mode;
    }
};

/**
 * Establish if specified mode exist
 * @param {String} mode
 * @returns {Boolean}
 */
ShopTrade.prototype.modeExist = function (mode) {
    for (var i = 0; i < this._available_modes.length; i += 1) {
        if (this._available_modes[i] === mode) {
            return true;
        }
    }
    return false;
};

/**
 * Set Items of this Shop Trade
 * @param {Object} items List of item ids indexed by shop section type
 */
ShopTrade.prototype.setItems = function (items) {
    this.items = items;
};

/**
 * Set when last Shop Trade change occurred<br>
 * Method hiddenly checks if user has accepted shop trade to update his backpack
 * @param {Date|Number} updateDate
 */
ShopTrade.prototype.setLastUpdateDate = function (updateDate) {
    updateDate = new Date(updateDate);
    if (updateDate.toString() !== "Invalid Date") {
        this.last_update_date = updateDate;
        if (this.hasBeenAccepted()) { //Force refresh user backpack if trade has been accepted
            var self = this;
            setTimeout(function () {
                self.getPartner().getTF2Backpack().get();
            }, 10000);
        }
    }
};

/**
 * Get when last Shop Trade change occurred
 * @returns {Date}
 */
ShopTrade.prototype.getLastUpdateDate = function () {
    return this.last_update_date;
};

/**
 * Verify if shop section item can be traded given its id and section
 * @param {Number} idToCheck
 * @param {String} section
 * @returns {Boolean}
 */
ShopTrade.prototype.verifyShopItem = function (idToCheck, section) {
    if (!this.shop.sections[section].itemExist(idToCheck)) {
        this.response = this.ajaxResponses.itemsSelectedNotFound;
        this.emit("tradeRequestResponse", this.response);
        return false;
    }
    if (this.shop.reservations.exist(idToCheck) && this.shop.reservations.get(idToCheck).getHolder() !== this.getPartner().getSteamid()) {
        this.response = this.ajaxResponses.itemIsAlreadyReserved;
        this.emit("tradeRequestResponse", this.response);
        return false;
    }
    return true;
};

/**
 * Verify if partner items can be traded
 * @param {Function} callback Will pass a Boolean value establish verification success
 * @param {Function} onAcceptedItem
 * Executed every time a item has been accepted as tradable, TF2Item is passed.
 */
ShopTrade.prototype.verifyMineItems = function (callback, onAcceptedItem) {
    var self = this;
    var itemCount = new ItemCount();
    this.getPartner().getTF2Backpack().getCached(function (backpack) {
        for (var i = 0; i < self.items.mine.length; i += 1) {
            var itemID = self.items.mine[i];
            var item = backpack.getItem(itemID);
            if (!backpack.itemExist(itemID)) {
                self.response = self.ajaxResponses.itemNotFound;
                self.emit("tradeRequestResponse", self.response);
                callback(false);
                return;
            } else if (!self.shop.canBeSold(item)) {
                self.response = self.ajaxResponses.itemCantBeSold;
                self.emit("tradeRequestResponse", self.response);
                callback(false);
                return;
            } else {
                onAcceptedItem(item);
                itemCount.add(item);
                var netCount = (itemCount.get(item) + self.shop.count.get(item)) - self.shop.getLimit(item);
                if (netCount > 0) {
                    self.response = self.ajaxResponses.itemExceedCount(item, netCount);
                    self.emit("tradeRequestResponse", self.response);
                    callback(false);
                    return;
                }
            }
        }
        if (self.getPartnerItemCount() > self.assets_limit.partner) {
            self.response = self.ajaxResponses.partnerAssetsLimit(self.assets_limit.partner);
            self.emit("tradeRequestResponse", self.response);
            callback(false);
            return;
        }
        callback(true);
    });
};

/**
 * Empty Shop Trade Assets
 */
ShopTrade.prototype.emptyAssets = function () {
    this.assets = [];
};

/**
 * Get Shop Trade Assets
 * @returns {ShopItem[]}
 */
ShopTrade.prototype.getAssets = function () {
    return this.assets;
};

/**
 * Get Shop Trade Asset
 * @parameter {Number} Item id
 * @returns {ShopItem|null}
 */
ShopTrade.prototype.getAsset = function (id) {
    for (var i = 0; i < this.assets.length; i += 1) {
        if (this.assets[i].getItem().getID() === id) {
            return this.assets[i];
        }
    }
    return null;
};

/**
 * Print assets on console
 * @param {Number} [level] Define debug level
 */
ShopTrade.prototype.logAssets = function (level) {
    var self = this;
    this.log.debug("Assets: " + (function () {
            var result = "";
            for (var i = 0; i < self.assets.length; i += 1) {
                result += JSON.stringify(self.assets[i].valueOf()) + "\n";
            }
            return result;
        }()), level);
};

/**
 * @returns {String}
 */
ShopTrade.prototype.getSteamToken = function () {
    return this.steamToken;
};

/**
 * @param {String} token
 */
ShopTrade.prototype.setSteamToken = function (token) {
    this.steamToken = token;
};

ShopTrade.prototype.hasSteamToken = function () {
    return this.steamToken !== "";
};

/**
 * Shop Trade Asset data structure
 * @param {ShopItem} shopItem
 * @returns {ShopTradeAssetDataStructure}
 */
function ShopTradeAssetDataStructure(shopItem) {
    this.id = shopItem.getID();
    this.name = shopItem.getItem().getFullName();
    this.level = shopItem.getItem().getLevel();
    this.quality = shopItem.getItem().getQuality();
    this.defindex = shopItem.getItem().getDefindex();
    this.scrapPrice = shopItem.getPrice().toScrap();
    this.section = shopItem.getSectionID();
}

/**
 * General purpose Shop Trade Database interface
 * @param {ShopTrade} trade
 * @param {Database} db Database instance
 * @returns {TradeDb}
 */
function TradeDb(trade, db) {
    this.trade = trade;
    this.db = db;
    this.log = new Logs({
        applicationName: "TradeDB " + this.trade.getPartner().getSteamid(),
        color: "green",
        dim: true
    });
}

/**
 * Read Shop Trade from database
 * @param {Function} callback Will pass shop_trades columns
 */
TradeDb.prototype.load = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getLoadQuery(), function (result) {
            connection.release();
            if (result && result instanceof Array && result[0]) {
                self.log.debug("Loading trade...");
                callback(result);
            }
        });
    });
};

/**
 * Save Shop Trade on Database
 */
TradeDb.prototype.save = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query(self._getSaveQuery(), function (result) {
                self.trade.setID(result.insertId);
                self.log.debug("Saving trade: " + self.trade.getID());
                connection.query(self._getSaveItemsQuery(), function () {
                    connection.commitRelease();
                });
            });
        });
    });
};

/**
 * Update database saved Shop Trade
 * @param {Function} [callback] Executed after query has been completed
 */
TradeDb.prototype.update = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self._getUpdateQuery(), function () {
            connection.release();
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};
TradeDb.prototype._getUpdateQuery = function () {
    return "UPDATE `shop_trades` SET "
        + "status='" + this.trade.getStatus() + "',"
        + "status_info='" + this.trade.getStatusInfo() + "' WHERE id=" + this.trade.getID();
};
TradeDb.prototype._getLoadQuery = function () {
    var additionalIdentifier = "";
    if (!isNaN(this.trade.getID())) {
        additionalIdentifier = "AND id=" + this.trade.getID();
    }
    return "SELECT `id`,`steamid`,`bot_steamid`,`mode`,`status`,`status_info`, `item_id`, `shop_id`, `shop_type`, `scrapPrice`, `last_update_date` FROM "
        + "(SELECT `id`,`steamid`,`mode`,`status`,`status_info`,`last_update_date`,`bot_steamid` FROM shop_trades WHERE steamid='" + this.trade.getPartner().getSteamid() + "' " + additionalIdentifier + " ORDER BY last_update_date DESC LIMIT 1) as myTrade "
        + "JOIN shop_trade_items ON myTrade.id=shop_trade_items.trade_id ";
};
TradeDb.prototype._getSaveQuery = function () {
    return "INSERT INTO `shop_trades` (`steamid`,`mode`,`status`,`status_info`,`bot_steamid`) VALUES ("
        + "'" + this.trade.getPartner().getSteamid() + "',"
        + "'" + this.trade.getMode() + "',"
        + "'" + this.trade.getStatus() + "',"
        + "'" + this.trade.getStatusInfo() + "',"
        + "'" + this.trade.getAssignedBotUser().getSteamid() + "'"
        + ");";
};
TradeDb.prototype._getSaveItemsQuery = function () {
    if (!isNaN(this.trade.getID())) {
        var query = "INSERT INTO `shop_trade_items` (`trade_id`,`item_id`,`shop_id`,`shop_type`,`scrapPrice`) VALUES ";
        var assets = this.trade.getAssets();
        for (var i = 0; i < assets.length; i += 1) {
            var asset = assets[i];
            query += "(" + this.trade.getID() + "," + asset.getItem().getID() + "," + asset.getID() + ",'" + asset.getSectionID() + "'," + asset.getPrice().toScrap() + "), ";
        }
        return query.slice(0, query.length - 2) + " ON DUPLICATE KEY UPDATE item_id=VALUES(item_id)";
    } else {
        this.log.error("Can't save trade items on database, missing trade_id");
    }
};