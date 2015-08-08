//Generic apis library
var events = require("events");
var request = require("request");

APIdebug = true;
module.exports = APIs;
function APIs(api_url) {
    this.MAX_RETRIES = 6;
    this.base_url = api_url;
    this.cookies = [];
    this.custom_headers = {};
    events.EventEmitter.call(this);
    this.on("error", function (message) {
        console.log(message);
    });

    this._j = request.jar();
    this._request = request.defaults({jar: this._j});
}

require("util").inherits(APIs, events.EventEmitter);

//interface obj
// var myInterface = {
//        protocol: "http" / "https" // default http
//        name: "include",
//        JSON: bool, //optional -> default true
//        XML: bool, //optional -> default false
//        method: {
//            name: "zxcv",
//            httpmethod: "GET", //or "POST"        
//            predata: "botSocket.php",
//            parameters: {
//                  method: "method1,method2,metohd3"
//                  data1: "var1",
//                  data2: "var2"
//            }
//        }
//  };

APIs.prototype.setCookie = function (cookies) {
    if (typeof cookies === "string") {
        this.cookies.push(cookies);
    } else if (cookies instanceof Array) {
        this.cookies = this.cookies.concat(cookies);
    } else {
        this.emit("error", "Wrong variable type for cookie, has to be string or array");
    }
};


APIs.prototype.setHeader = function (name, value) {
    this.custom_headers[name] = value;
};

APIs.prototype.setCookie = function (cookies) {
    if (typeof cookies === "string") {
        this.cookies.push(cookies);
    } else if (cookies instanceof Array) {
        this.cookies = this.cookies.concat(cookies);
    } else {
        this.emit("error", "Wrong variable type for cookie, has to be string or array");
    }
};


APIs.prototype.callAPI = function (myInterface, callback) {
    var self = this;
    var selfInterface = myInterface;
    var tries = 0;
    self.raw_callAPI(myInterface, selfCallback = function (response) {
        if (response.result === "success") {
            var finalResult = "";
            if (myInterface.hasOwnProperty("JSON") && !myInterface.JSON && (!myInterface.hasOwnProperty("XML") || (myInterface.hasOwnProperty("XML") && !myInterface.XML))) {
                finalResult = response.content.toString("utf8");
            } else if (myInterface.hasOwnProperty("XML") && myInterface.XML) {
                var parseString = require('xml2js').parseString;
                var xml = response.content;
                parseString(xml, function (err, result) {
                    if (result === undefined) {
                        self.emit("error", "ERROR: " + "Couldn't parse JSON nor XML (/" + selfInterface.name + "/" + selfInterface.method.name + ")" + " [XML conversion error: " + err + "]");
                        finalResult = {result: "fail", content: response.content};
                    } else {
                        finalResult = result;
                    }
                });
            } else {
                try {
                    finalResult = JSON.parse(response.content);
                } catch (e) {
                    self.emit("error", "callAPI: Couldn't parse JSON (/" + selfInterface.name + "/" + selfInterface.method.name + ")", 14);
                    finalResult = response;
                }
            }
            callback(finalResult);
            return;
        } else {
            tries += 1;
            errMsg = "";
            if (response.type === "error") {
                var errMsg = response.error;
            }
            self.emit("debug", "WARNING: " + response.message + "(try:" + tries + ")" + errMsg);
            self.emit("debug", "\tAdditional infos: " + JSON.stringify(response));
            if (tries === self.MAX_RETRIES) {
                callback(null);
                self.emit("error", "callAPI: no response over " + self.MAX_RETRIES + " times (/" + selfInterface.name + "/" + selfInterface.method.name + ")", 15);
                return;
            } else {
                setTimeout(function () {
                    self.raw_callAPI(selfInterface, selfCallback);
                }, 1000 * tries);
            }
        }
    });
};

