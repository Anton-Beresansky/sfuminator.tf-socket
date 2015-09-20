module.exports = Logs;
var events = require("events");
var chalk = require("chalk");

/**
 * General purpose Logs class
 * @param {Object} applicationOptions
 * Identify application options
 * Object can have the following structure (properties are optional)
 * {
 *  applicationName: String,
 *  color: String
 * }
 * @returns {Logs}
 */
function Logs(applicationOptions) {
    this.application = "";
    this.color = "white";
    if (applicationOptions.hasOwnProperty("applicationName")) {
        this.application = applicationOptions.applicationName;
    }
    if (applicationOptions.hasOwnProperty("color")) {
        this.color = applicationOptions.color;
    }
    this._debugFlag = true;
    this.level = 0;
    events.EventEmitter.call(this);
}

require("util").inherits(Logs, events.EventEmitter);

/**
 * Log error
 * @param {String} error
 */
Logs.prototype.error = function (error) {
    this._msg(error, chalk.red("ERROR # "));
};

/**
 * Log warning
 * @param {String} warning
 */
Logs.prototype.warning = function (warning) {
    this._msg(warning, chalk.yellow( "WARNING # "));
};

/**
 * Log message
 * @param {String} msg
 * @param {Number} level Define debug depth to consider
 */
Logs.prototype.debug = function (msg, level) {
    if (this.debugEnabled() && (!level || level <= this.level)) {
        this._msg(" " + chalk[this.color](msg));
    }
};

/**
 * Set debug depth
 * @param {Number} level
 */
Logs.prototype.setLevel = function (level) {
    if (!isNaN(level)) {
        this.level = level;
    }
};

Logs.prototype._msg = function (_msg, _premsg) {
    if (!_premsg) {
        _premsg = "";
    }
    console.log(_premsg + this.getNiceDate() + " <" + this.application + "> " + _msg);
};

/**
 * Establush if debug is enabled
 * @returns {Boolean}
 */
Logs.prototype.debugEnabled = function () {
    return this._debugFlag;
};

//noinspection JSUnusedGlobalSymbols
/**
 * Enable debug messages
 */
Logs.prototype.enableDebug = function () {
    this._debugFlag = true;
};

/**
 * Disable debug messages
 */
Logs.prototype.disableDebug = function () {
    this._debugFlag = false;
};

Logs.prototype.getNiceDate = function (mode, myDate) {
    var date = new Date();
    if (myDate) {
        date = myDate;
    }
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    if (mode) {
        return year + "-" + month + "-" + day;
    } else {
        return year + "/" + month + "/" + day + " " + hour + ":" + min + ":" + sec;
    }
};

