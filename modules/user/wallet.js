// Sfuminator.tf | User Wallet Class

module.exports = Wallet;

var Price = require('../price.js');
var LogLog = require('log-log');

/**
 * @param user {User}
 * @param balance {[Number]}
 * @class Wallet
 * @constructor
 */
function Wallet(user, balance) {
    this.user = user;
    this.db = this.user.db;
    this.queries = Wallet.QUERIES;
    this.sfuminator = this.user.sfuminator;
    this.shop = this.sfuminator.shop;
    this.responses = this.sfuminator.responses;
    this.log = LogLog.create({applicationName: "Wallet " + this.getOwner(), color: "cyan", dim: true});
    if (!isNaN(balance)) {
        this.balance = balance;
    } else {
        this.balance = 0;
        this.load();
    }
}

Wallet.prototype.getOwner = function () {
    return this.user.getSteamid();
};

/**
 * @returns {Price}
 */
Wallet.prototype.getBalance = function () {
    return new Price(this.balance, "scrap");
};

Wallet.prototype.updateBalance = function (delta) {
    this.log.debug("Updating wallet: " + delta);
    this.balance += delta;
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.update(self.getOwner(), delta), function () {
            connection.release();
        });
    })
};

Wallet.prototype.withdraw = function (callback) {
    if (this.balance > 0) {
        if (!this.sfuminator.status.canTrade() && !this.sfuminator.isAdmin(this.getOwner())) {
            callback(this.responses.cannotTrade(this.sfuminator.status.get()));
            return false;
        }
        if (this.user.canTrade()) {
            var trade = this.user.makeShopTrade({});
            trade.setMode("offer");
            trade.setAsWithdrawTrade();
            trade.getCurrencyHandler().forceStartingBalance(new Price(-this.getBalance().toScrap(), "scrap"));
            this.sfuminator.startTrade(trade, callback);
            return true;
        } else {
            callback(this.sfuminator.getCannotTradeResponse(this.user));
        }
    } else {
        callback(this.responses.walletEmpty);
    }
    return false;
};

Wallet.prototype.load = function () {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.load(self.getOwner()), function (result, isEmpty) {
            connection.release();
            if (!isEmpty && !isNaN(result[0].wallet)) {
                self.balance = result[0].wallet
            } else {
                self.log.error("No value found for wallet!? Defaulting to 0");
                self.balance = 0;
            }
        });
    });
};

Wallet.prototype.valueOf = function () {
    return {
        owner: this.getOwner(),
        balance: this.getBalance().toScrap(),
        toKeys: this.getBalance().toKeys()
    }
};

Wallet.QUERIES = {
    load: function (steamid) {
        return "SELECT `wallet` FROM `users` WHERE `steam_id`='" + steamid + "'";
    },
    update: function (steamid, delta) {
        return "UPDATE `users` SET `wallet`=`wallet`+" + delta + " WHERE `steam_id`='" + steamid + "'";
    }
};