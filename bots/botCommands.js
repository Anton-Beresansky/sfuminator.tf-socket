module.exports = BotCommands;

var Price = require('./../modules/price.js');
var ShopTrade = require('./../modules/shop/shopTrade.js');

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
        preleva: function (steamid, command) {
            if (!isNaN(command.getMainParameter())) {
                var prelievoAmount = new Price(-command.getMainParameter(), "metal");
                var shopTrade = new ShopTrade(self.sfuminator, self.sfuminator.users.get(steamid));
                var tradeBot = self.sfuminator.getTradingController().getBestAvailableBot();
                if (tradeBot) {
                    shopTrade.setBot(tradeBot);
                    shopTrade.getCurrencyHandler().forceStartingBalance(prelievoAmount);
                    shopTrade.onceItemsReserved(function () {
                        var steamTrade = tradeBot.createSteamTrade(shopTrade);
                        steamTrade.setMessage("Here's a prelievo of " + (-prelievoAmount.toMetal()) + " refined");
                        steamTrade.make();
                    });
                    shopTrade.reserveItems();
                }
            }
        }
    }
}

/**
 * @param steamid
 * @param raw_message
 */
BotCommands.prototype.execute = function (steamid, raw_message) {
    if (this.sfuminator.isAdmin(steamid)) {
        var command = new ChatCommand(raw_message);
        if (command.isValid() && this.commands.hasOwnProperty(command.getInstruction())) {
            this.commands[command.getInstruction()](steamid, command);
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
    console.log(this.instruction, this.parameters);
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
        if (!isNaN(this.parameters[i]) && parseInt(this.parameters[i]) < ChatCommand.BIGGEST_NUMBER) {
            this.parameters[i] = parseInt(this.parameters[i]);
        }
    }
};