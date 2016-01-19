module.exports = TransferNodesCluster;

var SteamTradeOffer = require("./../../lib/steamTradeOffer.js");
var Logs = require("./../../lib/logs.js");

/**
 * @param {BotsController} botsController
 * @param {TraderBot} receiver
 * @constructor
 */
function TransferNodesCluster(botsController, receiver) {
    this.botsController = botsController;
    this.receiver = receiver;
    /**
     * @type {TransferNode[]}
     */
    this.nodes = [];
}

TransferNodesCluster.prototype.beginTransfer = function () {
    var self = this;
    for (var i = 0; i < this.nodes.length; i += 1) {
        this.nodes[i].start();
        this.nodes[i].onceFinished(function () {
            if (self.isCompleted()) {
                if (typeof self._onceCompletedCallback === "function") {
                    self._onceCompletedCallback();
                }
            }
        });
    }
};

TransferNodesCluster.prototype.isCompleted = function () {
    for (var i = 0; i < this.nodes.length; i += 1) {
        if (!this.nodes[i].isFinished()) {
            return false;
        }
    }
    return true;
};

TransferNode.prototype.onceCompleted = function (callback) {
    this._onceCompletedCallback = callback;
};

/**
 * @param {ShopItem} item
 */
TransferNodesCluster.prototype.addItem = function (item) {
    var senderSteamid = item.getItem().getOwner();
    if (!this.nodeExist(senderSteamid)) {
        this.nodes.push(new TransferNode(this.botsController.getBot(senderSteamid), this.receiver));
    }
    this.getNode(senderSteamid).addItem(item);
};

/**
 * @param steamid
 * @returns {TransferNode}
 */
TransferNodesCluster.prototype.getNode = function (steamid) {
    for (var i = 0; i < this.nodes.length; i += 1) {
        if (this.nodes[i].getSenderSteamid() === steamid) {
            return this.nodes[i];
        }
    }
    return false;
};

TransferNodesCluster.prototype.nodeExist = function (steamid) {
    return this.getNode(steamid) !== false;
};

/**
 * @param {TraderBot} sender
 * @param {TraderBot} receiver
 * @constructor
 */
function TransferNode(sender, receiver) {
    this.sender = sender;
    this.receiver = receiver;
    /**
     * @type {ShopItem[]}
     */
    this.items = [];
    this.finished = false;

    this.log = new Logs({
        applicationName: "Transfer Node ("
        + sender.steamClient.getCredentials().getUsername() + " > " + receiver.steamClient.getCredentials().getUsername() + ")",
        color: "blue"
    });

    this.senderOffer = new SteamTradeOffer(this.sender.steamClient, this.receiver.getSteamid());
    for (var i = 0; i < this.items.length; i += 1) {
        this.senderOffer.addMyItem(this.items[i].getTradeOfferAsset());
    }
    this.senderOffer.setToken(this.receiver.steamClient.getCredentials().getTradeToken());
}

TransferNode.prototype.getSenderSteamid = function () {
    return this.sender.getSteamid();
};

/**
 * @param {ShopItem} item
 */
TransferNode.prototype.addItem = function (item) {
    this.items.push(item);
};

TransferNode.prototype.start = function () {
    var self = this;
    this.senderOffer.make();
    this.log.debug("Starting transfer, " + items.length + " items");
    this.senderOffer.on("tradeSent", function () {
        self.log.debug(senderOffer.getTradeOfferID() + " sent");
        self.receiver.steamClient.tradeOffersManager.getOffer(self.senderOffer.getTradeOfferID(), function (err, tradeOffer) {
            if (!err) {
                self.accomplish(tradeOffer);
            } else {
                self.log.error(err);
            }
        });
    });
    senderOffer.on("tradeError", function (error) {
        self.log.error("Trade error: " + error.getCode());
    });
};

TransferNode.prototype.accomplish = function (tradeOffer) {
    var self = this;
    var itemsToReceive = tradeOffer.itemsToReceive;
    tradeOffer.accept(true, function () {
        self.log.debug(self.senderOffer.getTradeOfferID() + " accepted");
        tradeOffer.getReceivedItems(function (err, itemsReceived) {
            if (!err) {
                self._afterTransferItemsUpdate(itemsToReceive, itemsReceived, self.receiver.getSteamid());
                self.log.debug(senderOffer.getTradeOfferID() + " completed");
                self.finished = true;
                if (typeof self._onceFinishedCallback === "function") {
                    self._onceFinishedCallback();
                }
            } else {
                self.log.error(err);
            }
        });
    });
};

TransferNode.prototype.onceFinished = function (callback) {
    this._onceFinishedCallback = callback;
};

TransferNode.prototype.isFinished = function () {
    return this.finished;
};

/**
 * After an internal item transfer we have to update item id and owner
 * @param oldItems
 * @param newItems
 * @param newOwner
 * @private
 */
TransferNode.prototype._afterTransferItemsUpdate = function (oldItems, newItems, newOwner) {
    var matches = 0;
    for (var i = 0; i < oldItems.length; i += 1) {
        for (var p = 0; p < newItems.length; p += 1) {
            if (oldItems[i].classid === newItems[p].classid && oldItems[i].instanceid === newItems[p].instanceid) {
                var inventoryItem = this.shop.inventory.getItem(oldItems[i].assetid);
                inventoryItem.owner = newOwner;
                inventoryItem.id = newItems[p].assetid;
                matches += 1;
            }
        }
    }
    if (matches !== newItems.length) {
        this.log.warning("Wasn't able to update all the transferred items");
    } else {
        this.log.debug("Transfer items updated, matches " + matches + "/" + newItems.length);
    }
};