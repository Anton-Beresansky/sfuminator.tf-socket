module.exports = Callbacks;

/**
 * @constructor
 */
function Callbacks() {
    this._handlers = [];
}

Callbacks.prototype.stack = function (event, callback) {
    if (typeof callback === "function") {
        var handler = this.get(event);
        handler.hasFired() ? callback() : handler.addCallback(callback);
    }
};

Callbacks.prototype.fire = function (event) {
    this.get(event).fire();
};

/**
 * @param event
 * @returns {Handler}
 */
Callbacks.prototype.get = function (event) {
    for (var i = 0; i < this._handlers.length; i += 1) {
        if (this._handlers[i].getName() === event) {
            return this._handlers[i];
        }
    }
    //If handler hasn't been created yet
    var newHandler = new Handler(event);
    this._handlers.push(newHandler);
    return newHandler;
};

/**
 * @param name
 * @constructor
 */
function Handler(name) {
    this.name = name;
    this._callbacks = [];
    this._hasFired = false;
}

Handler.prototype.getName = function () {
    return this.name;
};

Handler.prototype.hasFired = function () {
    return this._hasFired;
};

Handler.prototype.fire = function () {
    for (var i = 0; i < this._callbacks.length; i += 1) {
        if (typeof this._callbacks[i] === "function") {
            this._callbacks[i]();
        }
    }
    this._hasFired = true;
};

Handler.prototype.addCallback = function (callback) {
    this._callbacks.push(callback);
};