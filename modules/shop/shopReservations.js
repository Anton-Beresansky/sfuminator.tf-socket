module.exports = Reservations;

var Logs = require("../../lib/logs.js");
var ReservationsVersioning = require("../../lib/dataVersioning.js");

function Reservations(db) {
    this.db = db;
    this.log = new Logs("Reservations");
    this.versioning = new ReservationsVersioning(50);
    this.list = [];
}

Reservations.prototype.add = function (steamid, itemID) {
    if (!this.exist(itemID)) {
        var myReservation = new Reservation(steamid, itemID);
        this.list.push(myReservation);
        this.versioning.add([myReservation.valueOf()], []);
        this.saveChange("add", myReservation);
    } else {
        this.log.warning("Couldn't reserve item (" + itemID + ") for " + steamid + ", reservation already exist for " + this.get(itemID).getHolder());
    }
};

Reservations.prototype.cancel = function (itemID, callback) {
    var self = this;
    if (this.exist(itemID)) {
        var myReservationIndex = this.getIndex(itemID);
        var myReservation = this.get(itemID);
        this.saveChange("cancel", myReservation, function () {
            self.versioning.add([], [myReservation.valueOf()]);
            self.list.splice(myReservationIndex, 1);
            if (typeof callback === "function") {
                callback();
            }
        });
    } else {
        this.log.warning("Couldn't cancel reservation for item " + itemID + ", reservation doesn't exist");
    }
};

Reservations.prototype.load = function (callback) {
    var self = this;
    this.log.debug("Loading up...");
    this.db.connect(function (connection) {
        connection.query(self._loadQuery(), function (result) {
            connection.release();
            if (result) {
                for (var i = 0; i < result.length; i += 1) {
                    var dbReservation = result[i];
                    if (self.exist(dbReservation.id)) {
                        var localReservation = self.get(dbReservation.id);
                        if (localReservation.getDate() < dbReservation.reservation_date) {
                            self.log.warning("Found reservation conflict (" + dbReservation.id + "), updating with most recent date");
                            self.add(dbReservation.steamid, dbReservation.id);
                        }
                    } else {
                        self.add(dbReservation.steamid, dbReservation.id);
                    }
                }
            }
            callback();
        });
    });
};

Reservations.prototype.saveChange = function (action, reservation, callback) {
    var self = this;
    this.log.debug("Saving...");
    this.db.connect(function (connection) {
        connection.query(self._saveChangeQuery(action, reservation), function () {
            connection.release();
            if (typeof callback === "function") {
                callback();
            }
        });
    });
};

Reservations.prototype.exist = function (itemID) {
    return this.get(itemID).getHolder() !== "";
};

Reservations.prototype.getClientChanges = function (last_update_date) {
    last_update_date = new Date(last_update_date);
    if (last_update_date.toString() !== "Invalid Date") {
        this.log.debug("Getting changes: " + last_update_date, 3);
        var reservationChanges = this.versioning.get(last_update_date);
        if (reservationChanges) {
            var reservations = [];
            reservations = reservations.concat(reservationChanges.toAdd);
            for (var i = 0; i < reservationChanges.toRemove.length; i += 1) {
                reservationChanges.toRemove[i].reserved_to = "";
                reservations.push(reservationChanges.toRemove[i]);
            }
            reservations.sort(function (a, b) {
                if (a.date > b.date)
                    return 1;
                if (a.date < b.date)
                    return -1;
                return 0;
            });
            for (var i = 0; i < reservations.length; i += 1) {
                reservations[i].date = reservations[i].date.getTime();
            }
            return reservations;
        }
    }
    return false;
};

Reservations.prototype.getClientList = function () {
    var clientList = [];
    for (var i = 0; i < this.list.length; i += 1) {
        clientList.push(this.list[i].valueOf());
    }
    return clientList;
};

Reservations.prototype.get = function (itemID) {
    var reservationIndex = this.getIndex(itemID);
    if (reservationIndex >= 0) {
        return this.list[reservationIndex];
    } else {
        return new Reservation("", itemID);
    }
};

Reservations.prototype.getIndex = function (itemID) {
    for (var i = 0; i < this.list.length; i += 1) {
        if (this.list[i].getID() === itemID) {
            return i;
        }
    }
    return -1;
};

Reservations.prototype._loadQuery = function () {
    return "SELECT `id`, `holder`, `reservation_date` FROM `shop_reservations`";
};

Reservations.prototype._saveChangeQuery = function (action, reservation) {
    if (action === "cancel") {
        return "DELETE FROM `shop_reservations` WHERE `id`=" + reservation.getID();
    } else if (action === "add") {
        return "INSERT INTO `shop_reservations` (`id`,`holder`) VALUES(" + reservation.getID() + ",'" + reservation.getHolder() + "') " +
                "ON DUPLICATE KEY UPDATE `holder`='" + reservation.getHolder() + "'";
    }
};

function Reservation(steamid, itemID) {
    this.holder = steamid;
    this.id = itemID;
    this.reservation_date = new Date();
}

Reservation.prototype.valueOf = function () {
    return {id: this.id, reserved_to: this.holder, date: new Date().getTime()};
};

Reservation.prototype.getID = function () {
    return this.id;
};

Reservation.prototype.getHolder = function () {
    return this.holder;
};

Reservation.prototype.getDate = function () {
    return this.reservation_date;
};