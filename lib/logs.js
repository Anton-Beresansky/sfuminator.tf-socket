module.exports = Logs;
var events = require("events");

/**
 * General purpose Logs class
 * @param {String} applicationName Identify application name to log
 * @returns {Logs}
 */
function Logs(applicationName) {
    this.application = applicationName;
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
    this._msg(error, "ERROR # ");
};

/**
 * Log warning
 * @param {String} warning
 */
Logs.prototype.warning = function (warning) {
    this._msg(warning, "WARNING # ");
};

/**
 * Log message
 * @param {String} msg
 * @param {Number} level Define debug depth to consider
 */
Logs.prototype.debug = function (msg, level) {
    if (this.debugEnabled() && (!level || level <= this.level)) {
        this._msg(" " + msg);
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
    if (myDate) {
        var date = myDate;
    } else {
        var date = new Date();
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

