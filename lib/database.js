CONN_DEBUG = false;

module.exports = Database;
var mysql = require("mysql");
var events = require("events");

function Database(options) {
    this.pool = mysql.createPool({
        host: 'localhost',
        user: options.user,
        password: options.password,
        database: options.database,
        supportBigNumbers: true
    });
    events.EventEmitter.call(this);
}

require("util").inherits(Database, events.EventEmitter);

Database.prototype.connect = function (callback) {
    var self = this;
    this.pool.getConnection(function (err, connection) {
        if (err) {
            self.emit("error", "Error when connecting to database: " + err);
        } else {
            callback(new DatabaseConnection(connection));
        }
    });
};

function DatabaseConnection(connection) {
    var self = this;
    this.connection = connection;
    this.c = this.connection;
    this.emit("debug", "Opened database connection");
    events.EventEmitter.call(this);
    this.on("debug", function (msg) {
        if (CONN_DEBUG) {
            console.log(">Database (#" + self.connectionID + "): " + msg);
        }
    });
    if (CONN_DEBUG) {
        this.connectionID = randomString(5);
    }
}

require("util").inherits(DatabaseConnection, events.EventEmitter);

DatabaseConnection.prototype.query = function (query, callback) {
    var self = this;
    this.connection.query(query, function (err, result) {
        if (err)
            self.error(err);
        if (typeof callback === "function") {
            callback(result, !(result && result instanceof Array && result[0]));
        }
    });
};

DatabaseConnection.prototype.beginTransaction = function (callback) {
    var self = this;
    this.connection.beginTransaction(function (err) {
        if (err)
            self.error(err);
        self.database_transaction_status = "active";
        self.emit("debug", "Transaction started");
        callback();
    });
};

DatabaseConnection.prototype.commitRelease = function (callback) {
    var self = this;
    this.commit(function () {
        self.release();
        if (typeof callback === "function") {
            callback();
        }
    });
};

DatabaseConnection.prototype.rollbackRelease = function (callback) {
    var self = this;
    this.rollback(function () {
        self.release();
        if (typeof callback === "function") {
            callback();
        }
    });
};

DatabaseConnection.prototype.rollback = function (callback) {
    var self = this;
    this.connection.rollback(function (err) {
        if (err)
            self.error(err);
        self.database_transaction_status === "closed";
        callback();
    });
};

DatabaseConnection.prototype.commit = function (callback) {
    var self = this;
    this.connection.commit(function (err) {
        if (err)
            self.error(err);
        self.database_transaction_status === "closed";
        self.emit("debug", "Transaction ended");
        callback();
    });
};

DatabaseConnection.prototype.release = function () {
    this.emit("debug", "Connection released");
    this.connection.release();
};

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

function randomString(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}