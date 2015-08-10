module.exports = AjaxResponses;
function AjaxResponses(sfuminator) {
    this.sfuminator = sfuminator;
    this.error = {result: "error", message: "Error"};
    this.methodNotRecognised = {result: "error", message: "Method not recognised"};
    this.notLogged = {result: "error", message: "You are not logged in"};
    this.noItems = {result: "error", message: "No items selected"};
    this.itemNotFound = {result: "error", message: "One or more selected items were not found"};
    this.itemIsAlreadyReserved = {result: "error", message: "One or more selected items have been already reserved"};
    this.sectionNotFound = {result: "error", message: "Shop section not found"};
    this.itemCantBeSold = {result: "error", message: "Selected item can't be sold"};
    this.alreadyInTrade = {result: "error", message: "You are already in trade"};
    this.notInTrade = {result: "error", message: "You are not in trade"};
    this.shopTradeCooldown = function (last_update_date) {
        return {result: "error", message: "You have to wait " + (parseInt((this.sfuminator.shopTrade_decay - (new Date() - last_update_date)) / 1000) + 1) + " seconds before another trade"};
    };
    this.tradeRequestSuccess = function (trade) {
        return {result: "success", trade: trade.valueOf()};
    };
    this.tradeCancelled = {result: "success", message: "Trade has been cancelled"};
    this.shopAssetsLimit = function (limit) {
        return {result: "error", message: "Sorry, you can buy only " + limit + " items per trade in this Beta"};
    };
    this.partnerAssetsLimit = function (limit) {
        return {result: "error", message: "Sorry, you can sell only " + limit + " items per trade in this Beta"};
    };
}

AjaxResponses.prototype.make = function (data) {
    return new Response(data);
};
function Response(data) {
    for (var property in data) {
        this[property] = data[property];
    }
}

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
Response.prototype.isObjectEmpty = function (obj) {
    var is_empty = true;
    for (var i in obj) {
        is_empty = false;
        break;
    }
    return is_empty;
};