// Sfuminator.tf | Bot chat control interface

module.exports = BotCommands;

var Price = require('../price.js');
var ShopTrade = require('../shop/shopTrade.js');

/**
 * @parameter {Sfuminator} sfuminator
 * @constructor
 */
function BotCommands(sfuminator) {
    /**
     * @type {Sfuminator}
     */
    this.sfuminator = sfuminator;
    var self = this;
    this.commands = {
        preleva: function (steamid, command, bot) {
            var prelievoAmount = new Price(-100, "metal");
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
        c: function (steamid, command, bot) {
            bot.steamClient.sendMessage(steamid, bot.steamClient.credentials.getTwoFactorCode());
        },
        testComment: function (steamid, command, bot) {
            bot.steamClient.postProfileComment(steamid, "Hum?");
        },
        log: function (steamid, command, bot) {
            try {
                var properties = [];
                if (command.getMainParameter()) {
                    properties = command.getMainParameter().split(".");
                }
                var object = self.sfuminator;
                for (var i = 0; i < properties.length; i += 1) {
                    object = object[properties[i]];
                }
                console.log(object);
                bot.steamClient.sendMessage(steamid, "Logged");
            } catch (e) {
                bot.steamClient.sendMessage(steamid, "Wasn't able to log: " + e)
            }
        }
    }
}

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