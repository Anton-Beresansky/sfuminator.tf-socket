module.exports = DataVersioning;

var Logs = require("./logs.js");

function DataVersioning(size, versioningName) {
    this.size = size;
    this.versioning = []; //[{date: Date, toAdd: [], toRemove: []}]
    this.log = new Logs("Item Versioning" + ((versioningName) ? (" " + versioningName) : ""));
    this.log.setLevel(0);
}

DataVersioning.prototype.add = function (toAdd, toRemove, forcedVersion) {
    if ((toAdd instanceof Array && toAdd.length) || (toRemove instanceof Array && toRemove.length)) {
        var thisVersion = new Date();
        if (forcedVersion) {
            thisVersion = forcedVersion;
        }
        this.versioning.push({date: thisVersion, toAdd: toAdd, toRemove: toRemove});
        this.log.debug("Added new versioning! (" + thisVersion + ") toAdd:" + toAdd.length + " toRemove:" + toRemove.length);
        if (this.versioning.length > this.size) {
            //Secure method to remove lowest date, instead could be array.splice(0,1)
            //but we don't know what'happening next to versioning so to be sure...
            var lowestDate = {index: 0, value: new Date()};
            for (var i = 0; i < this.versioning.length; i += 1) {
                if (this.versioning[i].date < lowestDate.value) {
                    lowestDate.value = this.versioning[i].date;
                    lowestDate.index = i;
                }
            }
            this.versioning.splice(lowestDate.index, 1);
        }
        this.log.debug("New versioning: " + JSON.stringify(this.versioning), 3);
    } else {
        if (!(toAdd instanceof Array) || !(toRemove instanceof Array)) {
            this.log.error("Either toAdd or toRemove is not an array can't create version");
        }
    }
};

DataVersioning.prototype.get = function (since) {
    if (this.getOldest().date.getTime() > since.getTime()) {
        return false; //Checking if versioning can't handle requested date
    }
    var result = {date: new Date(), toAdd: [], toRemove: []};
    for (var i = 0; i < this.versioning.length; i += 1) {
        if (this.versioning[i].date.getTime() >= since.getTime()) {
            result.toAdd = result.toAdd.concat(this.versioning[i].toAdd);
            result.toRemove = result.toRemove.concat(this.versioning[i].toRemove);
        }
    }
    return result;
};

DataVersioning.prototype.isAvailable = function (since) {
    return since.getTime() >= this.getOldest().date.getTime();
};

DataVersioning.prototype.getLatest = function () {
    var newestDate = {index: -1, value: 0};
    for (var i = 0; i < this.versioning.length; i += 1) {
        if (this.versioning[i].date >= newestDate.value) {
            newestDate.value = this.versioning[i].date;
            newestDate.index = i;
        }
    }
    if (newestDate.index === -1) {
        return {date: new Date(0), toAdd: [], toRemove: []};
    }
    return this.versioning[newestDate.index];
};

DataVersioning.prototype.getOldest = function () {
    var oldestDate = {index: -1, value: new Date()};
    for (var i = 0; i < this.versioning.length; i += 1) {
        if (this.versioning[i].date <= oldestDate.value) {
            oldestDate.value = this.versioning[i].date;
            oldestDate.index = 0;
        }
    }
    if (oldestDate.index === -1) {
        return {date: new Date(0), toAdd: [], toRemove: []};
    }
    return this.versioning[oldestDate.index];
};