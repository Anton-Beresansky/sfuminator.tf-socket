module.exports = Search;

var Logs = require("../../lib/logs.js");

/**
 * Generic purpose search shop items class
 * @param {Shop} shop
 * @param {AjaxResponses} ajaxResponses
 * @returns {Search}
 */
function Search(shop, ajaxResponses) {
    this.shop = shop;
    this.ajaxResponses = ajaxResponses;
    this.log = new Logs({applicationName: "Search"});
}

/**
 * Find items
 * @param {type} text
 * @returns {SearchResult[]} See SearchResult class for more info
 */
Search.prototype.find = function (text) {
    var words = this.parseText(text);
    if (words && words instanceof Array) {
        var result = [];
        for (var section in this.shop.sections) {
            var sectionItems = this.shop.sections[section].getItems();
            for (var i = 0; i < sectionItems.length; i += 1) {
                var item = sectionItems[i].getItem();
                var itemName = item.getFullName().toLowerCase();
                for (var j = 0; j < words.length; j += 1) {
                    var found = itemName.search(words[j]);
                    if (found === -1) {
                        break;
                    }
                }
                if (found > -1) {
                    result.push(new SearchResult(item, found));
                }
            }
        }
        return result;
    } else {
        return [];
    }
};

/**
 * Parse text string for search purposes
 * @param {type} text
 * @returns {String[]|Boolean} Words list or false if text can't be parsed
 */
Search.prototype.parseText = function (text) {
    try {
        text = text.toString();
        if (text.length === 0 || text.length > 30) {
            return false;
        } else {
            var punctRE = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-.\/:;<=>?@\[\]^_`{|}~]/g;
            var spaceRE = /\s+/g;
            return text.toLowerCase().replace(punctRE, '').replace(spaceRE, ' ').split(' ');
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

/**
 * Search result class
 * @param {SectionItem} item
 * @param {Number} index Indicating starting offset of the matching string
 */
function SearchResult(item, index) {
    this.item = item;
    this.index = index;
}