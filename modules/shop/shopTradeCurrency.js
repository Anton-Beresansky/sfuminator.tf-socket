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
        return -balance;
    }
    return balance;
};

ShopTradeCurrency.prototype.getSignedTradeBalance = function () {
    this.currencyTradeBalance = new Price(0);
    for (var i = 0; i < this.shopTrade.assets.length; i += 1) {
        var asset = this.shopTrade.assets[i];
        if (this.shopTrade.assets[i].isMineItem()) {
            this.currencyTradeBalance -= asset.getPrice();
        } else {
            this.currencyTradeBalance += asset.getPrice();
        }
    }
    this.log.debug("Trade balance is: " + this.currencyTradeBalance);
    return this.currencyTradeBalance;
};

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

ShopTradeCurrency.prototype.getBalanceItems = function (currencyGiverItems, currencyReceiverItems) {
    var p, i;
    this.log.debug("Trying to compensate with our own currency...");
    //Trying to compensate with the currency we own
    //This procedure will result in a perfect compensation or something that's slightly less
    for (p = 0; p < this.sortedCurrencyDefindexes.length; p += 1) {
        for (i = 0; i < currencyGiverItems.length; i += 1) {
            var giverCurrencyItem = currencyGiverItems[i];
            //If not reserved or just mine
            if (giverCurrencyItem.isMineItem() || !this.shop.reservations.exist(giverCurrencyItem.getID())) {
                //If it is the type we are looking for (eg ref/rec/scrap)
                if (giverCurrencyItem.getItem().getDefindex() === this.sortedCurrencyDefindexes[p]) {
                    //If by adding this currency balance won't overflow
                    if (this.getTradeBalance() + giverCurrencyItem.getPrice() <= 0) {
                        this.shopTrade.assets.push(giverCurrencyItem);
                    } else {
                        //This right item could save our life, if we discover that our compensation is not precise
                        var ourExtraChangeCurrency = giverCurrencyItem;
                        this.log.debug("Save our life: " + ourExtraChangeCurrency);
                        break;
                    }
                }
            }
        }
    }
    //Removing items that would just add extra shit that can't reach compensation while the ourExtraChangeCurrency would be enough
    if (this.getTradeBalance() < 0) {
        for (i = this.shopTrade.assets.length - 1; i > 0; i -= 1) {
            if (this.shopTrade.assets[i].isCurrency()) {
                giverCurrencyItem = this.shopTrade.assets[i];
                if (this.getTradeBalance() + ourExtraChangeCurrency.getPrice() - giverCurrencyItem.getPrice() > 0) {
                    this.shopTrade.assets.splice(i, 1);
                }
            }
        }
    }

    //If my currency is not precise (eg there's need to smelt some metal) we try first to compensate with partner currency
    //In this case ourExtraChangeCurrency will be defined
    if (this.getTradeBalance() < 0) {
        this.log.debug("Our currency is not precise, looking for partner change...");
        var currencyTradeBalanceTest = this.getTradeBalance();
        var receiverCurrencyBalancing = [];
        for (p = 0; p < this.sortedCurrencyDefindexes.length; p += 1) {
            for (i = 0; i < currencyReceiverItems.length; i += 1) {
                var currencyReceiverItem = currencyReceiverItems[i];
                //If it is the type we are looking for (eg ref/rec/scrap)
                if (currencyReceiverItem.getItem().getDefindex() === this.sortedCurrencyDefindexes[p]) {
                    //If by adding this currency balance won't underflow
                    if (currencyTradeBalanceTest + ourExtraChangeCurrency.getPrice() - currencyReceiverItem.getPrice() >= 0) {
                        receiverCurrencyBalancing.push(currencyReceiverItem);
                        currencyTradeBalanceTest -= currencyReceiverItem.getPrice();
                    } else {
                        break;
                    }
                }
            }
            if (currencyTradeBalanceTest + ourExtraChangeCurrency.getPrice() === 0) {
                //We were able to compensate currency balance with partner items! -> Reserve the extra shit thing
                this.log.debug("Partner has change, using it");
                this.shopTrade.assets.push(ourExtraChangeCurrency);
                this.shopTrade.assets = this.shopTrade.assets.concat(receiverCurrencyBalancing);
                break;
            }
        }
    }
};

ShopTradeCurrency.prototype.reserve = function () {
    this.log.debug("Reserving currency...");

    var partnerCurrencyItems = this.getPartnerCurrencyItems();
    var ourCurrencyItems = this.shop.sections["currency"].getItems();
    var i;

    // > Getting currency items
    if (this.getSignedTradeBalance() > 0) { //We have to receive currency, our items worth more
        this.log.debug("We have to receive currency");
        this.getBalanceItems(partnerCurrencyItems, ourCurrencyItems);
    } else { //We have to give currency, their items worth more
        this.log.debug("We have to give currency");
        this.getBalanceItems(ourCurrencyItems, partnerCurrencyItems);
    }
    //So are we okay now?
    if (this.getTradeBalance() === 0) {
        this.log.debug("Alright, currency is balanced");
        for (i = 0; i < this.shopTrade.assets; i += 1) {
            if (!this.shopTrade.assets[i].isMineItem() && this.shop.reservations.exist(this.shopTrade.assets[i].getID())) {
                this.shop.reservations.add(this.shopTrade.getPartner().getSteamid(), this.shopTrade.assets[i].getID());
            }
        }
        this.emit("reserved");
    } else {
        this.log.debug("Smelting is needed");
        this.emit("reserved");
        //Sorry man we can't do much unless we are going to smelt something, so let's do it...
    }
};