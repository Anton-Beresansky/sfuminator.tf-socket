module.exports = sfuminatorSocket;
var debug = true;
var events = require("events");
var API = require("../lib/api.js");
//var sfuminatorAPI = new API("sfuminator.tf");
var CFG = JSON.parse(require("fs").readFileSync("../socket_config.json"));
var sfuminatorAPI = new API("sfuminator.tf");
if (CFG.application === "dev") {
    sfuminatorAPI = new API("dev.sfuminator.tf");
}

sfuminatorAPI.on("error", function (msg) {
    var time = getDateTime();
    console.log(time + " ERROR @socket_API:" + msg);
});

function sfuminatorSocket(socket_key) {
    this.key = socket_key;
    this.defaultParameters = {};
    this.socketInterface = this.defaultParameters; //socket interfaces and methods for the data on apicall {methods, ...etc})
    this.getSocketMethods = function () { //returns the list of methods requested by the socketInterface
        if (this.socketInterface.methods) {
            var tempstrmtd = this.socketInterface.methods;
            var temparrmtd = tempstrmtd.split(",");
            var len = temparrmtd.length;
            while (len--) {
                if (temparrmtd[len] === "") {
                    temparrmtd.splice(len, 1);
                }
            }
            return temparrmtd;
        } else {
            return Array();
        }
    };
    this.getSocketPokes = function () { //returns the list of pokes sent by the socketInterface
        if (this.socketInterface.pokes) {
            var tempstrmtd = this.socketInterface.pokes;
            var temparrmtd = tempstrmtd.split(",");
            var len = temparrmtd.length;
            while (len--) {
                if (temparrmtd[len] === "") {
                    temparrmtd.splice(len, 1);
                }
            }
            return temparrmtd;
        } else {
            return Array();
        }
    };
    this.timeout = {}; //list of timeouts {obj, time, success}
    this.interval = {}; //list of intervals {obj, time, success}
    events.EventEmitter.call(this);
    this.on("debug", function (msg) {
        var time = getDateTime();
        console.log(time + "\t socket->" + msg);
    });
    this.on("error", function (msg) {
        var time = getDateTime();
        console.log(time + " ERROR @socket:" + msg);
    });
}

//Socket: add request with .addSocketRequest, add poke with .addSocketPoke
//Socket response is emitted as "socket_" + requestName

require("util").inherits(sfuminatorSocket, events.EventEmitter);

sfuminatorSocket.prototype.setBot = function (steamid) {
    this.defaultParameters = {
        rootKey: this.key,
        botRequest: true,
        botSteamid: steamid
    };
    for (var property in this.defaultParameters) {
        this.socketInterface[property] = this.defaultParameters[property];
    }
};

sfuminatorSocket.prototype.addSocketRequest = function (myRequest) {
    var self = this;
    var methodstring = String(self.socketInterface.methods);
    if (methodstring === "undefined") {
        methodstring = "";
    }
    var already_added = false;
    var methodlist = methodstring.split(",");
    for (var x in methodlist) {
        if (methodlist[x] === myRequest) {
            already_added = true;
        }
    }
    if (!already_added) {
        methodstring += myRequest + ",";
        self.socketInterface.methods = methodstring;
        self.emit("message", "addSocketRequest: added " + myRequest);
    } else {
        self.emit("message", "addSocketRequest: " + myRequest + " is already added, skipping");
    }
};
sfuminatorSocket.prototype.removeSocketRequest = function (myRequest) {
    var current_methods = this.socketInterface.methods;
    var new_methods = current_methods.replace("," + myRequest + ",", ",");
    this.socketInterface.methods = new_methods;
    this.emit("debug", "removeSocketRequest: removed " + myRequest);
};
sfuminatorSocket.prototype.addSocketPoke = function (myPoke) {
    var self = this;
    var pokestring = String(self.socketInterface.pokes);
    if (pokestring === "undefined") {
        pokestring = "";
    }
    var already_added = false;
    var pokelist = pokestring.split(",");
    for (var x in pokelist) {
        if (pokelist[x] === myPoke) {
            already_added = true;
        }
    }
    if (!already_added) {
        pokestring += myPoke + ",";
        self.socketInterface.pokes = pokestring;
        self.emit("message", "addSocketPoke: added " + myPoke);
    } else {
        self.emit("message", "addSocketPoke: " + myPoke + " is already added, skipping");
    }
};
sfuminatorSocket.prototype.removeSocketPoke = function (myPoke) {
    var current_pokes = this.socketInterface.pokes;
    var new_pokes = current_pokes.replace("," + myPoke + ",", ",");
    this.socketInterface.pokes = new_pokes;
    this.emit("debug", "removeSocketPoke: removed " + myPoke);
};
sfuminatorSocket.prototype.startNormalPollingProcedure = function () {
    var self = this;
    var normalPollingProcedure_method = function () {
        self.timeout.normalPollingProcedure.obj = setTimeout(function () {
            var parameters = self.socketInterface;
            parameters.action = "botPollingProcedure";
            var myInterface = {
                name: "include",
                method: {
                    name: "socket",
                    httpmethod: "POST",
                    parameters: parameters
                }
            };
            sfuminatorAPI.callAPI(myInterface, function (response) {
                self.emit("socket", response);
                self.emitSocketData(response);
                self.timeout.normalPollingProcedure.success();
            });
        }, self.timeout.normalPollingProcedure.time);
    };
    var mySelf = normalPollingProcedure_method;
    self.timeout.normalPollingProcedure = {time: 3000, success: mySelf};
    normalPollingProcedure_method();
};
sfuminatorSocket.prototype.startEmergencyPollingProcedure = function () {

};
sfuminatorSocket.prototype.emitSocketData = function (jsonData) {
    var self = this;
    var methods = self.getSocketMethods();
    if (jsonData) {
        for (var x in methods) {
            if (jsonData.hasOwnProperty(methods[x])) {
                self.emit("socket_" + [methods[x]], (jsonData[methods[x]]));
            } else {
                self.emit("error", "updateSockedData, server did not respond with an appropriate method for " + methods[x], 14);
            }
        }
    } else {
        self.emit("error", "emitSocketData: jsonData is undefined", 15);
    }
};
////////////////////////////////////////////////////////////////////////////////

