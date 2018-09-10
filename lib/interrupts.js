// Sfuminator.tf | General Interrupt library

module.exports = Interrupts;

var events = require("events");
var LogLog = require("log-log");

/**
 * General purpose Interrupts library
 * @param {Object[]} procedures List element has the following structure:<br>
 * {<br>
 * &nbsp;name: String,<br>
 * &nbsp;delay: Number,<br>
 * &nbsp;tag: String<br>
 * }<br>
 * Name is treated also as the interrupt id, Delay expressed in ms, tag can be: internal or global.<br>
 * Global and internal tag is a distinction for environment changing
 * events or just local changing interrupts. These two categories can be
 * treated separately
 * @returns {Interrupts}
 */
function Interrupts(procedures) {
    this._procedures = [];
    for (var i = 0; i < procedures.length; i += 1) {
        var pr = procedures[i];
        this._procedures.push(new Procedure(pr.name, pr.delay, pr.tag));
    }
    this.log = LogLog.create({applicationName: "Interrupts"});
    this.log.disableDebug();
    events.EventEmitter.call(this);
}

require("util").inherits(Interrupts, events.EventEmitter);

/**
 * Stop all the interrupts
 */
Interrupts.prototype.startAll = function () {
    this.startInternals();
    this.startGlobals();
};

/**
 * Start all the interrupts
 */
Interrupts.prototype.stopAll = function () {
    this.stopInternals();
    this.stopGlobals();
};

/**
 * Start internal interrupts
 * @returns {undefined}
 */
Interrupts.prototype.startInternals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (procedure.isInternal()) {
            this.start(procedure.getName());
        }
    }
};

/**
 * Start global interrupts
 * @returns {undefined}
 */
Interrupts.prototype.startGlobals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (!procedure.isInternal()) {
            this.start(procedure.getName());
        }
    }
};

/**
 * Stop internal interrupts
 * @returns {undefined}
 */
Interrupts.prototype.stopInternals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (procedure.isInternal()) {
            this.stop(procedure.getName());
        }
    }
};

/**
 * Stop global interrupts
 * @returns {undefined}
 */
Interrupts.prototype.stopGlobals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (!procedure.isInternal()) {
            this.stop(procedure.getName());
        }
    }
};

/**
 * Start interrupt given its id (name)
 * @param {String} id
 * @returns {undefined}
 */
Interrupts.prototype.start = function (id) {
    this.log.debug("Starting procedure: " + id);
    if (this.exist(id)) {
        var procedure = this.get(id);
        if (!procedure.started()) {
            this._createInterval(procedure);
        }
    }
};

Interrupts.prototype._createInterval = function (procedure) {
    var self = this;
    procedure.interval = setInterval(function () {
        self.log.debug("Firing " + procedure.getName());
        self.emit(procedure.getName());
    }, procedure.getDelay());
};

/**
 * Stop interrupt given its id
 * @param {String} id Interrupt name
 * @returns {undefined}
 */
Interrupts.prototype.stop = function (id) {
    if (this.exist(id)) {
        var procedure = this.get(id);
        if (procedure.started()) {
            clearInterval(procedure.interval);
            procedure.interval = false;
        }
    }
};

/**
 * Establish if given interrupt exist
 * @param {String} id Interrupt name
 * @returns {Boolean}
 */
Interrupts.prototype.exist = function (id) {
    return this.get(id) !== false;
};

/**
 * Get interrupt procedure from given id
 * @param {String} id Interrupt name
 * @returns {Procedure|Boolean} False if procedure interrupt exist
 */
Interrupts.prototype.get = function (id) {
    for (var i = 0; i < this._procedures.length; i += 1) {
        if (this._procedures[i].getName() === id) {
            return this._procedures[i];
        }
    }
    return false;
};

/**
 * General purpose interrupt Procedure class
 * @param {String} id Interrupt procedure name
 * @param {Number} delay Ms delay
 * @param {String} tag internal or global
 * @returns {Procedure}
 */
function Procedure(id, delay, tag) {
    this.name = id;
    this.delay = delay;
    this.tag = tag;
    this.interval = null;
}

Procedure.prototype.getName = function () {
    return this.name;
};

Procedure.prototype.getDelay = function () {
    return this.delay;
};

Procedure.prototype.getTag = function () {
    return this.tag;
};

Procedure.prototype.isInternal = function () {
    return this.tag === "internal";
};

/**
 * Establish if procedure is running
 * @returns {Boolean}
 */
Procedure.prototype.started = function () {
    return this.interval !== null;
};