APIs.prototype.raw_callAPI = function (myInterface, callback) {
    var self = this;
    var http = require("http");
    if (myInterface.hasOwnProperty("protocol") && myInterface.protocol === "https") {
        http = require("https");
    }
    var base_url = this.base_url;
    if (myInterface.hasOwnProperty("baseurl")) {
        base_url = myInterface.baseurl;
    }
    var stringinterfacename = "/";
    if (myInterface.hasOwnProperty("name")) {
        stringinterfacename += myInterface.name;
    }
    var stringversion = "";
    if (myInterface.method.hasOwnProperty("version")) {
        stringversion = "/v" + myInterface.method.version;
    }
    var predata = "";
    if (myInterface.method.hasOwnProperty("predata")) {
        predata = "/" + myInterface.method.predata;
    }
    var methodName = "";
    if (myInterface.method.hasOwnProperty("name")) {
        methodName = "/" + myInterface.method.name;
    }
    var parameters = myInterface.method.parameters;
    var data = "";
    for (var prop in parameters) {
        if (parameters.hasOwnProperty(prop)) {
            data += prop + "=" + parameters[prop] + "&";
        }
    }
    data = data.slice(0, data.length - 1);
    var cookies = "";
    if (this.cookies) {
        for (var x in this.cookies) {
            cookies += this.cookies[x] + ";";
        }
    }
    var headers = {Cookie: cookies};
    for (var x in self.custom_headers) {
        headers[x] = self.custom_headers[x];
    }
    if (myInterface.method.hasOwnProperty("httpmethod") && myInterface.method.httpmethod === "POST") {
        var path = stringinterfacename + methodName + stringversion + predata;

        headers["Content-Length"] = Buffer.byteLength(data);
        headers["Content-Type"] = 'application/x-www-form-urlencoded; charset=UTF-8';

        var post_options = {
            host: base_url,
            port: '80',
            path: path,
            method: 'POST',
            headers: headers
        };

        // Set up the request
        if (APIdebug) {
            console.log("#Request:\n" + JSON.stringify(post_options, null, "\t"));
            console.log("#Data: " + data.substring(0, 1000));
        }
        var post_req = http.request(post_options, function (res) {
            //res.setEncoding('utf8');
            var bodyChunks = [];
            res.on('data', function (chunk) {
                bodyChunks.push(chunk);
            });
            res.on('end', function () {
                var finalResult = "";
                try {
                    var body = Buffer.concat(bodyChunks);
                    finalResult = {result: "success", content: body, options: options};
                } catch (e) {
                    finalResult = {result: "fail", type: "error", message: "error when fetching data", error: e, additional: {interface: myInterface, options: post_options}};
                }
                callback(finalResult);
                return;
            });
            res.on('error', function (e) {
                callback({result: "fail", type: "error", message: "error when loading page", error: e, additional: {interface: myInterface, options: post_options}});
            });
        }).on('error', function (e) {
            callback({result: "fail", type: "error", message: "error when connecting to server", error: e, additional: {interface: myInterface, options: post_options}});
        });

        // post the data
        post_req.write(data);
        post_req.end();
    } else {
        if (myInterface.method.httpmethod !== "GET") {
            self.emit("error", "Unrecognised httpmethod: " + myInterface.method.httpmethod + " proceding with 'GET'");
        }
        if (data !== "") {
            data = "?" + data;
        }
        var path = stringinterfacename + methodName + stringversion + predata + data;
        var options = {host: base_url, path: path, headers: headers};
        if (APIdebug) {
            console.log("#DEBUG API REQUEST:\n" + JSON.stringify(options, null, "\t"));
        }
        http.get(options, function (res) {
            var bodyChunks = [];
            res.on('data', function (chunk) {
                bodyChunks.push(chunk);
            });
            res.on('end', function () {
                var finalResult = "";
                try {
                    var body = Buffer.concat(bodyChunks);
                    finalResult = {result: "success", content: body, options: options};
                } catch (e) {
                    finalResult = {result: "fail", type: "error", message: "error when fetching data", error: e, additional: {interface: myInterface, options: options}};
                }
                callback(finalResult);
                return;
            });
            res.on('error', function (e) {
                callback({result: "fail", type: "error", message: "error when loading page", error: e, additional: {interface: myInterface, options: options}});
            });
        }).on('error', function (e) {
            callback({result: "fail", type: "error", message: "error when connecting to server", error: e, additional: {interface: myInterface, options: options}});
        });
    }
};

APIs.prototype.post = function (url, options, callback) {
    var self = this;
    if (APIdebug) {
        console.log("#Posting: " + url + "\n" + JSON.stringify(options, null, "\t"));
    }
    this._request.post({
        uri: url,
        headers: self.getHeaders(),
        form: options
    }, function (error, response, body) {
        if (error || response.statusCode !== 200) {
            if (typeof callback === 'function') {
                callback(error || new Error(response.statusCode));
            }
        } else {
            if (typeof callback === 'function') {
                var result;
                try {
                    result = JSON.parse(body);
                } catch (e) {
                    self.emit("error", "Couldn't parse JSON on 'post': " + url);
                    result = body;
                }
                callback(result, response);
            }
        }
    });
};

APIs.prototype.getHeaders = function () {
    var headers = this.custom_headers;
    var cookies = "";
    if (this.cookies) {
        for (var x in this.cookies) {
            cookies += this.cookies[x] + ";";
        }
    }
    headers.Cookie = cookies;
    return headers;
};