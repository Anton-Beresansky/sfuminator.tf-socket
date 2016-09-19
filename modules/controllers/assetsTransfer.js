module.exports = TransferNodesCluster;

var SteamTradeOffer = require("./../../lib/steamTradeOffer.js");
var Logs = require("./../../lib/logs.js");
var Events = require("events");

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
    this.lastTransferErrored = false;
    this.log = new Logs({
        applicationName: "Transfer Nodes Cluster > " + receiver.getSteamid(),
        color: "blue"
    });
    Events.EventEmitter.call(this);
}

require("util").inherits(TransferNodesCluster, Events.EventEmitter);

TransferNodesCluster.prototype.beginTransfer = function () {
    var self = this;
    this.lastTransferErrored = false;
    for (var i = 0; i < this.nodes.length; i += 1) {
        this.nodes[i].start();
        this.nodes[i].onceFinished(function () {
            if (self.isCompleted()) {
                if (typeof self._onceCompletedCallback === "function") {
                    self._onceCompletedCallback();
                }
            }
        });
        this.nodes[i].on("error", function () {
            if (!self.lastTransferErrored) {
                self.lastTransferErrored = true;
                self.emit("error");
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

TransferNodesCluster.prototype.onceCompleted = function (callback) {
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
        + this.sender.steamClient.getCredentials().getUsername() + " > " + this.receiver.steamClient.getCredentials().getUsername() + ")",
        color: "blue"
    });

    /**
     * @type {SteamTradeOffer}
     */
    this.senderOffer = new SteamTradeOffer(this.sender.steamClient, this.receiver.getSteamid());
    this.senderOffer.setToken(this.receiver.steamClient.getCredentials().getTradeToken());
    Events.EventEmitter.call(this);

    this._bindHandlers();
}

require("util").inherits(TransferNode, Events.EventEmitter);


TransferNode.prototype._bindHandlers = function () {
    var self = this;
    this.on("error", function () {
        self.unlockItems();
    });
};

TransferNode.prototype.getSenderSteamid = function () {
    return this.sender.getSteamid();
};

/**
 * @param {ShopItem} item
 */
TransferNode.prototype.addItem = function (item) {
    this.items.push(item);
    this.senderOffer.addMyItem(item.getTradeOfferAsset());
};

TransferNode.prototype.start = function () {
    var self = this;
    this.senderOffer.make();
    this.log.debug("Starting transfer, " + this.items.length + " items");
    this.lockItems();
    this.senderOffer.on("tradeSent", function () {
        self.log.debug(self.senderOffer.getTradeOfferID() + " sent");
        self.receiver.steamClient.tradeOffersManager.getOffer(self.senderOffer.getTradeOfferID(), function (err, tradeOffer) {
            if (!err) {
                self.accomplishRetries = 0;
                self.accomplish(tradeOffer);
            } else {
                self.log.error(err);
            }
        });
    });
    this.senderOffer.on("tradeError", function (error) {
        self.log.error("Trade error: " + error.getCode());
        self.emit("error");
    });
};

TransferNode.prototype.accomplish = function (tradeOffer) {
    var self = this;
    var itemsToReceive = tradeOffer.itemsToReceive;
    this.accomplishRetries += 1;
    tradeOffer.accept(true, function () {
        self.log.debug(self.senderOffer.getTradeOfferID() + " accepted");
        tradeOffer.getReceivedItems(function (err, itemsReceived) {
            if (!err) {
                self._afterTransferItemsUpdate(itemsToReceive, itemsReceived);
                self.log.debug(self.senderOffer.getTradeOfferID() + " completed");
                self.unlockItems();
                self.finished = true;
                if (typeof self._onceFinishedCallback === "function") {
                    self._onceFinishedCallback();
                }
            } else {
                if (self.accomplishRetries < 5) {
                    self.log.warning("Transfer didn't accomplish correctly, retrying");
                    self.accomplish(tradeOffer);
                } else {
                    self.log.error(err);
                    self.emit("error");
                }
            }
        });
    });
    if (!this.receiver.steamClient.tradeOfferHasListener(tradeOffer.id)) {
        this.log.debug("Adding listener on trade changes (" + tradeOffer.id + ")");
        self.receiver.steamClient.onTradeOfferChange(tradeOffer.id, function (offer) {
            if (offer.state === SteamTradeOffer.SteamTradeStatus.Accepted && !self.finished) {
                self.log.debug("Accomplish procedure didn't finish yet, bypassing trade state (" + tradeOffer.id + ")");
                tradeOffer.state = offer.state;
            }
        });
    }
};

TransferNode.prototype.onceFinished = function (callback) {
    this._onceFinishedCallback = callback;
};

TransferNode.prototype.isFinished = function () {
    return this.finished;
};

TransferNode.prototype.lockItems = function () {
    for (var i = 0; i < this.items.length; i += 1) {
        this.items[i].setAsTransferring();
    }
};

TransferNode.prototype.unlockItems = function () {
    for (var i = 0; i < this.items.length; i += 1) {
        this.items[i].unsetAsTransferring();
    }
};

/**
 * After an internal item transfer we have to update item id and owner
 * @param oldItems
 * @param newItems
 * @private
 */
TransferNode.prototype._afterTransferItemsUpdate = function (oldItems, newItems) {
    var matches = 0;
    for (var i = 0; i < oldItems.length; i += 1) {
        for (var p = 0; p < newItems.length; p += 1) {
            if (oldItems[i].classid === newItems[p].classid && oldItems[i].instanceid === newItems[p].instanceid) {
                for (var z = 0; z < this.items.length; z += 1) {
                    if (this.items[z].getItem().getID() === parseInt(oldItems[i].assetid)) {
                        this.items[z].item.owner = this.receiver.getSteamid();
                        this.items[z].item.id = parseInt(newItems[p].assetid);
                    }
                }
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