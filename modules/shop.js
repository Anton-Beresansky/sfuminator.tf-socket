module.exports = Shop;
var events = require("events");
var Logs = require("../lib/logs.js");
var Price = require("./price.js");
var TF2Currency = require("./tf2/tf2Currency.js");
var TF2Item = require("./tf2/tf2Item.js");
var ShopRatio = require("./shop/shopRatio.js");
var ShopInventory = require("./shop/shopInventory.js");
var ShopItem = require("./shop/inventory/shopItem.js");
var Market = require('./market.js');
var Section = require("./shop/shopSection.js");
var Reservations = require("./shop/shopReservations.js");
var ItemCount = require("./shop/shopItemCount.js");
var Search = require('./shop/shopSearch.js');

/**
 * General purpose Shop class
 * @param {Sfuminator} sfuminator The Sfuminator instance
 * @returns {Shop}
 * @construct
 */
function Shop(sfuminator) {
    this.sfuminator = sfuminator;
    this.webApi = this.sfuminator.webApi;
    this.db = this.sfuminator.db;
    this.interrupts = this.sfuminator.interrupts;
    this.users = this.sfuminator.users;
    this.log = new Logs({applicationName: "Shop", color: "grey", dim: true});

    this.ratio = new ShopRatio(this.db);
    this.tf2Currency = TF2Currency;
    this.tf2Currency.setWebApi(this.webApi);
    this.bots = [];
    /**
     * @type {ShopInventory}
     */
    this.inventory = new ShopInventory(this);
    /**
     * @type {Reservations}
     */
    this.reservations = new Reservations(this.db);
    /**
     * @type {Market}
     */
    this.market = new Market(this);
    this.instanceID = new Date().getTime();
    this.mine_max_key_price = 5;
    this.count_limit = {
        hats: {Strange: 2, Vintage: 3, Genuine: 3, Haunted: 2, _any: 5, _price: {over: 9, limit: 3}},
        strange: {_any: 5, _price: {over: 9, limit: 3}},
        taunt: {_any: 4, _price: {over: 9, limit: 3}},
        other: {_any: 4, _price: {over: 9, limit: 3}}
    };
    /**
     * @type {ShopItemCount}
     */
    this.count = new ItemCount();
    this.search = new Search(this, this.sfuminator.responses);
    /**
     * @type {Section[]}
     */
    this.sections = {};
    this.hiddenSections = ["currency"];

    this._onceSectionItemsUpdatedHandlers = [];

    events.EventEmitter.call(this);
    var self = this;
    this.inventory.on("new", function (changes) {
        self.update(changes);
        self.emit("sectionItemsUpdated", changes.toAdd);
        self._manageOnceSectionItemsUpdatedHandlers(changes.toAdd);
    });
}

require("util").inherits(Shop, events.EventEmitter);

/**
 * Init ratio, currency, reservations and inventory<br>
 * Called when instancing a new Shop,
 * a 'ready' event is fired on init complete
 * @returns {undefined}
 */
Shop.prototype.init = function () {
    var self = this;
    self.log.debug("Creating bots");
    self.bots = self.getBots();
    self.log.debug("Updating shop ratios");
    self.ratio.updateHats(function () {
        self.log.debug("Updating currency");
        self.tf2Currency.update(function () {
            self.log.debug("Loading reservations");
            self.reservations.load(function () {
                self.log.debug("Loading shop ids");
                self.inventory.ids.load(function () {
                    self.log.debug("Loading prices history");
                    self.sfuminator.stats.pricesHistory.onLoad(function () {
                        self.log.debug("Loading market");
                        self.market.load(function () {
                            self.log.debug("Loading up inventory...");
                            self.inventory.update(function () {
                                self.emit("ready");
                            });
                        });
                    });
                });
            });
        });
    });
};

/**
 * Update shop item changes
 * @param {DataCommit} _changes
 */
Shop.prototype.update = function (_changes) {
    var i;
    var changes = {add: _changes.toAdd, remove: _changes.toRemove};

    for (var action in changes) {
        for (i = 0; i < changes[action].length; i += 1) {
            /**
             * @type {ShopItem}
             */
            var shopItem = changes[action][i];
            var shopType = shopItem.getType();
            if (shopType) {
                if (!this.sections.hasOwnProperty(shopType)) {
                    this.sections[shopType] = new Section(this, shopType);
                }
                this.sections[shopType][action](shopItem);
                if (shopItem.isMarketed()) {
                    this.users.get(shopItem.getMarketerSteamid()).getMarketer().getSection()[action](shopItem).commit();
                }
            }
        }
    }
    for (var type in this.sections) {
        this.sections[type].commit();
    }
    for (i = 0; i < changes.remove.length; i += 1) { //Removing reservations of deleted items(?)
        if (this.reservations.exist(changes.remove[i].id)) {
            this.reservations.cancel(changes.remove[i].id);
        }
    }
    this.count.update(changes.add, changes.remove);
};

