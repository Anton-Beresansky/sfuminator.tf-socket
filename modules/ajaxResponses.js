module.exports = AjaxResponses;

/**
 * Generic purpose Ajax Responses class
 * @param {Sfuminator} sfuminator The Sfuminator instance
 * @returns {AjaxResponses}
 * @construct
 */
function AjaxResponses(sfuminator) {
    //Result can be: "error", "warning", "success"
    this.sfuminator = sfuminator;
    this.error = {result: "error", message: "Error", code: "error"};
    this.methodNotRecognised = {result: "error", message: "Method not recognised", code: "method_not_recognised"};
    this.notLogged = {result: "error", message: "You are not logged in", code: "not_logged"};
    this.noItems = {result: "error", message: "No items selected", code: "no_items_selected"};
    this.itemsSelectedNotFound = {result: "error", message: "One or more selected items were not found", code: "no_items_found"};
    this.itemIsAlreadyReserved = {result: "error", message: "One or more selected items have been already reserved", code: "items_already_reserved"};
    this.sectionNotFound = {result: "error", message: "Shop section not found", code: "section_not_found"};
    this.itemCantBeSold = {result: "error", message: "Selected item can't be sold", code: "cant_sell_item"};
    this.alreadyInTrade = {result: "error", message: "You are already in trade", code: "already_in_trade"};
    this.notInTrade = {result: "error", message: "You are not in trade", code: "not_in_trade"};
    this.notEnoughCurrency = {result: "error", message: "Sorry, but it seems you don't have enough metal", code: "not_enough_metal"};
    this.botIsNotAvailable = {result: "error", message: "Sorry, bot can't trade right now", code: "bot_cannot_trade"};
    this.cannotGatherItems = {result: "error", message: "Sorry, there was a problem when gathering items from bots, please retry later", code: "cannot_transfer"};
    this.denyManualMultiItems = {
        result: "error",
        message: "Sorry, in manual trade you can only sell or only buy items",
        code: "cant_do_manual"
    };
    this.shopTradeCooldown = function (last_update_date) {
        return {
            result: "error",
            message: "You have to wait " + (parseInt((this.sfuminator.shopTrade_decay - (new Date() - last_update_date)) / 1000) + 1) + " seconds before another trade",
            code: "trade_cooldown"
        };
    };
    this.tradeRequestSuccess = function (trade) {
        return {result: "success", trade: trade.valueOf(), code: "success"};
    };
    this.tradeCancelled = {result: "success", message: "Trade has been cancelled", code: "trade_cancelled"};
    this.shopAssetsLimit = function (limit) {
        return {result: "error", message: "Sorry, you can buy only " + limit + " items per trade", code: "hat_limit"};
    };
    this.partnerAssetsLimit = function (limit) {
        return {result: "error", message: "Sorry, you can sell only " + limit + " items per trade", code: "hat_limit"};
    };
    this.itemExceedCount = function (item, excess) {
        return {
            result: "error",
            message: "Sorry, you have to remove " + ((excess > 1) ? (excess + " ") : "") + '"' + item.getFullName() + '", there are too many in the shop right now',
            code: "single_hat_limit"
        };
    };
    this.itemNotFound = {result: "error", message: "No item found in the shop", code: ""};
    this.cannotTrade = function (steam_status) {
        if (steam_status === "steam_down") {
            return {
                result: "error",
                message: "Sorry, steam is not working properly at the moment, come back in a few minutes.",
                code: "steam_down"
            };
        } else if (steam_status === "maintenance") {
            return {
                result: "error",
                message: "Sorry, bots are down for maintenance at the moment, come back in a few minutes.",
                code: "bot_maintenance"
            };
        } else {
            return {result: "error", message: "Sorry, trading is disabled, come back in a few minutes.", code: "trading_disabled"};
        }
    };
    this.shopTrade_declined = {result: "warning", message: "You declined the trade offer"};
    this.shopTrade_afk = {result: "warning", message: "Sorry, trade took too much to accept"};
}

/**
 * Generate a new response
 * @param {Object} data
 * @returns {Response}
 */
AjaxResponses.prototype.make = function (data) {
    return new Response(data);
};

/**
 * Generic purpose Response class
 * @param {Object} data
 * @returns {Response}
 */
function Response(data) {
    for (var property in data) {
        this[property] = data[property];
    }
}

/**
 * Compact client formatted update instructions
 */
Response.prototype.compactUserUpdate = function () {
    if (this.methods.hasOwnProperty("updateItemsVersioning")) {
        var itemChanges = this.methods.updateItemsVersioning;
        if (itemChanges.toAdd.length === 0 && itemChanges.toRemove.length === 0) {
            delete this.methods.updateItemsVersioning;
        }
    }
    if (this.methods.hasOwnProperty("updateReservationsVersioning")) {
        if (this.methods.updateReservationsVersioning.length === 0) {
            delete this.methods.updateReservationsVersioning;
        }
    }
    if (this.methods.hasOwnProperty("freshReservations")) {
        if (this.methods.freshReservations.length === 0) {
            delete this.methods.freshReservations;
        }
    }
    for (var method in this.methods) {
        if (this.methods[method] === false || (typeof this.methods[method] === "Object" && this.isObjectEmpty(method))) {
            delete this.methods[method];
        }
    }
    if (this.isObjectEmpty(this.methods)) {
        delete this.methods;
        this.update = false;
    }
};

/**
 * Establish if given object is empty
 * @param {Object} obj
 * @returns {Boolean}
 */
Response.prototype.isObjectEmpty = function (obj) {
    var is_empty = true;
    for (var i in obj) {
        is_empty = false;
        break;
    }
    return is_empty;
};