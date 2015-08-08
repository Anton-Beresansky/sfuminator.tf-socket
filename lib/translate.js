module.exports = Translate;
var events = require("events");
var apikey = "***REMOVED***";
var translateapi_url = "translate.yandex.net";

function Translate() {
    events.EventEmitter.call(this);
}

require("util").inherits(Translate, events.EventEmitter);

Translate.prototype.translate = function(from, to, text, callback) {
    var self = this;
    var interface = {
        method: {
            name: "api",
            version: "1.5/tr.json",
            httpmethod: "GET",
            predata: "translate",
            parameters: {
                key: apikey,
                lang: from + "-" + to,
                text: encodeURIComponent(text)
            }
        }
    };
    this.callTranslateAPI(interface, function(response) {
        var finalRes = "";
        if (response.hasOwnProperty("result")) {
            if (response.result === "fail") {
                self.emit("error", "ERROR: " + response.content);
                finalRes = null;
            }
        } else {
            finalRes = response.text[0];
        }
        callback(finalRes);
    });
};
Translate.prototype.callTranslateAPI = function(interface, callback) {
    var self = this;
    var selfInterface = interface;
    var tries = 0;
    raw_callTranslateAPI(interface, selfCallback = function(response) {
        if (response.result === "success") {
            var finalResult = "";
            try {
                finalResult = JSON.parse(response.content);
            } catch (e) {
                self.emit("error", "ERROR: " + "Couldn't parse JSON (/" + selfInterface.name + "/" + selfInterface.method.name + ")");
                finalResult = {result: "fail", content: response.content};
            }
            callback(finalResult);
            return;
        } else {
            tries += 1;
            errMsg = "";
            if (response.type === "error") {
                var errMsg = response.error;
            }
            console.log("WARNING: " + response.message + "(try:" + tries + ")" + errMsg);
            console.log("\tAdditional infos: " + JSON.stringify(response));
            if (tries === 5) {
                callback(null);
                self.emit("error", "ERROR: " + "no response over 5 times (/" + selfInterface.name + "/" + selfInterface.method.name + ")");
                return;
            } else {
                setTimeout(function() {
                    raw_callTranslateAPI(selfInterface, selfCallback);
                }, 1000 * tries);
            }
        }
    });
};

function raw_callTranslateAPI(interface, callback) {
    var http = require("https");
    var base_url = translateapi_url;
    if (interface.hasOwnProperty("baseurl")) {
        base_url = interface.baseurl;
    }
    var stringinterfacename = "";
    if (interface.hasOwnProperty("name")) {
        stringinterfacename = "/" + interface.name;
    }
    var stringversion = "";
    if (interface.method.hasOwnProperty("version")) {
        stringversion = "/v" + interface.method.version;
    }
    var predata = "";
    if (interface.method.hasOwnProperty("predata")) {
        predata = interface.method.predata;
    }
    var parameters = interface.method.parameters;
    var data = "";
    for (var prop in parameters) {
        if (parameters.hasOwnProperty(prop)) {
            data += prop + "=" + parameters[prop] + "&";
        }
    }
    var path = stringinterfacename + "/" + interface.method.name + stringversion + "/" + predata + "?" + data;
    var header = {host: base_url, path: path};
    http.get(header, function(res) {
        var bodyChunks = [];
        res.on('data', function(chunk) {
            bodyChunks.push(chunk);
        });
        res.on('end', function() {
            var finalResult = "";
            try {
                var body = Buffer.concat(bodyChunks);
                finalResult = {result: "success", content: body};
            } catch (e) {
                finalResult = {result: "fail", type: "error", message: "error when fetching data", error: e, additional: {interface: interface, url: header.host + header.path, page: body}};
            }
            callback(finalResult);
            return;
        });
        res.on('error', function(e) {
            callback({result: "fail", type: "error", message: "error when loading page", error: e, additional: {interface: interface, url: header.host + header.path}});
        });
    }).on('error', function(e) {
        callback({result: "fail", type: "error", message: "error when connecting to server", error: e, additional: {interface: interface, url: header.host + header.path}});
    });
}