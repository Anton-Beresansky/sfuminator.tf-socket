module.exports = ShopTrade;
var events = require("events");
var Logs = require("../../lib/logs.js");
var ShopItem = require("./inventory/shopItem.js");
var Market = require("../market.js");
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
 * @event newStatus
 * @event newStatusInfo
 * @param {Sfuminator} sfuminator The sfuminator instance
 * @param {User} partner Shop trade partner
 * @returns {ShopTrade}
 * @constructor
 */
function ShopTrade(sfuminator, partner) {
    this.partner = partner;
    /**
     * @type {Sfuminator}
     */
    this.sfuminator = sfuminator;
    /**
     * @type {Shop}
     */
    this.shop = sfuminator.shop;
    /**
     * @type {Market}
     */
    this.market = this.shop.market;
    this.ajaxResponses = sfuminator.responses;
    this.response = null;
    this.database = new TradeDb(this, sfuminator.db);
    this.items = {};
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
    this.assets_limit = {partner: 40, shop: 40, max_key_price: 100};
    this.itemsReserved = false;
    this.itemsReady = false;
    this.tradeType = ShopTrade.TYPE.NORMAL;
    this.onceItemsReservedCallbacks = [];
    this.onceItemsAreReadyCallbacks = [];
    this.clientChangeError = null;
    events.EventEmitter.call(this);

    this._bindHandlers();
}

require("util").inherits(ShopTrade, events.EventEmitter);

ShopTrade.addFriendTimeoutTime = 1000 * 60 * 2; //2 min

ShopTrade.TYPE = {
    NORMAL: 0,
    MARKET: 1,
    WITHDRAW: 2
};

ShopTrade.prototype._bindHandlers = function () {
    var self = this;
    this.on("itemsReserved", function () {
        self.log.debug("Items have been reserved");
        self.itemsReserved = true;
        for (var i = 0; i < self.onceItemsReservedCallbacks.length; i += 1) {
            self.onceItemsReservedCallbacks[i]();
        }
        self.onceItemsReservedCallbacks = [];
    });
    this.on("itemsDereserved", function () {
        self.log.debug("Items have been dereserved");
        self.itemsReserved = false;
    });
    this.on("itemsTransferred", function () {
        self.log.debug("Items have been transferred");
        self.itemsReady = true;
        for (var i = 0; i < self.onceItemsAreReadyCallbacks.length; i += 1) {
            self.onceItemsAreReadyCallbacks[i]();
        }
        self.onceItemsAreReadyCallbacks = [];
    });
    this.on("tradeRequestResponse", function (requestResponse) {
        self.response = requestResponse;
        this.cancel();
    });
};

ShopTrade.prototype.setTradeType = function (type) {
    this.tradeType = type;
};

ShopTrade.prototype.setAsWithdrawTrade = function () {
    this.tradeType = ShopTrade.TYPE.WITHDRAW;
};

ShopTrade.prototype.isWithdrawTrade = function () {
    return this.tradeType === ShopTrade.TYPE.WITHDRAW;
};

ShopTrade.prototype.setAsMarketTrade = function (prices) {
    this.marketPrices = prices;
    this.tradeType = ShopTrade.TYPE.MARKET;
};

ShopTrade.prototype.isMarketTrade = function () {
    return this.tradeType === ShopTrade.TYPE.MARKET;
};

ShopTrade.prototype.isNormalTrade = function () {
    return this.tradeType === ShopTrade.TYPE.NORMAL;
};

