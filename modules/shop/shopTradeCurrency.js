module.exports = ShopTradeCurrency;

var events = require("events");
var Logs = require("../../lib/logs.js");
var TF2Constants = require("../tf2/tf2Constants.js");
var Price = require("../price.js");
var ShopItem = require("./inventory/shopItem.js");

/**
 * @param {ShopTrade} shopTrade
 * @constructor
 */
function ShopTradeCurrency(shopTrade) {
    /**
     * @type {ShopTrade}
     */
    this.shopTrade = shopTrade;
    /**
     * @type Shop
     */
    this.shop = this.shopTrade.shop;

    this.iSmelted = 0;
    this.importAssets();

    this.log = new Logs({
        applicationName: "Shop Trade Currency " + this.shopTrade.getPartner().getSteamid(),
        color: "green"
    });

    this.currencyTradeBalance = this.getTradeBalance();
    events.EventEmitter.call(this);
}

require("util").inherits(ShopTradeCurrency, events.EventEmitter);

ShopTradeCurrency.prototype.getTradeBalance = function () {
    var balance = this.getSignedTradeBalance();
    if (balance > 0) {
        balance = -balance;
    }
    this.log.debug("Trade balance is: " + balance, 1);
    return balance;
};

/**
 * If sfuminator has to give currency, balance will be negative
 * @returns {number}
 */
ShopTradeCurrency.prototype.getSignedTradeBalance = function () {
    if (!isNaN(this.forcedBalance)) {
        this.currencyTradeBalance = this.forcedBalance;
    } else {
        this.currencyTradeBalance = 0;
    }
    for (var i = 0; i < this.assets.length; i += 1) {
        var asset = this.assets[i];
        if (this.assets[i].isMineItem()) {
            this.currencyTradeBalance -= asset.getPrice();
        } else {
            this.currencyTradeBalance += asset.getPrice();
        }
    }
    return this.currencyTradeBalance;
};

/**
 * @param {Price} price
 */
ShopTradeCurrency.prototype.forceStartingBalance = function (price) {
    this.forcedBalance = price.toScrap();
};

ShopTradeCurrency.prototype.reserve = function () {
    this.log.debug("Reserving currency...");
    this.importAssets();

    var partnerCurrencyItems = this.getPartnerCurrencyShopItems();
    var ourCurrencyItems = this.getOurCurrencyShopItems();
    this.log.debug("Partner currency: " + this.shopTrade.getPartner().getTF2Backpack().getCurrencyAmount().toMetal() + "ref");

    // > Getting currency items
    if (this.getSignedTradeBalance() > 0) { //We have to receive currency, our items worth more
        this.log.debug("We have to receive currency " + this.getTradeBalance());
        this.balanceWeSell(partnerCurrencyItems, ourCurrencyItems);
    } else if (this.getSignedTradeBalance() < 0) { //We have to give currency, their items worth more
        this.log.debug("We have to give currency " + this.getTradeBalance());
        this.balanceWeBuy(ourCurrencyItems, partnerCurrencyItems);
    }
    //So are we okay now?
    if (this.getTradeBalance() === 0) {
        this.log.debug("Alright, currency is balanced");
        if (this.reserveAssets()) {
            this.emit("reserved");
        } else {
            this.cleanAssets();
            this.reserve();
        }
    } else {
        //Sorry man we can't do much unless we are going to smelt something, so let's do it...
        this.cleanAssets();

        var self = this;
        if (this.iSmelted < 2) {
            this.log.debug("Smelting is needed, will smelt " + this.getSmeltingItem().getItem().getName() + " (" + this.getSmeltingItem().getItem().getOwner() + ")");
            var smeltingItemOwner = this.getSmeltingItem().getItem().getOwner();
            var bot = this.shop.sfuminator.getBotsController().getBot(smeltingItemOwner);
            bot.steamClient.craftTF2Items([this.getSmeltingItem().getItem()]);
            //Detect new Items, and be sure to check that they are the crafted ones
            var checkIfCrafted = function () {
                self.shop.onceSectionItemsUpdated(function (newItems) {
                    self.log.debug("Detected new items");
                    self.log.debug(bot.steamClient.lastCraftedItems);
                    for (var i = 0; i < newItems.length; i += 1) {
                        self.log.debug(newItems[i].getItem().getID());
                        for (var p = 0; p < bot.steamClient.lastCraftedItems.length; p += 1) {
                            if (newItems[i].getItem().getID() === bot.steamClient.lastCraftedItems[p]) {
                                self.iSmelted += 1;
                                self.reserve();
                                return;
                            }
                        }
                    }
                    self.log.warning("It wasn't the newly crafted item!");
                    setTimeout(function () { //UnClosure
                        checkIfCrafted();
                    }, 0);
                });
            };
            checkIfCrafted();
        } else {
            this.log.error("We already smelt metal twice (ref>rec>scrap). Got request to smelt again?!");
        }
    }
};

