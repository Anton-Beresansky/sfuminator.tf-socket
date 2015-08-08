module.exports = Interrupts;

var events = require("events");
var Logs = require("./logs.js");

function Interrupts(procedures) {
    this._procedures = [];
    for (var i = 0; i < procedures.length; i += 1) {
        var pr = procedures[i];
        this._procedures.push(new Procedure(pr.name, pr.delay, pr.tag));
    }
    this.log = new Logs("Interrupts");
    this.log.disableDebug();
    events.EventEmitter.call(this);
}

require("util").inherits(Interrupts, events.EventEmitter);

Interrupts.prototype.stopAll = function () {
    this.startInternals();
    this.startGlobals();
};

Interrupts.prototype.startAll = function () {
    this.stopInternals();
    this.stopGlobals();
};

Interrupts.prototype.startInternals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (procedure.isInternal()) {
            this.start(procedure.getName());
        }
    }
};

Interrupts.prototype.startGlobals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (!procedure.isInternal()) {
            this.start(procedure.getName());
        }
    }
};

Interrupts.prototype.stopInternals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (procedure.isInternal()) {
            this.stop(procedure.getName());
        }
    }
};

Interrupts.prototype.stopGlobals = function () {
    for (var i = 0; i < this._procedures.length; i += 1) {
        var procedure = this._procedures[i];
        if (!procedure.isInternal()) {
            this.stop(procedure.getName());
        }
    }
};

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

Interrupts.prototype.stop = function (id) {
    if (this.exist(id)) {
        var procedure = this.get(id);
        if (procedure.started()) {
            clearInterval(procedure.interval);
            procedure.interval = false;
        }
    }
};

Interrupts.prototype.exist = function (id) {
    return this.get(id);
};

Interrupts.prototype.get = function (id) {
    for (var i = 0; i < this._procedures.length; i += 1) {
        if (this._procedures[i].getName() === id) {
            return this._procedures[i];
        }
    }
    return false;
};

//Procedure class

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

Procedure.prototype.started = function () {
    return this.interval;
};