ShopTrade.prototype.consolidate = function (callback) {
    this.database.save(function () {
        callback();
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
        this.commit();
        if (this.isMarketTrade()) {
            this.market.importItems(this.getAssets(), Market.ITEM_STATUS.IN_TRANSIT);
        }
        this.log.debug("Sending trade...");
    }
};

ShopTrade.prototype.setAsMaking = function () {
    this.setStatus(TradeConstants.status.ACTIVE);
    this.commit();
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
    this.setStatus(TradeConstants.status.CLOSED);
    if (statusInfo) {
        this.setStatusInfo(statusInfo);
    } else {
        this.setStatusInfo(TradeConstants.statusInfo.closed.CANCELLED);
    }
    this.clientChangeError = this._parseClientChangeError();
    this.commit();
    if (this.hasSteamTrade()) {
        this.log.debug("Found steamTrade associated, cancelling");
        this.steamTrade.cancel(function () {
            self.unsetSteamTrade();
        });
    }
    if (this.transferNeeded) {
        if (!this.transferCluster.isCompleted()) {
            this.log.debug("Cancelling transfer node");
            for (var i = 0; i < this.transferCluster.nodes; i += 1) {
                if (!this.transferCluster.nodes[i].isFinished()) {
                    this.transferCluster.nodes[i].senderOffer.cancel();
                }
            }
        }
    }
    if (this.isMarketTrade()) {
        this.market.cancelInTransitItems(this.getAssets());
    }
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

    //If market -> store market item somehow
    var assets = this.getAssets(), i;
    if (this.isMarketTrade()) {
        this.setMarketItemsAsAvailable();
    } else if (this.isWithdrawTrade()) {
        this.setMarketItemsAsWithdrawn();
        if ((this.getCurrencyHandler().forcedBalance + this.withdrawableAssetsScrapValue) !== 0) {
            if (JSON.stringify(this.items) !== "{}") {
                this.log.error("NOPE, after withdrawing items we are updating wallet as well!?");
                this.log.error("Items: " + JSON.stringify(this.items));
                this.log.test("Forced balance: " + this.getCurrencyHandler().forcedBalance + " Assets: " + this.withdrawableAssetsScrapValue);
            }
            this.getPartner().getWallet().updateBalance(this.getCurrencyHandler().forcedBalance + this.withdrawableAssetsScrapValue);
        } else {
            this.log.test("All good balance is 0ed");
        }
    } else { //Add up to wallet balance only if trade is NOT Market trade or Withdraw trade
        this.setMarketItemsAsSold();
        this.log.debug("Shop trade used wallet: " + this.walletFunds);
        this.getPartner().getWallet().updateBalance(-this.walletFunds);
    }
};

ShopTrade.prototype.setMarketItemsAsSold = function () {
    for (var shop in this.items) {
        for (var i = 0; i < this.items[shop].length; i += 1) {
            var itemID = this.items[shop][i];
            var marketItem = this.market.getItem(itemID);
            if (marketItem) {
                if (this.getPartner().getSteamid() === marketItem.getMarketer()) {
                    marketItem.setAsWithdrawn();
                    this.log.error("This shouldn't verify! Setting item as 'withdrawn' on a SHOP trade");

                } else {
                    this.log.debug("Set item " + marketItem.getID() + " as sold");
                    marketItem.setAsSold();
                }
            }
        }
    }
};

ShopTrade.prototype.setMarketItemsAsWithdrawn = function () {
    for (var shop in this.items) {
        for (var i = 0; i < this.items[shop].length; i += 1) {
            var itemID = this.items[shop][i];
            var marketItem = this.market.getItem(itemID);
            if (marketItem) {
                if (this.getPartner().getSteamid() === marketItem.getMarketer()) {
                    marketItem.setAsWithdrawn();
                    this.log.debug("Set item " + marketItem.getID() + " as withdrawn");
                } else {
                    this.log.error("This shouldn't verify! Setting item as 'sold' on a WITHDRAW trade");
                    marketItem.setAsSold();
                }
            } else {
                this.log.error("No marketed item in withdraw... wut?");
            }
        }
    }
};

ShopTrade.prototype.setMarketItemsAsAvailable = function () {
    for (var shop in this.items) {
        for (var i = 0; i < this.items[shop].length; i += 1) {
            var itemID = this.items[shop][i];
            var marketItem = this.market.getItem(itemID);
            if (marketItem) {
                marketItem.setAsAvailable();
            } else {
                this.log.error("No market item in market trade... wut?");
            }
        }
    }
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
        if (this.assets[i].isPartnerItem()) {
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
            var result = {
                status: this.getStatus(),
                statusInfo: this.getStatusInfo(),
                last_update_date: this.getLastUpdateDate().getTime()
            };
            if (this.clientChangeError) {
                result.error = this.clientChangeError;
            }
            if (this.getStatusInfo() === TradeConstants.statusInfo.closed.ACCEPTED) {
                result.wallet = this.getPartner().getWallet().getBalance().toScrap();
            }
            var additional = this.getClientChangesAdditional();
            if (additional) {
                result.additional = additional;
            }
            return result;
        }
    }
    return false;
};