ShopTradeCurrency.prototype.importAssets = function () {
    this.assets = this.shopTrade.getAssets();
};

ShopTradeCurrency.prototype.cleanAssets = function () {
    var assetsLength = this.shopTrade.assets.length;
    for (var i = 0; i < assetsLength; i += 1) {
        if (this.shopTrade.assets[i].isCurrency()) {
            this.shopTrade.assets.splice(i, 1);
            assetsLength -= 1;
            i -= 1;
        }
    }
};

ShopTradeCurrency.prototype.reserveAssets = function () {
    var counter = 0;
    for (var i = 0; i < this.shopTrade.assets.length; i += 1) {
        if (!this.shopTrade.assets[i].isMineItem() && this.shopTrade.assets[i].isCurrency()) {
            if (!this.shop.reservations.exist(this.shopTrade.assets[i].getID())) {
                this.shop.reservations.add(this.shopTrade.getPartner().getSteamid(), this.shopTrade.assets[i].getID());
                counter += 1;
            } else if (this.shop.reservations.get(this.shopTrade.assets[i].getID()).getHolder() !== this.shopTrade.getPartner().getSteamid()) {
                this.log.error("Reserving items that are already reserved by someone else!");
            }
        }
    }
    this.log.debug("Reserved " + counter + " currency assets, total assets: " + this.shopTrade.assets.length);
    return true;
};

/**
 * @returns {ShopItem[]}
 */
ShopTradeCurrency.prototype.getPartnerCurrencyShopItems = function () {
    this.partnerCurrencyShopItems = [];
    var partnerCurrencyItems = this.shopTrade.getPartner().getTF2Backpack().getCurrencyItems();
    for (var i = 0; i < partnerCurrencyItems.length; i += 1) {
        this.partnerCurrencyShopItems.push(new ShopItem(this.shop, partnerCurrencyItems[i], "mine"));
    }
    return this.partnerCurrencyShopItems;
};

ShopTradeCurrency.prototype.getOurCurrencyShopItems = function () {
    var items = this.shop.sections["currency"].getItems();
    var sortedItems = [], i;
    var assignedBotSteamid = this.shopTrade.getAssignedBotUser().getSteamid();
    for (i = 0; i < items.length; i += 1) {
        if (items[i].getItem().getOwner() === assignedBotSteamid) {
            sortedItems.push(items[i]);
        }
    }
    for (i = 0; i < items.length; i += 1) {
        if (items[i].getItem().getOwner() !== assignedBotSteamid) {
            sortedItems.push(items[i]);
        }
    }
    return sortedItems;
};