/**
 * Get Shop Section Item given its id
 * @param {Number} id
 * @returns {ShopItem|Boolean} False if item doesn't exist
 */
Shop.prototype.getItem = function (id) {
    for (var section in this.sections) {
        for (var i = 0; i < this.sections[section].items.length; i += 1) {
            var item = this.sections[section].items[i];
            if (item.getID() === id) {
                return item;
            }
        }
    }
    return false;
};

/**
 * Establish if given section type exist
 * @param {String} section
 * @returns {Boolean}
 */
Shop.prototype.sectionExist = function (section) {
    for (var sectionType in ShopItem.TYPE) {
        if (ShopItem.TYPE[sectionType] === section) {
            return true;
        }
    }
    return false;
};

Shop.prototype.sectionHasItems = function (section) {
    return this.sections.hasOwnProperty(section);
};

/**
 * Get client formatted section inventory
 * @param {String} type
 * @param {String|null} userSteamid
 */
Shop.prototype.getClientBackpack = function (type, userSteamid) {
    var response = {
        result: "success",
        items: this.sections[type].getCompressedItems(),
        currency: this.tf2Currency.valueOf(),
        wallet: 0
    };
    if (userSteamid && this.users.get(userSteamid)) {
        response.wallet = this.users.get(userSteamid).getWallet().getBalance().toScrap();
    }
    return response;
};

/**
 * Get max possible stock for a given item
 * @param {ShopItem} item
 * @returns {Number}
 */
Shop.prototype.getLimit = function (item) {
    var countLimit = this.count_limit[item.getType()];
    if (!countLimit) {
        return 10000000; //well.. i mean that's a lot of items.
    }
    var itemQualityName = item.getItem().getQualityName();
    var qualityLimit = (countLimit.hasOwnProperty(itemQualityName)) ? countLimit[itemQualityName] : countLimit._any;
    if (countLimit._price && item.getItem().getPrice().toMetal() > countLimit._price.over) {
        if (countLimit._price.limit < qualityLimit) {
            return countLimit._price.limit;
        }
    }
    return qualityLimit;
};

Shop.prototype.makeMarketerInventory = function (steamid, requesterSteamid) {
    this.log.debug("Getting marketer items: " + steamid, 1);
    var response = {
        result: "success",
        currency: this.tf2Currency.valueOf()
    };
    var user = this.users.get(steamid);
    if (!user.getMarketer().getSection().items.length) {
        response = this.sfuminator.responses.marketerHasNoItems;
    } else {
        var section = user.getMarketer().getSection();
        response.items = section.getCompressedItems();
        response.market_ratio = this.getMarketRatio();
        response.wallet = this.users.get(requesterSteamid).getWallet().getBalance().toScrap();
        if (requesterSteamid === steamid) {
            response.taxed = {};
            var items = section.getItems();
            for (var i = 0; i < items.length; i += 1) {
                response.taxed[items[i].getID()] = this.market.getItem(items[i]).getTaxedPrice().toScrap();
            }
        }
    }
    return response;
};

/**
 * Get client formatted mine section inventory
 * @param {Backpack} backpack
 * @param shopType {string}
 * @returns {Object} Client formatted response
 */
Shop.prototype.makeUserInventory = function (backpack, shopType) {
    this.log.debug("Getting mine items, bp: " + backpack.getOwner(), 1);
    var response = {
        result: "success",
        currency: this.tf2Currency.valueOf()
    };
    if (shopType && shopType === "market") {
        response.items = this.filterMarketItems(backpack).getCompressedItems();
        response.market_ratio = this.getMarketRatio();
    } else {
        response.items = this.filterMineItems(backpack).getCompressedItems();
    }
    if (backpack.hasErrored()) {
        response.result = "error";
        response.message = backpack.getErrorMessage();
        response.timestamp = parseInt(backpack.last_update_date.getTime() / 1000);
    }
    return response;
};

/**
 * Make mine section from items
 * @param {Backpack} backpack
 * @returns {Section}
 */
Shop.prototype.filterMineItems = function (backpack) {
    var mySection = new Section(this, "mine");
    if (backpack.hasTF2Items()) {
        var items = backpack.getItems();
        if (items) {
            for (var i = 0; i < items.length; i += 1) {
                var mineItem = new ShopItem(this, items[i]);
                mineItem.setAsMineSection();
                if (this.canBeSold(mineItem)) {
                    mySection.add(mineItem);
                } else {
                    mineItem = null;
                }
            }
        }
    }
    mySection.commit();
    return mySection;
};

