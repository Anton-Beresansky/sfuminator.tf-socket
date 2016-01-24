module.exports = BotsController;

var Logs = require('./../../lib/logs.js');
var TraderBot = require('./../../bots/traderBot.js');
var BotCommands = require('./../../bots/botCommands.js');
var TransferNodesCluster = require('./assetsTransfer.js');
var TF2Constants = require("./../tf2/tf2Constants.js");

/**
 * @class BotsController
 * @parameter {Sfuminator} sfuminator
 * @constructor
 */
function BotsController(sfuminator) {
    /**
     * @type {Sfuminator}
     */
    this.sfuminator = sfuminator;
    /**
     * @type {Shop}
     */
    this.shop = this.sfuminator.shop;
    /**
     * @type {TraderBot[]}
     */
    this.tradeBots = [];

    this.preSmeltedQuantity = 12;

    this.commands = new BotCommands(this.sfuminator);
    this.log = new Logs({applicationName: "Bots Controller", color: "blue", dim: true});

    this.loadBots();
    this._bindHandlers();
}

BotsController.prototype._bindHandlers = function () {
    for (var i = 0; i < this.tradeBots.length; i += 1) {
        this._bindBotHandler(this.tradeBots[i]);
    }
};

/**
 * @param {TraderBot} bot
 * @private
 */
BotsController.prototype._bindBotHandler = function (bot) {
    var self = this;
    bot.steamClient.on('newFriend', function (friend) {
        self.log.debug("Loading user " + friend.getSteamid());
        self.sfuminator.users.get(friend.getSteamid());
    });
    bot.steamClient.on('message', function (steamid, message) {
        self.commands.execute(steamid, message, bot);
    });
};

BotsController.prototype.loadBots = function () {
    var tradeBotSteamids = this.sfuminator.getCFG().getTradeBotSteamids();
    for (var i = 0; i < tradeBotSteamids.length; i += 1) {
        this.tradeBots.push(new TraderBot(this.sfuminator.shop.getBotUser(tradeBotSteamids[i]), this.sfuminator));
    }
};

/**
 * @param {String} steamid
 * @returns {TraderBot}
 */
BotsController.prototype.getBot = function (steamid) {
    for (var i = 0; i < this.tradeBots.length; i += 1) {
        if (this.tradeBots[i].getSteamid() === steamid) {
            return this.tradeBots[i];
        }
    }
};

BotsController.prototype.assignBot = function (shopTrade) {
    var i;
    var assignedBot = this.getBestAvailableBot();
    var ownerList = this._getOwnerList(shopTrade.getAssets());
    this.log.test("Owner list: " + JSON.stringify(ownerList));
    //Verify that all bots are available for the requested items
    for (i = 0; i < ownerList.length; i += 1) {
        if (!this.getBot(ownerList[i].owner).isAvailable()) {
            shopTrade.emit("tradeRequestResponse", this.sfuminator.responses.botIsNotAvailable);
            return false;
        }
    }
    if (ownerList.length > 0) { //If bot have shop items to give
        assignedBot = this.getBot(ownerList[0].owner); //Go with the one with most items (Can be the only as well)
        for (i = 0; i < ownerList.length; i += 1) { //But if there is one already friend go with it
            var bot = this.getBot(ownerList[i].owner);
            if (bot.steamClient.isFriend(shopTrade.getPartner().getSteamid())) {
                assignedBot = bot;
                break;
            }
        }
    }

    shopTrade.setBot(assignedBot.getUser());
    return true;
};

/**
 * @param {ShopTrade} newShopTrade
 */
BotsController.prototype.startOffNewShopTrade = function (newShopTrade) {
    var assignedBot = this.getBot(newShopTrade.getAssignedBotUser().getSteamid());
    assignedBot.sendShopTrade(newShopTrade);
};

/**
 * @returns {TraderBot|Boolean}
 */
BotsController.prototype.getBestAvailableBot = function () {
    var bestBot = false;
    for (var i = 0; i < this.tradeBots.length; i += 1) {
        if (this.tradeBots[i].isAvailable()) {
            if (!(bestBot instanceof TraderBot)) {
                bestBot = this.tradeBots[i];
            } else if (this.tradeBots[i].getUser().getTF2Backpack().getCount() < bestBot.getUser().getTF2Backpack().getCount()) {
                bestBot = this.tradeBots[i];
            }
        }
    }
    return bestBot;
};

/**
 * @param {TraderBot} receiver
 * @param {ShopItem[]} items
 * @param {Function} [callback]
 */
BotsController.prototype.transfer = function (receiver, items, callback) {
    var cluster = new TransferNodesCluster(this, receiver);
    for (var i = 0; i < items.length; i += 1) {
        cluster.addItem(items[i]);
    }
    cluster.beginTransfer();
    cluster.onceCompleted(function () {
        if (typeof callback === "function") {
            callback(null);
        }
    });
    cluster.on("error", function () {
        callback(new Error());
    });
};

