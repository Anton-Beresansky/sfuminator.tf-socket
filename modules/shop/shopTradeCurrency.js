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
    this.shopTrade = shopTrade;
    this.shop = this.shopTrade.shop;

    this.iSmelted = 0;
    this.loadAssets();

    this.log = new Logs({
        applicationName: "Shop Trade Currency " + this.shopTrade.getPartner().getSteamid(),
        color: "green"
    });

    this.currencyTradeBalance = this.getTradeBalance();
    this.sortedCurrencyDefindexes = [
        TF2Constants.defindexes.RefinedMetal,
        TF2Constants.defindexes.ReclaimedMetal,
        TF2Constants.defindexes.ScrapMetal
    ];
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
    this.loadAssets();

    var partnerCurrencyItems = this.getPartnerCurrencyShopItems();
    var ourCurrencyItems = this.shop.sections["currency"].getItems();
    this.log.debug("Partner currency accounts to: " + this.shopTrade.getPartner().getTF2Backpack().getCurrencyAmount().toMetal() + "ref");

    // > Getting currency items
    if (this.getSignedTradeBalance() > 0) { //We have to receive currency, our items worth more
        this.log.debug("We have to receive currency " + this.getTradeBalance());
        this.balanceAssets(partnerCurrencyItems, ourCurrencyItems);
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

ShopTradeCurrency.prototype.loadAssets = function () {
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


ShopTradeCurrency.prototype.balanceWeBuy = function (shopCurrencyItems, theirCurrencyItems) {
    var i, p;
    for (p = 0; p < this.sortedCurrencyDefindexes.length; p += 1) {
        for (i = 0; i < shopCurrencyItems.length; i += 1) {
            var shopCurrencyItem = shopCurrencyItems[i];
            if (
                !this.shop.reservations.exist(shopCurrencyItem.getID())
                && shopCurrencyItem.getItem().getDefindex() === this.sortedCurrencyDefindexes[p]
            ) {
                if (this.getSignedTradeBalance() + shopCurrencyItem.getPrice() <= 0) {
                    this.assets.push(shopCurrencyItem);
                } else {
                    var extraChangeCurrency = shopCurrencyItem;
                    this.log.debug("Save our life: " + extraChangeCurrency);
                    break;
                }
            }
        }
    }
    //If we can't balance perfectly with our items (balance still < 0)
    if (this.getSignedTradeBalance() < 0) {
        //First, remove shit items
        this.log.test("Ofc balance is negative " + this.getSignedTradeBalance());
        var assetsLength = this.assets.length;
        for (i = 0; i < assetsLength; i += 1) {
            if (this.assets[i].isCurrency()) {
                shopCurrencyItem = this.assets[i];
                if (this.getSignedTradeBalance() + extraChangeCurrency.getPrice() - shopCurrencyItem.getPrice() > 0) {
                    this.log.debug("Removing shit has value of " + shopCurrencyItem.getPrice());
                    this.assets.splice(i, 1);
                    assetsLength -= 1;
                    i -= 1;
                }
            }
        }

        //Then try to balance with partner currency
        for (p = 0; p < this.sortedCurrencyDefindexes.length; p += 1) {
            for (i = 0; i < theirCurrencyItems.length; i += 1) {
                var theirCurrencyItem = theirCurrencyItems[i];
                if (theirCurrencyItem.getItem().getDefindex() === this.sortedCurrencyDefindexes[p]) {
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
            this.log.test("Ofc by pushing balance is now precise " + this.getSignedTradeBalance());
        }
    }
};


ShopTradeCurrency.prototype.balanceAssets = function (currencyGiverItems, currencyReceiverItems) {
    var p, i;
    /**
     * @type {ShopItem}
     */
    this.log.debug("Trying to compensate with currency giver items...");
    //Trying to compensate with the currency we own
    //This procedure will result in a perfect compensation or something that's slightly less
    for (p = 0; p < this.sortedCurrencyDefindexes.length; p += 1) {
        for (i = 0; i < currencyGiverItems.length; i += 1) {
            var currencyGiverItem = currencyGiverItems[i];
            //If not reserved or just mine
            if (currencyGiverItem.isMineItem() || !this.shop.reservations.exist(currencyGiverItem.getID())) {
                //If it is the type we are looking for (eg ref/rec/scrap)
                if (currencyGiverItem.getItem().getDefindex() === this.sortedCurrencyDefindexes[p]) {
                    //If by adding this currency balance won't overflow
                    if (this.getTradeBalance() + currencyGiverItem.getPrice() <= 0) {
                        this.assets.push(currencyGiverItem);
                    } else {
                        //This right item could save our life, if we discover that our compensation is not precise
                        var extraChangeCurrency = currencyGiverItem;
                        this.log.debug("Save our life: " + extraChangeCurrency);
                        break;
                    }
                }
            }
        }
    }
    //NOW I HAVE 1.33HAT and he has 1ref + 1ref in the extra change currency
    this.log.debug("After first compensation balance is " + this.getTradeBalance());
    //Removing items that would just add extra shit that can't reach compensation while the ourExtraChangeCurrency would be enough
    if (this.getTradeBalance() < 0) {
        var assetsLength = this.assets.length;
        for (i = 0; i < assetsLength; i += 1) {
            if (this.assets[i].isCurrency()) {
                currencyGiverItem = this.assets[i];
                if (this.getTradeBalance() + extraChangeCurrency.getPrice() - currencyGiverItem.getPrice() > 0) {
                    this.log.debug("Removing shit has value of " + currencyGiverItem.getPrice());
                    this.assets.splice(i, 1);
                    assetsLength -= 1;
                    i -= 1;
                }
            }
        }
    }
    this.log.debug("After second compensation balance is " + this.getTradeBalance());
    //If my currency is not precise (eg there's need to smelt some metal) we try first to compensate with partner currency
    //In this case ourExtraChangeCurrency will be defined
    if (this.getTradeBalance() < 0) {
        this.log.debug("Giver currency is not precise, looking for receiver change...");
        var currencyTradeBalanceTest = this.getTradeBalance();
        var receiverCurrencyBalancing = [];
        for (p = 0; p < this.sortedCurrencyDefindexes.length; p += 1) {
            for (i = 0; i < currencyReceiverItems.length; i += 1) {
                var currencyReceiverItem = currencyReceiverItems[i];
                //If it is the type we are looking for (eg ref/rec/scrap)
                if (currencyReceiverItem.getItem().getDefindex() === this.sortedCurrencyDefindexes[p]) {
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