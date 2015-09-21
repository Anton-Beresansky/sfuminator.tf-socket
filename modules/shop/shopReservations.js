module.exports = Reservations;

var Logs = require("../../lib/logs.js");
var ReservationsVersioning = require("../../lib/dataVersioning.js");

/**
 * @class Reservations
 * @description Shop reservations handler
 * @param {Database} db Database instance
 * @returns {Reservations}
 */
function Reservations(db) {
    this.db = db;
    this.log = new Logs({applicationName: "Reservations", color: "green"});
    this.versioning = new ReservationsVersioning(50, "Reservations");
    this.list = [];
}

/**
 * Add reservation to specified shop item, if item has already a reservation
 * attacched to it, nothing will be done
 * @param {String} steamid Holder steamid
 * @param {Number} itemID
 * @returns {Reservation}
 */
Reservations.prototype.add = function (steamid, itemID) {
    if (!this.exist(itemID)) {
        var myReservation = this.localAdd(steamid, itemID);
        this.saveChange("add", myReservation);
    } else {
        this.log.warning("Couldn't reserve item (" + itemID + ") for " + steamid + ", reservation already exist for " + this.get(itemID).getHolder());
    }
    return myReservation;
};

/**
 * Locally add reservation (reservation is applied only within current running code)
 * @param {String} steamid Holder steamid
 * @param {Number} itemID
 * @returns {Reservation}
 */
Reservations.prototype.localAdd = function (steamid, itemID) {
    var myReservation = new Reservation(steamid, itemID);
    this.list.push(myReservation);
    this.versioning.add([myReservation], []);
    return myReservation;
};

/**
 * Cancel reservation attached to an item given its id
 * @param {Number} itemID
 * @param {Function} [callback] 
 * Callback will not return anything but it will be
 * executed once database query has been executed
 */
Reservations.prototype.cancel = function (itemID, callback) {
    var self = this;
    if (this.exist(itemID)) {
        var myReservation = this.get(itemID);
        this.saveChange("cancel", myReservation, function () {
            self.versioning.add([], [myReservation]);
            self.list.splice(self.getIndex(itemID), 1);
            if (typeof callback === "function") {
                callback();
            }
        });
    } else {
        this.log.warning("Couldn't cancel reservation for item " + itemID + ", reservation doesn't exist");
    }
};

/**
 * Load shop reservations from database
 * <br><br>
 * When executed will add any reservation stored to the current running instance,
 * in case of id conflict most recent reservation will be considered.
 * @param {Function} callback
 * Callback will not return anything but it will be
 * executed once database query has been executed
 */
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
                            self.add(dbReservation.holder, dbReservation.id);
                        }
                    } else {
                        self.localAdd(dbReservation.holder, dbReservation.id);
                    }
                }
            }
            callback();
        });
    });
};

/**
 * Store on database reservation changes
 * @param {String} action Can be 'cancel' or 'add'
 * @param {Reservation} reservation Reservation instance to be saved
 * @param {Function} [callback]
 * Callback will not return anything but it will be
 * executed once database query has been executed
 */
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

/**
 * Checks if any item has a reservation attached to it
 * @param {String} itemID
 * @returns {Boolean}
 */
Reservations.prototype.exist = function (itemID) {
    return this.get(itemID).getHolder() !== "";
};

/**
 * Get shop reservation changes formatted for client (website) usage
 * @param {Date|Number} last_update_date Specify changes starting point
 * @returns {Reservation.valueOf()[]|Boolean} False if invalid parameter is passed
 * <br>See Reservation.valueOf for more info
 */
Reservations.prototype.getClientChanges = function (last_update_date) {
    last_update_date = new Date(last_update_date);
    if (last_update_date.toString() !== "Invalid Date") {
        var reservationChanges = this.versioning.get(last_update_date);
        if (reservationChanges) {
            var reservations = [];
            reservations = reservations.concat(reservationChanges.toAdd);
            for (var i = 0; i < reservationChanges.toRemove.length; i += 1) {
                reservations.push(new Reservation("", reservationChanges.toRemove[i].getID()));
            }
            var clientList = [];
            for (var i = 0; i < reservations.length; i += 1) {
                clientList.push(reservations[i].valueOf());
            }
            clientList.sort(function (a, b) {
                if (a.date > b.date)
                    return 1;
                if (a.date < b.date)
                    return -1;
                return 0;
            });
            this.log.debug("Getting changes: " + last_update_date + " (" + reservations.length + ")", 3);
            return clientList;
        }
    }
    return false;
};

/**
 * Get client formatted reservations list
 * @returns {Reservation.valueOf()[]}
 */
Reservations.prototype.getClientList = function () {
    var clientList = [];
    for (var i = 0; i < this.list.length; i += 1) {
        clientList.push(this.list[i].valueOf());
    }
    return clientList;
};

/**
 * Get reservation for given item id
 * @param {Number} itemID
 * @returns {Reservation} Will return Reservation with empty string holder if doesn't exist
 */
Reservations.prototype.get = function (itemID) {
    var reservationIndex = this.getIndex(itemID);
    if (reservationIndex >= 0) {
        return this.list[reservationIndex];
    } else {
        return new Reservation("", itemID);
    }
};

/**
 * Get index from reservations list given item id
 * @param {Number} itemID
 * @returns {Number}
 */
Reservations.prototype.getIndex = function (itemID) {
    for (var i = 0; i < this.list.length; i += 1) {
        if (this.list[i].getID() === itemID) {
            return i;
        }
    }
    return -1;
};

/**
 * Get load query
 * @returns {String}
 */
Reservations.prototype._loadQuery = function () {
    return "SELECT `id`, `holder`, `reservation_date` FROM `shop_reservations`";
};

/**
 * Get query to save reservation changes
 * @param {String} action Can be "add" or "cancel"
 * @param {Reservation} reservation
 * @returns {String}
 */
Reservations.prototype._saveChangeQuery = function (action, reservation) {
    if (action === "cancel") {
        return "DELETE FROM `shop_reservations` WHERE `id`=" + reservation.getID();
    } else if (action === "add") {
        return "INSERT INTO `shop_reservations` (`id`,`holder`) VALUES(" + reservation.getID() + ",'" + reservation.getHolder() + "') " +
                "ON DUPLICATE KEY UPDATE `holder`='" + reservation.getHolder() + "'";
    }
};

/**
 * @class Reservation
 * @param {String} steamid Holder steamid
 * @param {Number} itemID Item id
 * @returns {Reservation}
 */
function Reservation(steamid, itemID) {
    this.holder = steamid;
    this.id = itemID;
    this.reservation_date = new Date();
}

/**
 * Get data structure of this reservation
 * @returns {Object}
 * valueOf data structure:<br>
 * {<br>
 * &nbsp;id: Number (Item id),<br>
 * &nbsp;reserved_to: String (Holder steamid),<br>
 * &nbsp;date: Number (Date timestamp)<br>
 * }
 */
Reservation.prototype.valueOf = function () {
    return {id: this.id, reserved_to: this.holder, date: new Date().getTime()};
};

/**
 * Get item id
 * @returns {Number}
 */
Reservation.prototype.getID = function () {
    return this.id;
};

/**
 * Get holder steamid
 * @returns {String}
 */
Reservation.prototype.getHolder = function () {
    return this.holder;
};

/**
 * Get date
 * @returns {Date}
 */
Reservation.prototype.getDate = function () {
    return this.reservation_date;
};