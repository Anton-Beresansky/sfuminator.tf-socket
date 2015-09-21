module.exports = IncomingOffers;

var events = require("events");
var API = require("../lib/api.js");

var CFG = JSON.parse(require("fs").readFileSync("../socket_config.json"));
var sfuminatorAPI = new API("sfuminator.tf");
if (CFG.application === "dev") {
    sfuminatorAPI = new API("dev.sfuminator.tf");
}

function IncomingOffers(steam, tradeOffers, sfr) {
    this.incomingOffers = [];
    this.steam = steam;
    this.sfr = sfr;
    this.tradeOffers = tradeOffers;
    events.EventEmitter.call(this);
    var self = this;
    this.on("error", function (error, steamid) {
        var message = "Sorry there was an error, ";
        if (error === "cant_load_opponent_backpack") {
            message += "I wasn't able to load your backpack, is it visible to public?";
        } else if (error === "cant_associate_assets") {
            message += "some items in the trade seems to not exist anymore";
        } else if (error === "wrong_amount_my_items") {
            message += "if you send me a trade offer I can trade only 1 hat at the time (note that your metal has to be precise)";
        } else if (error === "not_in_shop") {
            message += "it seems that I'm not selling the item you selected";
        } else if (error === "item_reserved") {
            message += "Item has been selected by someone else a moment ago";
        } else if (error === "wrong_items") {
            message += "You put an unexpected amount of metal";
        } else if (error === "scammer") {
            message += "it seems that community marked you as a scammer, my boss said I can't trade with people like you.";
        }
        self.steam.sendMessage(steamid, message);
        var incLength = self.incomingOffers.length;
        for (var i = 0; i < incLength; i += 1) {
            if (self.incomingOffers[i].steamid === steamid) {
                self.tradeOffers.declineOffer({tradeOfferId: self.incomingOffers[i].tradeofferid});
                self.dereserveItem(steamid, self.incomingOffers[i].myitemid, function (result) {
                    self.emit("debug", JSON.stringify(result));
                });
                self.incomingOffers.splice(i, 1);
                incLength = self.incomingOffers.length;
            }
        }
    });
    this.on("debug", function (message) {
        var time = getDateTime();
        console.log(time + " \t\t->incomingOffers: " + message);
    });
}

require("util").inherits(IncomingOffers, events.EventEmitter);

IncomingOffers.prototype.onOfferChange = function (offer) {
    var self = this;
    if (offer.trade_offer_state === 2) { //Trade offer just received
        this.incomingOffers.push({steamid: offer.steamid, offer: offer, tradeofferid: offer.tradeofferid});
        this.emit("debug", "Got incoming offer, analyzing...");
        self.parseOfferItems(offer, function (items) {
            for (var i = 0; i < self.incomingOffers.length; i += 1) {
                if (self.incomingOffers[i].tradeofferid === offer.tradeofferid) {
                    self.incomingOffers[i].myitemid = items.myItems[0].id;
                }
            }
            self.checkOffer(offer.steamid, items, function (hatPrice) {
                self.tradeOffers.acceptOffer({tradeOfferId: offer.tradeofferid});
                self.steam.sendMessage(offer.steamid,
                        "Thank you, your offer has been accepted, "
                        + "remember to have a look to our site! Where you can "
                        + "get automated trade offers and where you can buy and sell many other hats: http://sfuminator.tf/");
                for (var i = 0; i < self.incomingOffers.length; i += 1) {
                    if (self.incomingOffers[i].tradeofferid === offer.tradeofferid) {
                        self.incomingOffers.splice(i, 1);
                        break;
                    }
                }
                items.myItems[0].scrapPrice = hatPrice;
                var trade = {
                    partnerID: offer.steamid,
                    tradeMode: "hatShop",
                    tradeModePlus: "hatShop",
                    myItems: items.myItems,
                    hisItems: items.theirItems

                };
                self.sfr.socket.appendTrade(trade, function (response) {
                    self.emit("debug", "Appended trade: " + JSON.stringify(response));
                });
            });
        });
    }
};

IncomingOffers.prototype.checkOffer = function (partnerID, items, callback) {
    var self = this;
    if (items.myItems.length !== 1) {
        this.emit("error", "wrong_amount_my_items", partnerID);
        return;
    }
    var myItem = items.myItems[0];
    var myDefindex = parseInt(myItem.defindex);
    if (myDefindex === 5000 || myDefindex === 5001 || myDefindex === 5002 || myDefindex === 5021) {
        this.emit("debug", "Not in shop, my item is currency");
        this.emit("error", "not_in_shop", partnerID);
        return;
    }
    this.emit("debug", "Alerting item: " + myItem.defindex);
    this.alertIncomingOffer(partnerID, myItem, function (response) {
        self.emit("debug", "Alerted incoming offer: " + JSON.stringify(response));
        if (response.result === "success") {
            var hatPrice = response.scrapPrice;
            if (self.countMetal(items.theirItems) === hatPrice && hatPrice > 0) {
                callback(hatPrice);
            } else {
                self.emit("error", "wrong_items", partnerID);
            }
        } else if (response.result === "error") {
            self.emit("error", response.error, partnerID);
        }
    });
};