Shop.prototype.filterMarketItems = function (backpack) {
    var mySection = new Section(this, "market");
    if (backpack.hasTF2Items()) {
        var items = backpack.getItems();
        if (items) {
            for (var i = 0; i < items.length; i += 1) {
                var marketItem = new ShopItem(this, items[i]);
                marketItem.setAsMarketSection();
                if (this.canBeMarketed(marketItem)) {
                    mySection.add(marketItem);
                } else {
                    marketItem = null;
                }
            }
        }
    }
    mySection.commit();
    return mySection;
};

Shop.prototype.canBeMarketed = function (item) {
    if (item.getItem() instanceof TF2Item) {
        return (item.canBeMarketed() && this.count.get(item.getItem()) < this.getLimit(item));
    }
    return false;
};

/**
 * Check if given item can be sold
 * @param {ShopItem} item
 * @param {[Boolean]} countless
 * @returns {Boolean}
 */
Shop.prototype.canBeSold = function (item, countless) {
    if (item.getItem() instanceof TF2Item) {
        return (
            item.getType() && this.verifyMineItemPriceRange(item)
            && (countless ? true : this.count.get(item.getItem()) < this.getLimit(item))
            && !item.isHiddenType()
        );
    }
    return false;
};

/**
 * Establish if item price range is acceptable
 * @param {ShopItem} item
 * @returns {Boolean|Undefined} Undefined if shop doesn't allow item type
 */
Shop.prototype.verifyMineItemPriceRange = function (item) {
    var originalPrice = item.getItem().getPrice(); //Be sure to check on actual item price not shop price
    return originalPrice.toScrap() > 0 && originalPrice.toKeys() < this.mine_max_key_price;
};

Shop.prototype.getMarketRatio = function () {
    return (1 - this.ratio.hats.weBuy.normal) / 2;
};

/**
 * Establish if given steamid identify a bot
 * @param {String} steamid
 * @returns {Boolean}
 */
Shop.prototype.isBot = function (steamid) {
    for (var i = 0; i < this.bots.length; i += 1) {
        if (this.bots[i].getSteamid() === steamid) {
            return true;
        }
    }
    return false;
};

/**
 * Get user instance of the given bot steamid, should be used alongside Shop.isBot
 * @param {String} steamid
 * @returns {User|Boolean} Will return false if bot doesn't exist
 */
Shop.prototype.getBotUser = function (steamid) {
    if (this.isBot(steamid)) {
        return this.users.get(steamid);
    }
    this.log.error("Bot " + steamid + " doesn't exist");
    return false;
};

/**
 * @returns {User[]} Bots
 */
Shop.prototype.getBots = function () {
    var bots = [];
    var steamids = this.sfuminator.getCFG().getBotSteamids();
    for (var i = 0; i < steamids.length; i += 1) {
        bots.push(this.users.get(steamids[i]));
    }
    return bots;
};

/**
 * Get current active Shop Trades
 * @param {Function} callback Will pass a list of elements representing the active shop trades<br>
 * Element object structure:<br>
 * {<br>
 * &nbsp;id: Number,<br>
 * &nbsp;partnerID: String<br>
 * }
 */
Shop.prototype.getActiveTrades = function (callback) {
    var self = this;
    this.log.debug("Loading active trades...", 3);
    this.db.connect(function (connection) {
        connection.query(self._getActivePartnersQuery(), function (result, isEmpty) {
            connection.release();
            var partners_list = [];
            if (!isEmpty) {
                for (var i = 0; i < result.length; i += 1) {
                    partners_list.push({id: result[i].id, partnerID: result[i].steamid});
                }
            }
            callback(partners_list);
        });
    });
};

Shop.prototype.onceSectionItemsUpdated = function (callback) {
    this._onceSectionItemsUpdatedHandlers.push(callback);
};

Shop.prototype._getActivePartnersQuery = function () {
    return "SELECT id,steamid FROM shop_trades WHERE (status!='closed' OR last_update_date>='"
        + new Date(new Date() - this.sfuminator.shopTrade_decay).toMysqlFormat() + "') " + this._getActivePartnersBotComponentQuery()
        + " ORDER BY last_update_date ASC";
};
Shop.prototype._getActivePartnersBotComponentQuery = function () {
    var query = "AND `bot_steamid` IN (";
    for (var i = 0; i < this.bots.length; i += 1) {
        query += "'" + this.bots[i].getSteamid() + "',";
    }
    return query.slice(0, -1) + ")";
};

Shop.prototype._manageOnceSectionItemsUpdatedHandlers = function (newItems) {
    for (var i = 0; i < this._onceSectionItemsUpdatedHandlers.length; i += 1) {
        this._onceSectionItemsUpdatedHandlers[i](newItems);
    }
    this._onceSectionItemsUpdatedHandlers = [];
};