ShopTradeCurrency.prototype.balanceWeBuy = function (shopCurrencyItems, theirCurrencyItems) {
    var i, p;
    var sortedCurrencyDefindexes = this.getSortedCurrencyDefindexes("weBuy");
    for (p = 0; p < sortedCurrencyDefindexes.length; p += 1) {
        for (i = 0; i < shopCurrencyItems.length; i += 1) {
            var shopCurrencyItem = shopCurrencyItems[i];
            if (
                !this.shop.reservations.exist(shopCurrencyItem.getID())
                && shopCurrencyItem.getItem().getDefindex() === sortedCurrencyDefindexes[p]
            ) {
                if (this.getSignedTradeBalance() + shopCurrencyItem.getPrice() <= 0) {
                    this.assets.push(shopCurrencyItem);
                } else {
                    var extraChangeCurrency = shopCurrencyItem;
                    this.log.debug("Save our life: " + extraChangeCurrency, 1);
                    break;
                }
            }
        }
    }
    //If we can't balance perfectly with our items (balance still < 0)
    if (this.getSignedTradeBalance() < 0) {
        //First, remove shit items
        this.log.test("Ofc balance is negative " + this.getSignedTradeBalance(), 1);
        var assetsLength = this.assets.length;
        for (i = 0; i < assetsLength; i += 1) {
            if (this.assets[i].isCurrency()) {
                shopCurrencyItem = this.assets[i];
                if (this.getSignedTradeBalance() + extraChangeCurrency.getPrice() - shopCurrencyItem.getPrice() > 0) {
                    this.log.debug("Removing shit has value of " + shopCurrencyItem.getPrice(), 1);
                    this.assets.splice(i, 1);
                    assetsLength -= 1;
                    i -= 1;
                }
            }
        }

        //Then try to balance with partner currency
        for (p = 0; p < sortedCurrencyDefindexes.length; p += 1) {
            for (i = 0; i < theirCurrencyItems.length; i += 1) {
                var theirCurrencyItem = theirCurrencyItems[i];
                if (theirCurrencyItem.getItem().getDefindex() === sortedCurrencyDefindexes[p]) {
                    if (this.getSignedTradeBalance() + extraChangeCurrency.getPrice() - theirCurrencyItem.getPrice() >= 0) {
                        this.assets.push(theirCurrencyItem);
                    }
                }
            }
        }

        //If after balancing it's still < 0 we need to smelt
        if (this.getSignedTradeBalance() + extraChangeCurrency.getPrice() > 0) {
            this.setSmeltingItem(extraChangeCurrency);
        } else {
            this.assets.push(extraChangeCurrency);
            this.log.test("Ofc by pushing balance is now precise " + this.getSignedTradeBalance(), 1);
        }
    }
};


ShopTradeCurrency.prototype.balanceWeSell = function (currencyGiverItems, currencyReceiverItems) {
    var p, i;
    var sortedCurrencyDefindexes = this.getSortedCurrencyDefindexes("weSell");
    this.log.debug("Trying to compensate with currency giver items...", 1);
    //Trying to compensate with the currency we own
    //This procedure will result in a perfect compensation or something that's slightly less
    for (p = 0; p < sortedCurrencyDefindexes.length; p += 1) {
        for (i = 0; i < currencyGiverItems.length; i += 1) {
            var currencyGiverItem = currencyGiverItems[i];
            //If not reserved or just mine
            if (currencyGiverItem.isMineItem() || !this.shop.reservations.exist(currencyGiverItem.getID())) {
                //If it is the type we are looking for (eg ref/rec/scrap)
                if (currencyGiverItem.getItem().getDefindex() === sortedCurrencyDefindexes[p]) {
                    //If by adding this currency balance won't overflow
                    if (this.getTradeBalance() + currencyGiverItem.getPrice() <= 0) {
                        this.assets.push(currencyGiverItem);
                    } else {
                        //This right item could save our life, if we discover that our compensation is not precise
                        var extraChangeCurrency = currencyGiverItem;
                        this.log.debug("Save our life: " + extraChangeCurrency, 1);
                        break;
                    }
                }
            }
        }
    }
    //NOW I HAVE 1.33HAT and he has 1ref + 1ref in the extra change currency
    this.log.debug("After first compensation balance is " + this.getTradeBalance(), 1);
    //Removing items that would just add extra shit that can't reach compensation while the ourExtraChangeCurrency would be enough
    if (this.getTradeBalance() < 0) {
        var assetsLength = this.assets.length;
        for (i = 0; i < assetsLength; i += 1) {
            if (this.assets[i].isCurrency()) {
                currencyGiverItem = this.assets[i];
                if (this.getTradeBalance() + extraChangeCurrency.getPrice() - currencyGiverItem.getPrice() > 0) {
                    this.log.debug("Removing shit has value of " + currencyGiverItem.getPrice(), 1);
                    this.assets.splice(i, 1);
                    assetsLength -= 1;
                    i -= 1;
                }
            }
        }
    }
    this.log.debug("After second compensation balance is " + this.getTradeBalance(), 1);
    //If my currency is not precise (eg there's need to smelt some metal) we try first to compensate with partner currency
    //In this case ourExtraChangeCurrency will be defined
    if (this.getTradeBalance() < 0) {
        this.log.debug("Giver currency is not precise, looking for receiver change...", 1);
        var currencyTradeBalanceTest = this.getTradeBalance();
        var receiverCurrencyBalancing = [];
        for (p = 0; p < sortedCurrencyDefindexes.length; p += 1) {
            for (i = 0; i < currencyReceiverItems.length; i += 1) {
                var currencyReceiverItem = currencyReceiverItems[i];
                //If it is the type we are looking for (eg ref/rec/scrap)
                if (currencyReceiverItem.getItem().getDefindex() === sortedCurrencyDefindexes[p]) {
                    //If by adding this currency balance won't underflow
                    if (currencyTradeBalanceTest + extraChangeCurrency.getPrice() - currencyReceiverItem.getPrice() >= 0) {
                        receiverCurrencyBalancing.push(currencyReceiverItem);
                        currencyTradeBalanceTest -= currencyReceiverItem.getPrice();
                    } else if (!extraChangeCurrency.isMineItem()) {
                        this.setSmeltingItem(extraChangeCurrency);
                    }
                }
            }
            if (currencyTradeBalanceTest + extraChangeCurrency.getPrice() === 0) {
                //We were able to compensate currency balance with partner items! -> Reserve the extra shit thing
                this.log.debug("Receiver has change, using it", 1);
                this.assets.push(extraChangeCurrency);
                for (var z = 0; z < receiverCurrencyBalancing.length; z += 1) {
                    this.assets.push(receiverCurrencyBalancing[z]);
                }
                break;
            } else if (!extraChangeCurrency.isMineItem() && currencyTradeBalanceTest + extraChangeCurrency.getPrice() > 0) {
                this.setSmeltingItem(extraChangeCurrency);
                break;
            }
        }
    }
};

