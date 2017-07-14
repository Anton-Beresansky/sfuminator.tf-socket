module.exports = PriceMachine;

var LogLog = require('log-log');
var Price = require('../price.js');
var TF2Currency = require("../tf2/tf2Currency.js");
var TF2Constants = require("../tf2/tf2Constants.js");
var neataptic = require('neataptic');
var fs = require('fs');

var Node = neataptic.Node;
var Neat = neataptic.Neat;
var Network = neataptic.Network;
var Methods = neataptic.Methods;
var Architect = neataptic.Architect;

/**
 * @param sfuminator {Sfuminator}
 * @constructor
 */
function PriceMachine(sfuminator) {
    this.sfuminator = sfuminator;
    this.db = this.sfuminator.db;
    this.schemaItems = this.sfuminator.webApi.tf2.schema;
    this.normalizationIndexes = {};
    this.log = LogLog.create({applicationName: "Price Machine", color: "magenta"});

    var self = this;
    this.sfuminator.shop.on("ready", function () {
        self._init();
    });
}

PriceMachine.NETWORK = {
    NEURONS: 7,
    OUTPUT: 1,
    RATE: 0.05,
    ITERATIONS: 100000
};

PriceMachine.SCHEMA_INPUT_DATA = [
    "defindex",
    "item_class",
    "item_slot",
    "holiday_restriction",
    "craft_material_type",
    "used_by_classes",
    "price"
];

PriceMachine.MAXIMUM_TRAIN_KEYS_PRICE = 1;
PriceMachine.RANDOM_TEST_SAMPLES = 50;

PriceMachine.prototype._init = function () {
    this.createNormalizationIndexes();
    this.generateNetwork();
    this.trainingSet = this._getTrainingSet();
    this.normalizedTrainingSet = this._getNormalizedTrainingSet();
    this.trainNetwork();
};

PriceMachine.prototype.trainNetwork = function () {

    var randomTests = [];
    for (var i = 0; i < PriceMachine.RANDOM_TEST_SAMPLES; i += 1) {
        var randomIndex = parseInt(Math.random() * (this.normalizedTrainingSet.length - 1));
        randomTests.push({
            input: this.trainingSet.splice(randomIndex, 1)[0],
            normalized: this.normalizedTrainingSet.splice(randomIndex, 1)[0].input
        });
    }

    this.log.debug("Training on " + this.normalizedTrainingSet.length + " samples");
    var iterations = PriceMachine.NETWORK.ITERATIONS;
    var rate = PriceMachine.NETWORK.RATE;

    var intervals = 10000;

    for (var p = 0; p < intervals; p += 1) {
        this.network.train(this.normalizedTrainingSet, {
            log: 10,
            error: 0.01,
            iterations: (iterations / intervals),
            rate: rate
        });

        var averageError = null;
        for (i = 0; i < randomTests.length; i += 1) {
            actualPrice = randomTests[i].input.price.toKeys();
            networkPrice = new Price(this.network.activate(randomTests[i].normalized), "keys").toKeys();
            var error = Math.abs(actualPrice - networkPrice) / networkPrice;
            averageError = !isNaN(averageError) ? ((averageError + error) / 2) : error;
        }
        this.log.debug("error " + averageError);
    }


    for (i = 0; i < randomTests.length; i += 1) {
        this.log.debug("TESTING:");
        //console.log(randomTests[i].input);
        var actualPrice = randomTests[i].input.price;
        var networkPrice = new Price(this.network.activate(randomTests[i].normalized), "keys");
        this.log.debug("Actual price: " + actualPrice.toMetal() + "ref | " + actualPrice.toKeys() + "keys");
        this.log.debug("Network price: " + networkPrice.toMetal() + "ref | " + networkPrice.toKeys() + "keys");
    }


    fs.writeFileSync("network_" + PriceMachine.MAXIMUM_TRAIN_KEYS_PRICE + "key_L" + PriceMachine.NETWORK.NEURONS + "_I" + iterations + "_R" + rate.toString().replace(".", ""), JSON.stringify(this.network.toJSON()));
};

PriceMachine.prototype.generateNetwork = function () {
    this.network = new Architect.Perceptron(this.normalizationIndexes.length - 1, PriceMachine.NETWORK.NEURONS * 2, PriceMachine.NETWORK.NEURONS, PriceMachine.NETWORK.OUTPUT);
};