IncomingOffers.prototype.countMetal = function (items) {
    var scrapPrice = 0;
    for (var i = 0; i < items.length; i += 1) {
        var defindex = items[i].defindex;
        if (defindex === 5000) {
            scrapPrice += 1;
        } else if (defindex === 5001) {
            scrapPrice += 3;
        } else if (defindex === 5002) {
            scrapPrice += 9;
        } else {
            return false;
        }
    }
    return scrapPrice;
};

IncomingOffers.prototype.alertIncomingOffer = function (partnerID, myItem, callback) {
    this.post({action: "checkIncomingOffer", steamid: partnerID, id: myItem.id}, function (result) {
        callback(result);
    });
};

IncomingOffers.prototype.dereserveItem = function (partnerID, id, callback) {
    this.post({action: "dereserveItem", steamid: partnerID, myitemid: id}, function (result) {
        if (typeof callback === "function") {
            callback(result);
        }
    });
};

IncomingOffers.prototype.parseOfferItems = function (offer, callback) {
    var myItems = this._getMyItems(offer.items_to_give, offer.steamid);
    if (myItems !== false) {
        this._getTheirItems(offer.steamid, offer.items_to_receive, function (theirItems) {
            callback({myItems: myItems, theirItems: theirItems});
        });
    }
};

IncomingOffers.prototype._getMyItems = function (myAssets, partnerID) {
    var myBackpack = this.sfr.backpack.items;
    return this._associateAssets(myBackpack, myAssets, partnerID);
};

IncomingOffers.prototype._getTheirItems = function (steamid, theirAssets, callback) {
    var self = this;
    this.sfr.loadPersonBackpack(steamid, function (inventory) {
        if (inventory === "private" || inventory === "error") {
            self.emit("error", "cant_load_opponent_backpack", steamid);
        } else {
            var items = self._associateAssets(inventory.items, theirAssets, steamid);
            if (items !== false) {
                callback(items);
            }
        }
    });
};

IncomingOffers.prototype._associateAssets = function (backpack, assets, partnerID) {
    var items = [];
    if (typeof assets !== "object") {
        this.emit("error", "cant_associate_assets", partnerID);
        return false;
    }
    for (var i = 0; i < assets.length; i += 1) {
        if (backpack.hasOwnProperty(assets[i].assetid)) {
            items.push(backpack[assets[i].assetid]);
        } else {
            this.emit("error", "cant_associate_assets", partnerID);
            return false;
        }
    }
    return items;
};

IncomingOffers.prototype.post = function (data, callback) {
    data.rootKey = "9x7797qtujacli7l89ku58cyc7oxmtay43";
    data.botRequest = true;
    data.botSteamid = this.sfr.mySteamid;
    var myInterface = {
        name: "include",
        method: {
            name: "socket",
            httpmethod: "POST",
            parameters: data
        }
    };
    sfuminatorAPI.callAPI(myInterface, function (result) {
        callback(result);
    });
};

/*-> trade_offer_state
 Name	Value	Comment
 k_ETradeOfferStateInvalid	1	Invalid
 k_ETradeOfferStateActive	2	This trade offer has been sent, neither party has acted on it yet.
 k_ETradeOfferStateAccepted	3	The trade offer was accepted by the recipient and items were exchanged.
 k_ETradeOfferStateCountered	4	The recipient made a counter offer
 k_ETradeOfferStateExpired	5	The trade offer was not accepted before the expiration date
 k_ETradeOfferStateCanceled	6	The sender cancelled the offer
 k_ETradeOfferStateDeclined	7	The recipient declined the offer
 k_ETradeOfferStateInvalidItems	8	Some of the items in the offer are no longer available (indicated by the missing flag in the output)
 */

/*-> Offer structure
 tradeofferid           - a unique identifier for the trade offer
 accountid_other        - your partner in the trade offer
 message                - a message included by the creator of the trade offer
 expiration_time        - unix time when the offer will expire (or expired, if it is in the past)
 trade_offer_state      - see ETradeOfferState above
 items_to_give          - array of assest
 items_to_receive       - array of assets
 is_our_offer           - boolean
 time_created           - time the offer was sent (timestamp)
 time_updated           - time the trade_offer_state last changed (timestamp)
 */

/*-> Asset structure
 appid (440)
 contextid (2)
 assetid        - either assetid or currencyid will be set
 currencyid     - either assetid or currencyid will be set
 classid        - together with instanceid, uniquely identifies the display of the item
 instanceid     - together with classid, uniquely identifies the display of the item
 amount         - the amount offered in the trade, for stackable items and currency
 missing        - a boolean that indicates the item is no longer present in the user's inventory
 */


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