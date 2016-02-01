module.exports = SteamAPI;
var events = require("events");
var API = require("./api.js");
var steamAPI = new API("api.steampowered.com");

/* GENERAL STEAM INREFACE
 //var interface = {
 //     name: "",
 //     method: {
 //         name: "",
 //         version: "",
 //         httpmethod: "GET",
 //         parameters: {
 //             key: steamapi_key
 //         }
 //     }
 //};
 */

function SteamAPI(api_key) {
    this.steamapi_key = api_key;
    events.EventEmitter.call(this);
}

require("util").inherits(SteamAPI, events.EventEmitter);

SteamAPI.prototype.getPlayerItems = function (steamid, callback) {
    var self = this;
    var myInterface = {
        name: "IEconItems_440",
        method: {
            name: "GetPlayerItems",
            version: 1,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                steamid: steamid
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.getSchema = function (callback) {
    var self = this;
    var myInterface = {
        name: "IEconItems_440",
        method: {
            name: "GetSchema",
            version: 1,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                language: "en_Us"
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.upToDateCheck = function (appid, version, callback) {
    var self = this;
    var myInterface = {
        name: "ISteamApps",
        method: {
            name: "UpToDateCheck",
            version: 1,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                appid: appid,
                version: version
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.getFriendList = function (steamid, callback) {
    var self = this;
    var myInterface = {
        name: "ISteamUser",
        method: {
            name: "GetFriendList",
            version: 1,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                steamid: steamid
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.getPlayerSummaries = function (steamids, callback) {
    var self = this;
    var steamidsString = "";
    if (typeof steamids === "string") {
        steamidsString = steamids;
    } else {
        for (var x in steamids) {
            if (x >= 100) {
                self.emit("error", "WARNING: Too many steamids (" + x + ", when maximum is 100) cutting out the remaining ones.");
                break;
            }
            steamidsString += steamids[x] + ",";
        }
    }
    var myInterface = {
        name: "ISteamUser",
        method: {
            name: "GetPlayerSummaries",
            version: 2,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                steamids: steamidsString
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.getUserGroupList = function (steamid, callback) {
    var self = this;
    var myInterface = {
        name: "ISteamUser",
        method: {
            name: "GetUserGroupList",
            version: 1,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                steamid: steamid
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.resolveVanityURL = function (vanityurl, callback) {
    var self = this;
    var myInterface = {
        name: "ISteamUser",
        method: {
            name: "ResolveVanityURL",
            version: 1,
            httpmethod: "GET",
            parameters: {
                key: self.steamapi_key,
                vanityurl: vanityurl
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.getGroupSummaries = function (groupgid, callback) {
    //http://steamcommunity.com/gid/<gid>/memberslistxml/?xml=1
    var myInterface = {
        XML: true,
        baseurl: "steamcommunity.com",
        name: "gid/" + groupgid,
        method: {
            name: "memberslistxml",
            httpmethod: "GET",
            parameters: {
                xml: 1
            }
        }
    };
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};
SteamAPI.prototype.customCall = function (myInterface, callback) {
    myInterface.method.parameters.key = this.steamapi_key;
    steamAPI.callAPI(myInterface, function (response) {
        callback(response);
    });
};