PriceMachine.prototype.createNormalizationIndexes = function () {
    this.log.debug("Crating normalization indexes... ");
    this._addNormalizationIndex("flag_cannot_craft", true);
    this._addNormalizationIndex("flag_cannot_craft", false);
    for (var defIndex in this.schemaItems) {
        var schemaItem = this.schemaItems[defIndex];

        for (var inputIndex = 0; inputIndex < PriceMachine.SCHEMA_INPUT_DATA.length; inputIndex += 1) {
            var itemProperty = PriceMachine.SCHEMA_INPUT_DATA[inputIndex];

            if (schemaItem.hasOwnProperty(itemProperty)) {
                if (itemProperty === "used_by_classes") {
                    var classes = schemaItem[itemProperty].split(",").filter(function (a) {
                        return a
                    });
                    for (var i = 0; i < classes.length; i += 1) {
                        this._addNormalizationIndex(classes[i], "");
                        this._addNormalizationIndex(classes[i], true);
                    }
                } else if (itemProperty === "price") {
                    for (var quality in schemaItem[itemProperty]) {
                        this._addNormalizationIndex("quality", quality);
                    }
                } else {
                    this._addNormalizationIndex(itemProperty, schemaItem[itemProperty]);
                }
            } else {
                this._addNormalizationIndex(itemProperty, "");
            }
        }
    }
};

PriceMachine.prototype._addNormalizationIndex = function (index, possibleValue) {
    if (this.normalizationIndexes[index] instanceof Array) {
        var found = false;
        for (var i = 0; i < this.normalizationIndexes[index].length; i += 1) {
            if (this.normalizationIndexes[index][i] === possibleValue) {
                found = true;
                break;
            }
        }
        if (!found) {
            this.normalizationIndexes[index].push(possibleValue);
        }
    } else {
        this.normalizationIndexes[index] = [possibleValue];
    }
};

PriceMachine.prototype._getTrainingSet = function () {
    var trainSet = [];
    for (var defindex in this.schemaItems) {
        var schemaItem = this.schemaItems[defindex];
        for (var quality in schemaItem["price"]) {
            if (quality !== "5") {
                for (var i = 0; i < schemaItem["price"][quality].length; i += 1) {

                    var price = schemaItem["price"][quality][i];
                    if (price.currency && TF2Currency.hasOwnProperty(price.currency) && !price.flag_cannot_trade) {
                        var trainingItem = this._makeTrainingItem(schemaItem, quality, schemaItem["price"][quality][i]);
                        if (trainingItem.price.toKeys() <= PriceMachine.MAXIMUM_TRAIN_KEYS_PRICE) {
                            trainSet.push(trainingItem);
                        }
                    }
                }
            }
        }
    }
    return trainSet;
};

PriceMachine.prototype._makeTrainingItem = function (schemaItem, quality, price) {
    var trainingItem = {
        quality: quality,
        flag_cannot_craft: price.flag_cannot_craft,
        price: new Price(price["price"], price["currency"])
    };
    for (var inputIndex = 0; inputIndex < PriceMachine.SCHEMA_INPUT_DATA.length; inputIndex += 1) {
        var itemProperty = PriceMachine.SCHEMA_INPUT_DATA[inputIndex];
        if (itemProperty === "used_by_classes") {
            var classes = schemaItem[itemProperty].split(",").filter(function (a) {
                return a
            });
            if (classes.length === 0) {
                classes = TF2Constants.classes;
            }
            for (var i = 0; i < classes.length; i += 1) {
                trainingItem[classes[i]] = true;
            }
        } else if (itemProperty !== "price") {
            trainingItem[itemProperty] = schemaItem[itemProperty];
        }
    }
    return trainingItem;
};

PriceMachine.prototype._getNormalizedTrainingSet = function () {
    var normalizedTrainingSet = [];
    for (var i = 0; i < this.trainingSet.length; i += 1) {
        var inputSet = [];
        for (var index in this.normalizationIndexes) {
            if (this.trainingSet[i].hasOwnProperty(index)) {
                inputSet.push(this._getNormalizedValue(index, this.trainingSet[i][index]));
            } else {
                inputSet.push(this.trainingSet[i][index] = this._getNormalizedValue(index, ""));
            }
        }
        normalizedTrainingSet.push({
            input: inputSet,
            output: [this.trainingSet[i].price.toKeys() / PriceMachine.MAXIMUM_TRAIN_KEYS_PRICE]
        });
    }
    return normalizedTrainingSet;
};

PriceMachine.prototype._getNormalizedValue = function (property, value) {
    for (var i = 0; i < this.normalizationIndexes[property].length; i += 1) {
        if (this.normalizationIndexes[property][i] === value) {
            return i * (1 / (this.normalizationIndexes[property].length - 1));
        }
    }

};
