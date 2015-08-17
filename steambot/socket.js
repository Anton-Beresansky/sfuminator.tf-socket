module.exports = sfuminatorSocket;
var debug = true;
var events = require("events");
var API = require("../lib/api.js");
var sfuminatorAPI = new API("sfuminator.tf");
var devSfuminatorAPI = new API("dev.sfuminator.tf");
sfuminatorAPI.on("error", function (msg) {
    var time = getDateTime();
    console.log(time + " ERROR @socket_API:" + msg);
});

function sfuminatorSocket(socket_key) {
    this.key = socket_key;
    this.socketInterface = {
        rootKey: socket_key
    }; //socket interfaces and methods for the data on apicall {methods, ...etc})
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
            var myInterface = {
                name: "include",
                method: {
                    name: "socket",
                    httpmethod: "POST",
                    parameters: self.socketInterface
                }
            };
            myInterface.method.parameters.botRequest = true;
            myInterface.method.parameters.action = "botPollingProcedure";
            devSfuminatorAPI.callAPI(myInterface, function (response) {
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

//sfuminatorSocket.prototype.getItem = function (defindex, quality, flag_cannot_craft, callback) {
/*    var self = this;
 self.emit("debug", "getItem - defindex:" + defindex + ", quality:" + quality + ", flag_cannot_craft:" + flag_cannot_craft);
 var getItemInterface = {
 name: "include",
 method: {
 name: "zxcv",
 httpmethod: "GET",
 predata: "botBackpack.php",
 parameters: {
 action: "getItem",
 defindex: defindex,
 quality: quality,
 flag_cannot_craft: flag_cannot_craft,
 password: self.key
 }
 }
 };
 sfuminatorAPI.callAPI(getItemInterface, function (response) {
 if (callback) {
 callback(response);
 }
 });
 };*/
sfuminatorSocket.prototype.getCurrency = function (callback) {
    var self = this;
    self.emit("debug", "getCurrency");
    var getCurrencyInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: {
                action: "fetchCurrency",
                rootKey: self.key,
                botRequest: true
            }
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
    var appendTradeInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: {
                action: "appendTrade",
                partnerID: trade.partnerID,
                rootKey: self.key,
                botRequest: true
            }
        }
    };
    sfuminatorAPI.callAPI(appendTradeInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};
//sfuminatorSocket.prototype.queueHoldTrade = function (steamid, callback) {
/*    var self = this;
 self.emit("debug", "queueHoldTrade: " + steamid);
 var queueHoldTradeInterface = {
 name: "include",
 method: {
 name: "zxcv",
 httpmethod: "POST",
 predata: "botSocket.php",
 parameters: {
 action: "queueHoldTrade",
 steamid: steamid,
 key: self.key
 }
 }
 };
 sfuminatorAPI.callAPI(queueHoldTradeInterface, function (response) {
 if (callback) {
 callback(response);
 }
 });
 };*/
//sfuminatorSocket.prototype.removeFromQueue = function (steamid, callback) {
/*    var self = this;
 self.emit("debug", "removeFromQueue: " + steamid);
 var removeFromQueueInterface = {
 name: "include",
 method: {
 name: "zxcv",
 httpmethod: "POST",
 predata: "botSocket.php",
 parameters: {
 action: "removeFromQueue",
 steamid: steamid,
 key: self.key
 }
 }
 };
 sfuminatorAPI.callAPI(removeFromQueueInterface, function (response) {
 if (callback) {
 callback(response);
 }
 });
 };*/
//sfuminatorSocket.prototype.setQueueStatus = function (message_object, callback) {
/*    var self = this;
 self.emit("debug", "setQueueStatus: " + message_object.step);
 var encodedStatus = new Buffer(JSON.stringify({me: message_object.personal, all: message_object.global, additional: message_object.step})).toString("base64");
 var setQueueStatusInterface = {
 name: "include",
 method: {
 name: "zxcv",
 httpmethod: "GET",
 predata: "botBackpack.php",
 parameters: {
 action: "botStatus",
 status: encodedStatus,
 password: self.key
 }
 }
 };
 sfuminatorAPI.callAPI(setQueueStatusInterface, function (response) {
 if (callback) {
 callback(response);
 }
 });
 };*/
sfuminatorSocket.prototype.refreshBackpack = function (callback) {
    console.log("Called socket.refreshBackpack() useless..");
    if (typeof callback === "function") {
        callback();
    }
    /*var self = this;
     self.emit("debug", "refreshBackpack");
     var removeFromQueueInterface = {
     name: "include",
     method: {
     name: "zxcv",
     httpmethod: "GET",
     predata: "botBackpack.php",
     parameters: {
     action: "freshBackpack",
     password: self.key
     }
     }
     };
     sfuminatorAPI.callAPI(removeFromQueueInterface, function (response) {
     if (callback) {
     callback(response);
     }
     });*/
};
//sfuminatorSocket.prototype.alertSteamStatus = function (status, callback) {
/*    var self = this;
 self.emit("debug", "alertSteamStatus");
 var alertSteamDownInterface = {
 name: "include",
 method: {
 name: "zxcv",
 httpmethod: "POST",
 predata: "botSocket.php",
 parameters: {
 action: "alertSteamStatus",
 status: status,
 key: self.key
 }
 }
 };
 sfuminatorAPI.callAPI(alertSteamDownInterface, function (response) {
 if (callback) {
 callback(response);
 }
 });
 };*/
sfuminatorSocket.prototype.setTradeOfferStatus = function (steamid, _status, callback) {
    var self = this;
    self.emit("debug", "setTradeOfferStatus: " + steamid + " " + _status);
    var keyWords = _status.split(":");
    var status = keyWords[0];
    var additional = "";
    if (keyWords.length > 1) {
        additional = keyWords[1];
    }
    var setTradeOfferStatusInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: {
                action: "setTradeOfferStatus",
                steamid: steamid,
                status: status,
                additional: additional,
                rootKey: self.key,
                botRequest: true
            }
        }
    };
    devSfuminatorAPI.callAPI(setTradeOfferStatusInterface, function (response) {
        if (callback) {
            callback(response);
        }
    });
};//********************
sfuminatorSocket.prototype.cancelAllTradeOffers = function (callback) {
    var self = this;
    self.emit("debug", "Cancelling all trade offers");
    var cancelAllTradeOffersInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: {
                action: "cancelAllTradeOffers",
                rootKey: self.key,
                botRequest: true
            }
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