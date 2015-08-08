module.exports = AjaxResponses;

function AjaxResponses() {
    this.error = {result: "error", message: "Error"};
    this.notLogged = {result: "error", message: "You are not logged in"};
    this.noItems = {result: "error", message: "No items specified"};
    this.itemNotFound = {result: "error", message: "One or more selected items were not found"};
    this.itemIsAlreadyReserved = {result: "error", message: "One or more selected items have been already reserved"};
    this.sectionNotFound = {result: "error", message: "Shop section not found"};
    this.itemCantBeSold = {result: "error", message: "Selected item can't be sold"};
    this.alreadyInTrade = {result: "error", message: "You are already in trade"};
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