sfuminatorSocket.prototype.getCurrency = function (callback) {
    var self = this;
    self.emit("debug", "getCurrency");
    var parameters = this.defaultParameters;
    parameters.action = "fetchCurrency";
    var getCurrencyInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(getCurrencyInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};
sfuminatorSocket.prototype.appendTrade = function (_trade, callback) {
    var trade = JSON.parse(JSON.stringify(_trade));
    var self = this;
    self.emit("debug", "appendTrade, partner:" + trade.partnerID);
    var parameters = this.defaultParameters;
    parameters.action = "appendTrade";
    parameters.partnerID = trade.partnerID;
    var appendTradeInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(appendTradeInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};
sfuminatorSocket.prototype.queueHoldTrade = function (steamid, callback) {
    var self = this;
    self.emit("debug", "queueHoldTrade: " + steamid);
    var parameters = this.defaultParameters;
    parameters.action = "queueHoldTrade";
    parameters.steamid = steamid;
    var queueHoldTradeInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(queueHoldTradeInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};
sfuminatorSocket.prototype.removeFromQueue = function (steamid, callback) {
    var self = this;
    self.emit("debug", "removeFromQueue: " + steamid);
    var parameters = this.defaultParameters;
    parameters.action = "removeFromQueue";
    parameters.steamid = steamid;
    var removeFromQueueInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(removeFromQueueInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};
sfuminatorSocket.prototype.setQueueStatus = function (message_object, callback) {
    var self = this;
    self.emit("debug", "setQueueStatus: " + message_object.step);
    var parameters = this.defaultParameters;
    parameters.action = "botStatus";
    parameters.status = new Buffer(JSON.stringify({me: message_object.personal, all: message_object.global, additional: message_object.step})).toString("base64");
    var setQueueStatusInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(setQueueStatusInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};
sfuminatorSocket.prototype.refreshBackpack = function (callback) {
    console.log("Called socket.refreshBackpack() useless..");
    if (typeof callback === "function") {
        callback();
    }
};
sfuminatorSocket.prototype.setTradeOfferStatus = function (steamid, _status, callback) {
    var self = this;
    self.emit("debug", "setTradeOfferStatus: " + steamid + " " + _status);
    var keyWords = _status.split(":");
    var status = keyWords[0];
    var additional = "";
    if (keyWords.length > 1) {
        additional = keyWords[1];
    }
    var parameters = this.defaultParameters;
    parameters.action = "setTradeOfferStatus";
    parameters.steamid = steamid;
    parameters.status = status;
    parameters.additional = additional;
    var setTradeOfferStatusInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(setTradeOfferStatusInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};//********************
sfuminatorSocket.prototype.cancelAllTradeOffers = function (callback) {
    var self = this;
    self.emit("debug", "Cancelling all trade offers");
    var parameters = this.defaultParameters;
    parameters.action = "cancelAllTradeOffers";
    var cancelAllTradeOffersInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: parameters
        }
    };
    sfuminatorAPI.callAPI(cancelAllTradeOffersInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};//********************
function getDateTime() {
    var date = new Date();
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
    return day + "/" + month + "/" + year + " " + hour + ":" + min + ":" + sec + " ";
}