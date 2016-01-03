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

ShopTradeCurrency.prototype.getSignedTradeBalance = function () {
    this.currencyTradeBalance = new Price(0);
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

ShopTradeCurrency.prototype.reserve = function () {
    this.log.debug("Reserving currency...");
    this.loadAssets();

    var partnerCurrencyItems = this.getPartnerCurrencyItems();
    var ourCurrencyItems = this.shop.sections["currency"].getItems();

    var value = 0;
    for (var i = 0; i < partnerCurrencyItems.length; i += 1) {
        value += partnerCurrencyItems[i].getPrice();
    }
    this.log.debug("Partner currency accounts to: " + (new Price(value, "scrap")).toMetal());

    // > Getting currency items
    if (this.getSignedTradeBalance() > 0) { //We have to receive currency, our items worth more
        this.log.debug("We have to receive currency");
        this.balanceAssets(partnerCurrencyItems, ourCurrencyItems);
    } else { //We have to give currency, their items worth more
        this.log.debug("We have to give currency");
        this.balanceAssets(ourCurrencyItems, partnerCurrencyItems);
    }
    //So are we okay now?
    if (this.getTradeBalance() === 0) {
        this.log.debug("Alright, currency is balanced");
        this.reserveAssets();
        this.emit("reserved");
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
            var checkIfCrafted = function (newItems) {
                self.log.debug("Detected new items");
                self.log.debug(bot.steamClient.lastCraftedItems);
                for (var i = 0; i < newItems.length; i += 1) {
                    self.log.debug(newItems[i].getItem().getID());
                    for (var p = 0; p < bot.steamClient.lastCraftedItems.length; p += 1) {
                        if (newItems[i].getItem().getID() === bot.steamClient.lastCraftedItems[p]) {
                            self.iSmelted += 1;
                            self.reserve();
                            checkIfCrafted = null;
                            return;
                        }
                    }
                }
                self.log.warning("It wasn't the newly crafted item!");
            };
            this.shop.on("sectionItemsUpdated", checkIfCrafted);
        } else {
            this.log.error("We already smelt metal twice (ref>rec>scrap). Got request to smelt again?!");
        }
    }
};

ShopTradeCurrency.prototype.loadAssets = function () {
    this.assets = this.shopTrade.getAssets();
};

ShopTradeCurrency.prototype.cleanAssets = function () {
    for (var i = 0; i < this.shopTrade.assets.length; i += 1) {
        if (this.shopTrade.assets[i].isCurrency()) {
            this.shopTrade.assets.splice(i, 1);
        }
    }
};

ShopTradeCurrency.prototype.reserveAssets = function () {
    for (var i = 0; i < this.shopTrade.assets; i += 1) {
        if (!this.shopTrade.assets[i].isMineItem() && this.shop.reservations.exist(this.shopTrade.assets[i].getID())) {
            this.shop.reservations.add(this.shopTrade.getPartner().getSteamid(), this.shopTrade.assets[i].getID());
        }
    }
};

/**
 * @returns {ShopItem[]}
 */
ShopTradeCurrency.prototype.getPartnerCurrencyItems = function () {
    if (!this.partnerCurrencyItems) {
        this.partnerCurrencyItems = [];
        var partnerItems = this.shopTrade.getPartner().getTF2Backpack().getItems();
        for (var i = 0; i < partnerItems.length; i += 1) {
            if (partnerItems[i].isCurrency()) {
                this.partnerCurrencyItems.push(new ShopItem(this.shop, partnerItems[i], "mine"));
            }
        }
    }
    return this.partnerCurrencyItems;
};

ShopTradeCurrency.prototype.balanceAssets = function (currencyGiverItems, currencyReceiverItems) {
    var p, i;
    /**
     * @type {ShopItem}
     */
    var extraChangeCurrency;
    this.log.debug("Trying to compensate with currency giver items...", 1);
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
                        //This right item could save our life,   if we discover that our compensation is not precise
                        extraChangeCurrency = currencyGiverItem;
                        this.log.debug("Save our life: " + extraChangeCurrency, 1);
                        break;
                    }
                }
            }
        }
    }
    //Removing items that would just add extra shit that can't reach compensation while the ourExtraChangeCurrency would be enough
    if (this.getTradeBalance() < 0) {
        for (i = this.assets.length - 1; i > 0; i -= 1) {
            if (this.assets[i].isCurrency()) {
                currencyGiverItem = this.assets[i];
                if (this.getTradeBalance() + extraChangeCurrency.getPrice() - currencyGiverItem.getPrice() > 0) {
                    this.assets.splice(i, 1);
                }
            }
        }
    }

    //If my currency is not precise (eg there's need to smelt some metal) we try first to compensate with partner currency
    //In this case ourExtraChangeCurrency will be defined
    if (this.getTradeBalance() < 0 && extraChangeCurrency instanceof ShopItem) {
        this.log.debug("Giver currency is not precise, looking for receiver change...", 1);
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
                    } else if (extraChangeCurrency.isMineItem()) {
                        this.setSmeltingItem(currencyReceiverItem);
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