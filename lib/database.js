// Sfuminator.tf | Basic database connection and interface

module.exports = Database;
var mysql = require("mysql");
var LogLog = require("log-log");

/**
 * General purpose Database class
 * @class Database
 * @param {Object} options (user,password,database)
 * @returns {Database}
 */
function Database(options) {
    this.log = LogLog.create({applicationName: "Database"});
    this.pool = mysql.createPool({
        host: 'localhost',
        user: options.user,
        password: options.password,
        database: options.database,
        supportBigNumbers: true
    });
}

/**
 * Create connection to the database<br>
 * When transaction is finished releasing connection is needed
 * (See DatabaseConnection.release/DatabaseConnection.commitRelease for more)
 * @param {Function} callback Connection link is passed
 */
Database.prototype.connect = function (callback) {
    var stack = new Error("Call Stack").stack;
    var self = this;
    this.pool.getConnection(function (err, connection) {
        if (err) {
            self.log.error("Error when connecting to database: " + err);
        } else {
            var dbConnection = new DatabaseConnection(connection);
            dbConnection.stack = stack;
            dbConnection.onConnectionDecayTimeout(function () {
                self.log.warning("Connection hasn't be released after " + parseInt(dbConnection.connectionDecay / 1000) + "s, maybe query is taking too much time?");
                self.log.warning(dbConnection.stack);
            });
            callback(dbConnection);
        }
    });
};

/**
 *
 * @param query {String}
 * @param callback
 */
Database.prototype.singleQuery = function (query, callback) {
    this.connect(function (connection) {
        connection.query(query, function (result, isEmpty) {
            connection.release();
            callback(result, isEmpty);
        });
    });
};

/**
 * Single query structure:
 * db.connect() -> connection.query() -> connection.release()
 * Transaction structure:
 * db.connect() -> connection.beginTransaction() -> connection.query() -> connection.commitRelease()
 *
 * General purpose Database Connection class
 * Warning will be fired after certain time if connection is not released
 * @param {mysqlConnection} connection
 * @returns {DatabaseConnection}
 * @construct
 */
function DatabaseConnection(connection) {
    var self = this;
    this.connection = connection;
    this.c = this.connection;
    this.connectionID = randomString(5);
    this.stack = new Error().stack;
    this.log = LogLog.create({applicationName: "Database (#" + self.connectionID + ")"});
    this.log.disableDebug();
    this.connectionDecay = ***REMOVED***0;
    this.connectionDecayTimeout = setTimeout(function () {
        if (typeof self.connectionDecayTimeoutCallback === "function") {
            self.connectionDecayTimeoutCallback();
        }
    }, this.connectionDecay);
}

DatabaseConnection.prototype.createDatabase = function (name, callback) {
    this.query("CREATE DATABASE IF NOT EXISTS `" + name + "`", callback);
};

DatabaseConnection.prototype.selectDatabase = function (name, callback) {
    this.query("USE `" + name + "`", callback);
};

/**
 * Execute query
 * @param {String} query
 * @param {Function} callback Will pass result and an additional value establishing if query has returned rows
 */
DatabaseConnection.prototype.query = function (query, callback) {
    var self = this;
    this.connection.query(query, function (err, result) {
        if (err)
            self.error(err);
        if (typeof callback === "function") {
            /**
             * @param {Array[]} result
             * @param {Boolean} isEmpty
             */
            callback(result, !(result && result instanceof Array && result[0]));
        }
    });
};

/**
 * Begin connection transaction
 * @param {Function} callback Executed on transaction start
 */
DatabaseConnection.prototype.beginTransaction = function (callback) {
    var self = this;
    this.connection.beginTransaction(function (err) {
        if (err)
            self.error(err);
        self.database_transaction_status = "active";
        self.log.debug("Transaction started");
        callback();
    });
};

/**
 * Used to commit transaction and release connection<br>
 * To use only if connection has a started transaction
 * @param {Function} [callback] Executed on closed connection
 */
DatabaseConnection.prototype.commitRelease = function (callback) {
    var self = this;
    this.commit(function () {
        self.release();
        if (typeof callback === "function") {
            callback();
        }
    });
};

/**
 * Rollback current transaction and release connection<br>
 * To use only if connection has a started transaction
 * @param {Function} [callback] Executed on closed connection
 */
DatabaseConnection.prototype.rollbackRelease = function (callback) {
    var self = this;
    this.rollback(function () {
        self.release();
        if (typeof callback === "function") {
            callback();
        }
    });
};

/**
 * Rollback current transaction
 * @param {Function} callback Executed after rollback
 */
DatabaseConnection.prototype.rollback = function (callback) {
    var self = this;
    this.connection.rollback(function (err) {
        if (err)
            self.error(err);
        self.database_transaction_status = "closed";
        callback();
    });
};

/**
 * Commit current transaction
 * @param {Function} callback Executed after commit
 */
DatabaseConnection.prototype.commit = function (callback) {
    var self = this;
    this.connection.commit(function (err) {
        if (err)
            self.error(err);
        self.database_transaction_status = "closed";
        self.log.debug("Transaction ended");
        callback();
    });
};

/**
 * Release current connection<br>
 */
DatabaseConnection.prototype.release = function () {
    this.log.debug("Connection released");
    this.connection.release();
    clearTimeout(this.connectionDecayTimeout);
};

DatabaseConnection.prototype.onConnectionDecayTimeout = function (callback) {
    this.connectionDecayTimeoutCallback = callback;
};

/**
 * Error handler
 * @param {Error} err
 */
DatabaseConnection.prototype.error = function (err) {
    var self = this;
    if (this.hasOwnProperty("database_transaction_status") && this.database_transaction_status === "active") {
        self.connection.rollback(function () {
            throw err;
        });
    } else {
        throw err;
    }
};

/**
 * Generate random string
 * @param {Number} length String length
 * @returns {String}
 */
function randomString(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// You first need to create a formatting function to pad numbers to
// two digits…
function twoDigits(d) {
    if (0 <= d && d < 10)
        return "0" + d.toString();
    if (-10 < d && d < 0)
        return "-0" + (-1 * d).toString();
    return d.toString();
}

/**
 * …and then create the method to output the date string as desired.
 * Some people hate using prototypes this way, but if you are going
 * to apply this to more than one Date object, having it as a prototype
 * makes sense.
 **/
Date.prototype.toMysqlFormat = function () {
    return this.getFullYear() + "-" + twoDigits(1 + this.getMonth()) + "-" + twoDigits(this.getDate()) + " " + twoDigits(this.getHours()) + ":" + twoDigits(this.getMinutes()) + ":" + twoDigits(this.getSeconds());
};
