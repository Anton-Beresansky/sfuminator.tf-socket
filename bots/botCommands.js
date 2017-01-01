module.exports = BotCommands;

var Price = require('./../modules/price.js');
var ShopTrade = require('./../modules/shop/shopTrade.js');
var TF2Constants = require('./../modules/tf2/tf2Constants.js');
var Logs = require('./../lib/logs.js');

/**
 * @parameter {Sfuminator} sfuminator
 * @constructor
 */
function BotCommands(sfuminator) {
    /**
     * @type {Sfuminator}
     */
    this.sfuminator = sfuminator;
    this.log = new Logs({applicationName: "botCommands", color: "yellow", dim: true});
    var self = this;
    this.commands = {
        preleva: function (steamid, command, bot) {
            var prelievoAmount = new Price(-BotCommands.defaultPrelievoAmount, "metal");
            if (!isNaN(command.getMainParameter())) {
                prelievoAmount = new Price(-command.getMainParameter(), "metal");
            }
            var shopTrade = new ShopTrade(self.sfuminator, self.sfuminator.users.get(steamid));
            if (bot) {
                shopTrade.setBot(bot);
                shopTrade.getCurrencyHandler().forceStartingBalance(prelievoAmount);
                shopTrade.onceItemsReserved(function () {
                    var steamTrade = bot.createSteamTrade(shopTrade);
                    steamTrade.setMessage("Here's a prelievo of " + (-prelievoAmount.toMetal()) + " refined");
                    steamTrade.make();
                    bot.steamClient.sendMessage(steamid, "Sending you a prelievo of " + (-prelievoAmount.toMetal()) + " refined");
                });
                shopTrade.getPartner().getTF2Backpack().getCached(function () { //Be sure to load partner bp first
                    shopTrade.reserveItems();
                });
            }
        },
        chiavi: function (steamid, command, bot) {
            var shopTrade = new ShopTrade(self.sfuminator, self.sfuminator.users.get(steamid));
            if (bot) {
                shopTrade.setBot(bot);

                var currencyItems = shopTrade.getCurrencyHandler().getOurCurrencyShopItems();
                var totalKeysAmount = 0;
                for (var i = 0; i < currencyItems.length; i += 1) {
                    if (currencyItems[i].getItem().getDefindex() === TF2Constants.defindexes.MannCoKey) {
                        totalKeysAmount += 1;
                    }
                }
                if (totalKeysAmount > BotCommands.minChiaviLimit) {
                    var chiaviAmount = totalKeysAmount - BotCommands.minChiaviLimit;
                    if (chiaviAmount > BotCommands.minChiaviLimit) {
                        chiaviAmount = BotCommands.minChiaviLimit;
                    }
                    var prelievoAmount = new Price(-chiaviAmount, "keys");
                    shopTrade.getCurrencyHandler().forceStartingBalance(prelievoAmount);
                    shopTrade.onceItemsReserved(function () {

                        self.log.debug("Checking if I'm sending just keys");
                        for (var i = 0; i < shopTrade.assets.length; i += 1) {
                            if (shopTrade.assets[i].getItem().getDefindex() !== TF2Constants.defindexes.MannCoKey) {
                                self.log.debug("Found not key item, removing: " + shopTrade.assets[i].getItem().getFullName());
                            }
                        }
                        if (shopTrade.assets.length) {
                            var steamTrade = bot.createSteamTrade(shopTrade);
                            steamTrade.setMessage("Here's a prelievo of " + (-prelievoAmount.toKeys()) + " chiavi");
                            steamTrade.make();
                            bot.steamClient.sendMessage(steamid, "Sending you a prelievo of " + (-prelievoAmount.toKeys()) + " chiavi. (current stock " + totalKeysAmount + ")");
                        } else {
                            shopTrade.dereserveShopItems();
                            bot.steamClient.sendMessage(steamid, "Keeping Refined/Keys ratio up, can't send trade.");
                        }
                    });
                    shopTrade.getPartner().getTF2Backpack().getCached(function () { //Be sure to load partner bp first
                        shopTrade.reserveItems();
                    });
                } else {
                    bot.steamClient.sendMessage(steamid, "There are " + totalKeysAmount + " keys in stock, can't send trade.");
                }
            }
        },
        c: function (steamid, command, bot) {
            bot.steamClient.sendMessage(steamid, bot.steamClient.credentials.getTwoFactorCode());
        },
        testComment: function (steamid, command, bot) {
            bot.steamClient.postProfileComment(steamid, "Hum?");
        }
    }
}

BotCommands.minChiaviLimit = 100;
BotCommands.defaultPrelievoAmount = 100;

/**
 * @param steamid
 * @param raw_message
 * @param {TraderBot} bot
 */
BotCommands.prototype.execute = function (steamid, raw_message, bot) {
    if (this.sfuminator.isAdmin(steamid)) {
        var command = new ChatCommand(raw_message);
        if (command.isValid() && this.commands.hasOwnProperty(command.getInstruction())) {
            this.commands[command.getInstruction()](steamid, command, bot);
        }
    }
};

/**
 * @param raw_message
 * @constructor
 */
function ChatCommand(raw_message) {
    this.raw_message = raw_message;
    this._parse();
}

ChatCommand.BIGGEST_NUMBER = 1000000;

ChatCommand.prototype.isValid = function () {
    return this.raw_message.length && this.raw_message[0] === "#";
};

ChatCommand.prototype.getInstruction = function () {
    return this.instruction;
};

ChatCommand.prototype.getMainParameter = function () {
    if (this.parameters.length) {
        return this.parameters[0];
    } else {
        return "";
    }
};

ChatCommand.prototype._parse = function () {
    this.parameters = this.raw_message.slice(1).split(" ");
    this.instruction = this.parameters.splice(0, 1);
    for (var i = 0; i < this.parameters.length; i += 1) {
        if (!isNaN(this.parameters[i]) && parseFloat(this.parameters[i]) < ChatCommand.BIGGEST_NUMBER) {
            this.parameters[i] = parseFloat(this.parameters[i]);
        }
    }
};