ShopTrade.prototype.getClientChangesAdditional = function () {
    var additional = null;
    if (this.getStatus() === TradeConstants.status.NO_FRIEND) {
        additional = {
            assignedBot: {
                steamid: this.getAssignedBotUser().getSteamid(),
                username: this.getAssignedBotUser().getName()
            }
        };
    }
    return additional;
};

/**
 * Shop Trade value
 * @returns {{botSteamid: String, partnerID: String, mode: ShopTrade.mode, status: String, statusInfo: String, last_update_date: number, items: {me: ShopTradeAssetDataStructure[], them: ShopTradeAssetDataStructure[], full_list: SectionItemDataStructure[]}}}
 */
ShopTrade.prototype.valueOf = function () {
    var result = {
        botSteamid: this.getAssignedBotUser().getSteamid(),
        botUsername: this.getAssignedBotUser().getName(),
        partnerID: this.getPartner().getSteamid(),
        mode: this.getMode(),
        trade_type: this.trade_type,
        status: this.getStatus(),
        statusInfo: this.getStatusInfo(),
        last_update_date: this.getLastUpdateDate().getTime(),
        items: this.getPlate(),
        currency: this.shop.tf2Currency.valueOf(),
        wallet: this.getPartner().getWallet().getBalance().toScrap()
    };
    if (this.isMarketTrade()) {
        result.market_ratio = this.shop.getMarketRatio();
    }
    return result;
};

/**
 * Load Shop Trade from database<br>
 * Setting trade id is needed
 * @param {Function} [callback] If given, will be executed on loaded.
 * Self is passed.
 */
ShopTrade.prototype.load = function (callback) {
    var self = this;
    this.getPartner().onceLoaded(function () {
        self.database.load(function (rows) {
            var trade = rows[0];
            self.setID(trade.id);
            self.setStatus(trade.status);
            self.setStatusInfo(trade.status_info);
            self.setMode(trade.mode);
            self.setBot(self.sfuminator.users.get(trade.bot_steamid));
            self.setTradeType(trade.trade_type);
            self.getCurrencyHandler().forceStartingBalance(new Price(trade.forced_balance, "scrap"));
            if (trade.forced_balance !== 0) {
                self.log.debug("Set forced balance: " + trade.forced_balance);
            }
            var items = {};
            for (var i = 0; i < rows.length; i += 1) {
                var iRow = rows[i];
                if (iRow.shop_id) {
                    if (items.hasOwnProperty(iRow.shop_type)) {
                        items[iRow.shop_type].push(iRow.shop_id);
                    } else {
                        items[iRow.shop_type] = [iRow.shop_id];
                    }
                }
            }
            self.setItems(items);
            self.log.debug("Loaded items: " + JSON.stringify(items), 0);
            if (self.isMarketTrade()) {
                self.setAsMarketTrade(self.market.getShopTradePrices(items.market));
                self.log.debug("Setting market trade: " + JSON.stringify(self.marketPrices));
            }
            if (self.isWithdrawTrade()) { //Rebuild withdrawableAssetsScrapValue
                self.log.debug("Is withdraw trade, rebuilding withdrawable assets scrap value");
                self.withdrawableAssetsScrapValue = 0;
                for (var shop in items) {
                    for (i = 0; i < items[shop].length; i += 1) {
                        var itemID = items[shop][i];
                        var marketItem = self.market.getItem(itemID);
                        if (marketItem) {
                            self.withdrawableAssetsScrapValue += marketItem.getPrice().toScrap();
                        } else {
                            this.log.error("No marketed item in withdraw... wut? (when building withdrawable assets value)");
                        }
                    }
                }
                self.log.debug("Rebuilt: " + self.withdrawableAssetsScrapValue);
            }
            self.verifyItems(function (success) {
                self.log.debug("Loaded trade " + self.getID() + ", verification success: " + ((success) ? success : JSON.stringify(self.response)));
                self.logAssets();
                if (self.isNormalTrade()) {
                    self.walletFunds = Math.abs(trade.forced_balance);
                    self.log.debug("Set wallet funds to: " + self.walletFunds + " -> bypassing wallet injector since we already forced the balance");
                }
                if (typeof callback === "function") {
                    callback(self);
                }
                if (self.assets.length === 0) {
                    self.log.warning("Assets list is empty, considering trade as accepted");
                    self.setAsAccepted();
                    self.log.warning("Cancelling reservations...");
                    for (var section in items) {
                        for (var i = 0; i < items[section].length; i += 1) {
                            self.shop.reservations.cancel(items[section][i]);
                        }
                    }
                } else {
                    self.sfuminator.getBotsController().getBot(self.getAssignedBotUser().getSteamid()).injectLoadedShopTrade(self);
                }
            });
        });
    });
};