ShopTradeCurrency.prototype.setSmeltingItem = function (shopItem) {
    this.smeltingItem = shopItem;
};

/**
 * @returns {ShopItem|null}
 */
ShopTradeCurrency.prototype.getSmeltingItem = function () {
    return this.smeltingItem;
};

ShopTradeCurrency.prototype.getSortedCurrencyDefindexes = function (action) {
    /*if (action == "weBuy") {
     if (this.canBuyWithKeys()) {
     return ShopTradeCurrency.sortedCurrencyDefindexes.default;
     } else {
     return ShopTradeCurrency.sortedCurrencyDefindexes.metalFirst;
     }
     } else if (action == "weSell") {
     return ShopTradeCurrency.sortedCurrencyDefindexes.default;
     } else {
     return ShopTradeCurrency.sortedCurrencyDefindexes.default;
     }*/
    if (action == "weBuy" && !this.canBuyWithKeys()) {
        return ShopTradeCurrency.SORTED_CURRENCY_DEFINDEXES.METAL_FIRST;
    } else {
        return ShopTradeCurrency.SORTED_CURRENCY_DEFINDEXES.DEFAULT;
    }
};

ShopTradeCurrency.prototype.canBuyWithKeys = function () {
    var currencyItems = this.getOurCurrencyShopItems();
    var mannCoKey, refinedMetal;
    for (var i = 0; i < currencyItems.length; i += 1) {
        if (currencyItems[i].getItem().getDefindex() === TF2Constants.defindexes.MannCoKey) {
            mannCoKey = currencyItems[i];
        } else if (currencyItems[i].getItem().getDefindex() === TF2Constants.defindexes.RefinedMetal) {
            refinedMetal = currencyItems[i];
        }
        if (mannCoKey && refinedMetal) {
            return (this.shop.count.get(mannCoKey).getCount() / this.shop.count.get(refinedMetal).getCount()) > ShopTradeCurrency.KEYS_REFINED_MINIMUM_RATIO
        }
    }
    return false;
};

ShopTradeCurrency.KEYS_REFINED_MINIMUM_RATIO = 0.15; // Out of 100 refined, minimum of 15 keys

ShopTradeCurrency.SORTED_CURRENCY_DEFINDEXES = {
    DEFAULT: [
        TF2Constants.defindexes.MannCoKey,
        TF2Constants.defindexes.RefinedMetal,
        TF2Constants.defindexes.ReclaimedMetal,
        TF2Constants.defindexes.ScrapMetal
    ],
    METAL_FIRST: [
        TF2Constants.defindexes.RefinedMetal,
        TF2Constants.defindexes.ReclaimedMetal,
        TF2Constants.defindexes.ScrapMetal,
        TF2Constants.defindexes.MannCoKey
    ]
};