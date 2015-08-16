module.exports = Search;

var Logs = require("../../lib/logs.js");

function Search(shop, ajaxResponses) {
    this.shop = shop;
    this.ajaxResponses = ajaxResponses;
    this.log = new Logs("Search");
}

Search.prototype.find = function (text) {
    var words = this.parseText(text);
    if (words && words instanceof Array) {
        var result = [];
        for (var section in this.shop.sections) {
            var sectionItems = this.shop.sections[section].getItems();
            for (var i = 0; i < sectionItems.length; i += 1) {
                var shopItem = sectionItems[i];
                var shopItemName = shopItem.name.toLowerCase();
                for (var j = 0; j < words.length; j += 1) {
                    var found = shopItemName.search(words[j]);
                    if (found === -1) {
                        break;
                    }
                }
                if (found > -1) {
                    result.push({item: this.shop.getItem(shopItem.id), index: found});
                }
            }
        }
        return result;
    } else {
        this.ajaxResponses.itemNotFound;
    }
};

Search.prototype.parseText = function (text) {
    try {
        text = text.toString();
        if (text.length === 0 || text.length > 30) {
            return false;
        } else {
            return text.toLowerCase().match(/\S+/g);
        }
    } catch (e) {
        this.log.error("Couldn't parse text input");
        return false;
    }
};

Search.prototype.saveRequest = function (request) {
    if (!request.getCookie("_me")) {
        this.log.warning("Request has not _me cookie set, it could be a request not coming from the site (IP: " + request.getIP() + ")");
    }
};