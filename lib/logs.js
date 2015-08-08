module.exports = Logs;
var events = require("events");

function Logs(applicationName) {
    this.application = applicationName;
    this._debugFlag = true;
    this.level = 0;
    events.EventEmitter.call(this);
}

require("util").inherits(Logs, events.EventEmitter);

Logs.prototype.error = function (error) {
    this._msg(error, "ERROR # ");
};

Logs.prototype.warning = function (warning) {
    this._msg(warning, "WARNING # ");
};

Logs.prototype.debug = function (msg, level) {
    if (this.debugEnabled() && (!level || level <= this.level)) {
        this._msg(" " + msg);
    }
};

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

Logs.prototype.debugEnabled = function () {
    return this._debugFlag;
};

Logs.prototype.enableDebug = function () {
    this._debugFlag = true;
};

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

