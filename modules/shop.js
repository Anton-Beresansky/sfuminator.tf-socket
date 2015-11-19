module.exports = Shop;
var events = require("events");
var Logs = require("../lib/logs.js");
var Price = require("./price.js");
var TF2Currency = require("./tf2/tf2Currency.js");
var TF2Item = require("./tf2/tf2Item.js");
var ShopRatio = require("./shop/shopRatio.js");
var ShopInventory = require("./shop/shopInventory.js");
var Section = require("./shop/shopSection.js");
var Reservations = require("./shop/shopReservations.js");
var ItemCount = require("./shop/shopItemCount.js");
var Search = require('./shop/shopSearch.js');

/**
 * General purpose Shop class
 * @param {Sfuminator} sfuminator The Sfuminator instance
 * @returns {Shop}
 */
function Shop(sfuminator) {
    this.sfuminator = sfuminator;
    this.cloud = this.sfuminator.cloud;
    this.db = this.sfuminator.db;
    this.interrupts = this.sfuminator.interrupts;
    this.users = this.sfuminator.users;
    this.log = new Logs({applicationName: "Shop", color: "green"});

    this.ratio = new ShopRatio(this.db);
    this.tf2Currency = TF2Currency;
    this.tf2Currency.setCloud(this.cloud);
    this.bots = this.getBots();
    this.inventory = new ShopInventory(this);
    /**
     * @type {Reservations}
     */
    this.reservations = new Reservations(this.db);
    this.instanceID = new Date().getTime();
    this.countLimit = {Strange: 0, Vintage: 3, Genuine: 3, Haunted: 3, _any: 4, _price: {over: 6, limit: 3}};
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

    events.EventEmitter.call(this);
    var self = this;
    this.init();
    this.inventory.on("new", function (changes) {
        self.update(changes);
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
    self.ratio.updateHats(function () {
        self.tf2Currency.update(function () {
            self.reservations.load(function () {
                self.inventory.ids.load(function () {
                    self.log.debug("Loading up inventory...");
                    self.inventory.update(function () {
                        self.emit("ready");
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
    var changes = {add: _changes.toAdd, remove: _changes.toRemove};

    for (var action in changes) {
        for (var i = 0; i < changes[action].length; i += 1) {
            var shopItem = changes[action][i];
            var shopType = shopItem.getType();
            if (shopType) {
                if (!this.sections.hasOwnProperty(shopType)) {
                    this.sections[shopType] = new Section(this, shopType);
                }
                this.sections[shopType][action](shopItem);
            }
        }
    }
    for (var type in this.sections) {
        this.sections[type].commit();
    }
    for (var i = 0; i < changes.remove.length; i += 1) { //Removing reservations of deleted items(?)
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
    return this.sections.hasOwnProperty(section);
};

/**
 * Get client formatted section inventory
 * @param {String} type
 */
Shop.prototype.getClientBackpack = function (type) {
    return this.sections[type].getCompressedItems();

};

/**
 * Get max possible stock for a given item
 * @param {TF2Item} item
 * @returns {Number}
 */
Shop.prototype.getLimit = function (item) {
    var qualityLimit = (this.countLimit.hasOwnProperty(item.getQualityName())) ? this.countLimit[item.getQualityName()] : this.countLimit._any;
    if (item.getPrice().toMetal() > this.countLimit._price.over) {
        if (this.countLimit._price.limit < qualityLimit) {
            return this.countLimit._price.limit;
        }
    }
    return qualityLimit;
};

/**
 * Get client formatted mine section inventory
 * @param {Backpack} backpack
 * @returns {Object} Client formatted response
 */
Shop.prototype.makeMine = function (backpack) {
    this.log.debug("Getting mine items, bp: " + backpack.getOwner(), 1);
    if (!backpack.hasErrored()) {
        return this.filterMineItems(backpack).getCompressedItems();
    } else {
        return {
            result: "error",
            message: backpack.getErrorMessage(),
            timestamp: parseInt(backpack.last_update_date.getTime() / 1000),
            items: this.filterMineItems(backpack).getCompressedItems()
        };
    }
};

var ShopItem = require("./shop/inventory/shopItem.js");
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
                if (this.canBeSold(items[i])) {
                    var mineItem = new ShopItem(this, items[i]);
                    mineItem.setAsMineSection();
                    mySection.add(mineItem);
                }
            }
        }
    }
    mySection.commit();
    return mySection;
};

/**
 * Check if given item can be sold
 * @param {TF2Item} item
 * @returns {Boolean}
 */
Shop.prototype.canBeSold = function (item) {
    if (item instanceof TF2Item) {
        return (
            item.isHat() &&
            item.isCraftable() &&
            item.isTradable() &&
            item.isPriced() &&
            this.verifyMineItemPriceRange(item) &&
            this.count.get(item) < this.getLimit(item)
        );
    }
    return false;
};

/**
 * Establish if item price range is acceptable
 * @param {TF2Item} item
 * @returns {Boolean|Undefined} Undefined if shop doesn't allow item type
 */
Shop.prototype.verifyMineItemPriceRange = function (item) {
    if (item.isHat()) {
        var originalPrice = item.getPrice();
        return originalPrice.toMetal() <= (this.ratio.hats.weSell.maximum) && originalPrice.toMetal() >= this.ratio.hats.weSell.minimum;
    }
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

Shop.prototype._getActivePartnersQuery = function () {
    return "SELECT id,steamid FROM shop_trades WHERE (status!='closed' OR last_update_date>='"
        + new Date(new Date() - this.sfuminator.shopTrade_decay).toMysqlFormat() + "') " + this._getActivePartnersBotComponentQuery()
        + " ORDER BY last_update_date ASC";
};
Shop.prototype._getActivePartnersBotComponentQuery = function () {
    var query = "AND `bot_steamid` IN (";
    for (var i = 0; i < this.bots.length; i += 1) {
        query += "'" + this.bots[i].getSteamid() + "'";
    }
    return query + ")";
};