BotsController.prototype.preSmeltMetal = function () {
    var self = this;
    /**
     * @param {TraderBot} bot
     */
    var preSmelt = function (bot) {
        var backpack = bot.getUser().getTF2Backpack();
        backpack.getCached(function () {
            var metalToSmeltDefindexes = [
                TF2Constants.defindexes.RefinedMetal,
                TF2Constants.defindexes.ReclaimedMetal,
                TF2Constants.defindexes.ScrapMetal
            ];
            for (var i = 0; i < 2; i += 1) {
                var count = backpack.getCount({defindex: metalToSmeltDefindexes[i + 1]});
                if (count < self.preSmeltedQuantity) {
                    self.log.debug("PreSmelting metal, count for " + metalToSmeltDefindexes[i + 1] + " is " + count);
                    var itemsLength = backpack.getItems().length;
                    var filter = {id: []};
                    while (itemsLength -= 1) {
                        var itemsToSmelt = backpack.getItems(filter, {defindex: metalToSmeltDefindexes[i]}, 1);
                        if (itemsToSmelt.length) {
                            if (!self.sfuminator.shop.reservations.exist(itemsToSmelt[0].getID())) {
                                bot.steamClient.craftTF2Items(itemsToSmelt);
                                break;
                            } else {
                                filter.id.push(itemsToSmelt[0].getID());
                            }
                        }
                    }
                }
            }
        });
    };
    for (var i = 0; i < this.tradeBots.length; i += 1) {
        preSmelt(this.tradeBots[i]);
    }
};

BotsController.prototype.manageItemsDistribution = function () {
    var compensationSpaceLimitPercentile = 0.95;
    var distribution = {};
    var totalRefineds = [];
    for (var i = 0; i < this.tradeBots.length; i += 1) {
        var allItems = this.tradeBots[i].getUser().getTF2Backpack().getItems();
        var refinedMetals = this.tradeBots[i].getUser().getTF2Backpack().getItems(null, {defindex: TF2Constants.defindexes.RefinedMetal});
        distribution[this.tradeBots[i].getSteamid()] = {
            refineds: refinedMetals,
            allItems: allItems
        };
        totalRefineds = totalRefineds.concat(refinedMetals);
    }
    var singleBotAmount = totalRefineds.length / this.tradeBots.length;
    this.log.test("Total refineds are " + totalRefineds.length + " each bot should have " + singleBotAmount + " +-" + (singleBotAmount * 0.2));
    var minimumAmount = singleBotAmount * 0.8;
    for (var botSteamid in distribution) {
        var refinedsBotAmount = distribution[botSteamid].refineds.length;
        var itemsBotAmount = distribution[botSteamid].allItems.length;
        if (refinedsBotAmount < minimumAmount) {
            var compensationCount = singleBotAmount - refinedsBotAmount;
            var totalCountAfterCompensation = itemsBotAmount + compensationCount;
            var totalSlots = this.getBot(botSteamid).getUser().getTF2Backpack().getTotalSlots();
            this.log.test("Bot " + botSteamid + " is " + refinedsBotAmount + " need compensation of " + compensationCount);
            this.log.test("Compensating would increase bot items from " + itemsBotAmount + " to " + totalCountAfterCompensation);
            if (totalCountAfterCompensation < (totalSlots * compensationSpaceLimitPercentile)) {
                this.log.test("Which wouldn't exceed " + parseInt(compensationSpaceLimitPercentile * 100) + "% of space, since maximum is " + totalSlots);
            } else {
                this.log.test("Which would exceed " + parseInt(compensationSpaceLimitPercentile * 100) + "% of space, since maximum is " + totalSlots);
                compensationCount = (totalSlots * compensationSpaceLimitPercentile) - itemsBotAmount;
            }
            this.log.test("We will compensate: " + compensationCount + " refineds");
            distribution[botSteamid].compensationCount = compensationCount;
        }
    }
};

/**
 * @param {ShopItem[]} assets
 */
BotsController.prototype._getOwnerList = function (assets) {
    var ownerList = [];
    for (var i = 0; i < assets.length; i += 1) {
        if (!assets[i].isMineItem()) {
            var owner = assets[i].getItem().getOwner();
            var found = false;
            for (var p = 0; p < ownerList.length; p += 1) {
                if (ownerList[p].owner === owner) {
                    found = true;
                    break;
                }
            }
            if (found) {
                ownerList[p].count += 1;
            } else {
                ownerList.push({owner: owner, count: 1});
            }
        }
    }
    ownerList.sort(function (a, b) {
        if (a.count > b.count) {
            return -1;
        }
        if (a.count < b.count) {
            return 1;
        }
        return 0;
    });
    return ownerList;
};