/**
 * @returns {Price}
 */
ShopTrade.prototype.getAssetsPrice = function () {
    var scrapPrice = 0;
    for (var i = 0; i < this.assets.length; i += 1) {
        scrapPrice += this.assets[i].getPrice().toScrap();
    }
    return new Price(scrapPrice, Price.SCRAP_METAL);
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

ShopTrade.prototype.readyItems = function () {
    var self = this;
    this.onceItemsReserved(function () {
        var assetsToTransfer = self.getItemsToTransfer();
        self.transferNeeded = assetsToTransfer.length > 0;
        if (self.transferNeeded) {
            self.setStatusInfo(TradeConstants.statusInfo.active.TRANSFERRING);
            self.commit();
            var assignedTraderBot = self.sfuminator.getBotsController().getBot(self.getAssignedBotUser().getSteamid());
            self.transferCluster = self.sfuminator.getBotsController().transfer(assignedTraderBot, assetsToTransfer, function (err) {
                if (!err) {
                    self.emit("itemsTransferred");
                } else {
                    self.emit("tradeRequestResponse", self.sfuminator.responses.cannotGatherItems);
                }
            });
        } else {
            self.emit("itemsTransferred");
        }
    });
    if (this.getCurrencyHandler().weHaveEnoughCurrency()) {
        this.reserveItems();
    } else {
        this.emit("tradeRequestResponse", self.sfuminator.responses.notEnoughShopCurrency);
    }
};

ShopTrade.prototype.areItemsReserved = function () {
    return this.itemsReserved === true;
};

ShopTrade.prototype.areItemsReady = function () {
    return this.itemsReady === true;
};

ShopTrade.prototype.reserveItems = function () {
    var self = this;
    this.currency.on("reserved", function () {
        self.emit("itemsReserved");
    });

    this.reserveShopItems();
    this.currency.reserve(); //Used for botsController
    //self.emit("itemsReserved"); //Used only for core.js
};

ShopTrade.prototype.onceItemsReserved = function (callback) {
    this.onceItemsReservedCallbacks.push(callback);
};

ShopTrade.prototype.onceItemsAreReady = function (callback) {
    this.onceItemsAreReadyCallbacks.push(callback);
};

/**
 * Reserve shop items for Shop Trade partner
 */
ShopTrade.prototype.reserveShopItems = function () {
    this.log.debug("Reserving items", 3);
    this.logAssets(3);
    for (var i = 0; i < this.assets.length; i += 1) {
        if (!this.assets[i].isPartnerItem()) {
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

ShopTrade.prototype.getItemsToTransfer = function () {
    var assetsToTransfer = [];
    for (var i = 0; i < this.assets.length; i += 1) {
        if (!this.assets[i].isPartnerItem() && this.assets[i].getItem().getOwner() !== this.getAssignedBotUser().getSteamid()) {
            assetsToTransfer.push(this.assets[i]);
        }
    }
    return assetsToTransfer;
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
            if (this.assets[i].isPartnerItem()) {
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
    this.emit("newStatus", status);
};

/**
 * Set Shop Trade Status Info
 * @param {String} status_info
 */
ShopTrade.prototype.setStatusInfo = function (status_info) {
    this.status_info = status_info;
    this.setLastUpdateDate(new Date());
    this.emit("newStatusInfo", status_info);
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
 * Verify that set items can be shop traded
 * @param {Function} callback When executed will pass a Boolean value
 * that establish if items are valid.
 */
ShopTrade.prototype.verifyItems = function (callback) {
    var self = this;
    this.emptyAssets();
    this.log.debug("Verifying items");

    if (this.isWithdrawTrade()) {
        if (this._verifyShopItems(callback)) {
            this._filterWithdrawableAssets();
            if (!this._assetsAreAllWithdrawable()) { // Just double check
                callback(false);
            } else if (this.getCurrencyHandler().getForcedBalance() === 0) {
                this.log.error("No forced balance on withdraw!?");
                callback(false);
            } else {
                callback(true);
            }
        }
    } else if (this.isMarketTrade()) {
        this._verifyPartnerItems(function (success) {
            if (success) {
                if ((self.getPartner().getMarketedShopItems().length + self.getAssets().length) > Market.ITEMS_LIMIT) {
                    self.emit("tradeRequestResponse", self.ajaxResponses.marketItemsLimit(Market.ITEMS_LIMIT));
                    callback(false);
                } else {
                    callback(true);
                }
            } else {
                callback(false);
            }
        }, function (shopItem) {
            var itemID = shopItem.getItem().getID();
            if (self.marketPrices.hasOwnProperty(itemID)) {
                var marketPrice = new Price(self.marketPrices[itemID], "scrap");
                if (self.market.checkPrice(shopItem, marketPrice)) {
                    shopItem.setMarketPrice(marketPrice);
                    self.assets.push(shopItem);
                } else {
                    self.emit("tradeRequestResponse", self.market.getCannotSetPriceResponse(shopItem, marketPrice));
                    return false;
                }
            } else {
                self.emit("tradeRequestResponse", self.ajaxResponses.noMarketPrice);
                return false;
            }
        });
    } else {
        if (!this._verifyShopItems(callback)) {
            return;
        }
        //Check if withdrawable items are present
        if (this._filterWithdrawableAssets()) {
            this.emit("tradeRequestResponse", this.ajaxResponses.cannotTradeOwnMarketItem);
            callback(false);
            return;
        }
        if (this.getShopItemCount() > this.assets_limit.shop) {
            this.emit("tradeRequestResponse", this.ajaxResponses.shopAssetsLimit(this.assets_limit.shop));
            callback(false);
            return;
        }
        if (this.items.hasOwnProperty("mine") && this.items.mine instanceof Array) {
            this._verifyPartnerItems(function (success) {
                if (success) {
                    self._verifyItemsFinalStep(callback);
                } else {
                    callback(false);
                }
            }, function (shopItem) {
                self.assets.push(shopItem);
            });
        } else {
            this._verifyItemsFinalStep(callback);
        }
    }
};

ShopTrade.prototype._verifyItemsFinalStep = function (callback) {
    if (this.assets.length) {
        this.currency.importAssets(); //If I don't put this it will think balance is still 0 :(
        this._injectWalletFunds(); //Order is important here, be sure to purge withdrawable first then use wallet
        var self = this;
        this.getPartner().getTF2Backpack().getCached(function () {
            if (self.getPartner().getTF2Backpack().getCurrencyAmount() < self.currency.getSignedTradeBalance()) {
                self.emit("tradeRequestResponse", self.ajaxResponses.notEnoughCurrency);
                callback(false);
            } else if (new Price(Math.abs(self.getCurrencyHandler().getTradeBalance()), "scrap").toKeys() > self.assets_limit.max_key_price) {
                self.emit("tradeRequestResponse", self.ajaxResponses.assetsPriceLimit(self.assets_limit.max_key_price));
                callback(false);
            } else {
                callback(true);
            }
        });
    } else {
        this.emit("tradeRequestResponse", this.ajaxResponses.noItems);
        callback(false);
    }
};

ShopTrade.prototype._filterWithdrawableAssets = function () {
    this.withdrawableAssetsScrapValue = 0;
    var foundWithdrawableAsset = false;
    for (var i = 0; i < this.assets.length; i += 1) {
        var item = this.assets[i];
        if (item.isMarketed() && item.getMarketer() === this.getPartner().getSteamid()) {
            var scrapPrice = item.getPrice().toScrap();
            this.withdrawableAssetsScrapValue += scrapPrice;
            this.getCurrencyHandler().addToStartingBalance(-scrapPrice);
            foundWithdrawableAsset = item;
        }
    }
    return foundWithdrawableAsset;
};

ShopTrade.prototype._assetsAreAllWithdrawable = function () {
    for (var i = 0; i < this.assets.length; i += 1) {
        if (!this.assets[i].isMarketed() || (this.assets[i].getMarketer() !== this.getPartner().getSteamid())) {
            return false;
        }
    }
    return true;
};

ShopTrade.prototype._injectWalletFunds = function () {
    this.log.debug("Injecting wallet funds on balance... " + this.getCurrencyHandler().getSignedTradeBalance());
    this.walletFunds = new Price(0);
    if (this.getCurrencyHandler().getSignedTradeBalance() > 0) {
        this.walletFunds = this.getPartner().getWallet().getBalance();
        if (this.getCurrencyHandler().getSignedTradeBalance() < this.walletFunds.toScrap()) {
            this.walletFunds = new Price(this.getCurrencyHandler().getSignedTradeBalance(), "scrap");
        }
    }
    this.getCurrencyHandler().addToStartingBalance(-this.walletFunds.toScrap());
    this.log.debug("Will use " + this.walletFunds.toMetal() + "ref from wallet funds");
};

ShopTrade.prototype._verifyShopItems = function (callback) {
    for (var section in this.items) {
        if (this.shop.sectionExist(section) && this.items[section] instanceof Array) {
            for (var i = 0; i < this.items[section].length; i += 1) {
                if (this._verifyShopItem(this.items[section][i], section)) {
                    var shopItem = this.shop.inventory.getItem(this.items[section][i]);
                    var found = false;
                    for (var p = 0; p < this.assets.length; p += 1) {
                        if (this.assets[p].getID() === shopItem.getID()) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        this.assets.push(shopItem);
                    }
                } else {
                    callback(false);
                    return false;
                }
            }
        } else if (section !== "mine") {
            this.emit("tradeRequestResponse", this.ajaxResponses.sectionNotFound);
            callback(false);
            return false;
        }
    }
    return true;
};

/**
 * Verify if shop section item can be traded given its id and section
 * @param {Number} idToCheck
 * @param {String} section
 * @returns {Boolean}
 */
ShopTrade.prototype._verifyShopItem = function (idToCheck, section) {
    if (!this.shop.sections[section].itemExist(idToCheck)) {
        this.emit("tradeRequestResponse", this.ajaxResponses.itemsSelectedNotFound);
        return false;
    }
    if (this.shop.reservations.exist(idToCheck) && this.shop.reservations.get(idToCheck).getHolder() !== this.getPartner().getSteamid()) {
        this.emit("tradeRequestResponse", this.ajaxResponses.itemIsAlreadyReserved);
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
ShopTrade.prototype._verifyPartnerItems = function (callback, onAcceptedItem) {
    var self = this;
    var itemCount = new ItemCount();
    var partnerItems = this.items.mine;
    if (this.isMarketTrade()) {
        partnerItems = this.items.market;
    }
    this.getPartner().getTF2Backpack().getCached(function (backpack) {
        for (var i = 0; i < partnerItems.length; i += 1) {
            var itemID = partnerItems[i];
            if (!backpack.itemExist(itemID)) {
                self.emit("tradeRequestResponse", self.ajaxResponses.itemNotFound);
                callback(false);
                return;
            }
            var item = new ShopItem(self.shop, backpack.getItem(itemID));
            self.isMarketTrade() ? item.setAsMarketSection() : item.setAsMineSection();
            if ((!self.isMarketTrade() && !self.shop.canBeSold(item)) || (self.isMarketTrade() && !self.shop.canBeMarketed(item))) {
                self.emit("tradeRequestResponse", self.ajaxResponses.itemCantBeSold);
                callback(false);
                return;
            } else {
                var success = onAcceptedItem(item);
                if (success === false) {
                    callback(false);
                    return;
                }
                itemCount.add(item);
                var netCount = (itemCount.get(item) + self.shop.count.get(item)) - self.shop.getLimit(item);
                if (netCount > 0) {
                    self.emit("tradeRequestResponse", self.ajaxResponses.itemExceedCount(item.getItem(), netCount));
                    callback(false);
                    return;
                }
            }
        }
        if (self.getPartnerItemCount() > self.assets_limit.partner) {
            self.emit("tradeRequestResponse", self.ajaxResponses.partnerAssetsLimit(self.assets_limit.partner));
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
 * @returns {Boolean}
 */
ShopTrade.prototype.isUsingTradeOfferToken = function () {
    return this.getPartner().hasTradeToken();
};

ShopTrade.prototype._parseClientChangeError = function () {
    if (this.getStatusInfo() !== TradeConstants.statusInfo.closed.CANCELLED) {
        if (this.steamTrade && this.steamTrade.hasErrored()) {
            return {result: "error", message: this.steamTrade.getTradeError().getMessage()};
        } else if (this.sfuminator.responses.hasOwnProperty("shopTrade_" + this.getStatusInfo())) {
            return this.sfuminator.responses["shopTrade_" + this.getStatusInfo()];
        }
    } else if (this.response) {
        return this.response;
    }
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
 * @construct
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
 * @param {Function} [callback]
 */
TradeDb.prototype.save = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.beginTransaction(function () {
            connection.query(self._getSaveQuery(), function (result) {
                self.trade.setID(result.insertId);
                self.log.debug("Saving trade: " + self.trade.getID());
                if (self.trade.getAssets().length) {
                    connection.query(self._getSaveItemsQuery(), function () {
                        connection.commitRelease();
                        if (typeof callback === "function") {
                            callback();
                        }
                    });
                } else {
                    self.log.warning("No assets to save on db for this trade");
                    connection.commitRelease();
                    if (typeof callback === "function") {
                        callback();
                    }
                }
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
    return "SELECT `id`,`steamid`,`bot_steamid`,`mode`,`trade_type`,`forced_balance`,`status`,`status_info`, `item_id`, `shop_id`, `shop_type`, `scrapPrice`, `last_update_date` FROM "
        + "(SELECT `id`,`steamid`,`mode`,`trade_type`,`forced_balance`,`status`,`status_info`,`last_update_date`,`bot_steamid` FROM shop_trades WHERE steamid='" + this.trade.getPartner().getSteamid() + "' " + additionalIdentifier + " ORDER BY last_update_date DESC LIMIT 1) as myTrade "
        + "LEFT JOIN shop_trade_items ON myTrade.id=shop_trade_items.trade_id";
};
TradeDb.prototype._getSaveQuery = function () {
    return "INSERT INTO `shop_trades` (`steamid`,`mode`,`trade_type`,`forced_balance`,`status`,`status_info`,`bot_steamid`) VALUES ("
        + "'" + this.trade.getPartner().getSteamid() + "',"
        + "'" + this.trade.getMode() + "',"
        + "" + this.trade.tradeType + ","
        + "" + this.trade.getCurrencyHandler().forcedBalance + ","
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