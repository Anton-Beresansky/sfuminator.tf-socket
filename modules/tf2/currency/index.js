KeyPricer = require("./keyPricer.js");
TradeTFKeys = require("./trade.tf.js");
BackpackTFKeys = require("./backpack.tf.js");

var keyPricer = new KeyPricer();
var keyPricerBis = new KeyPricer();
var tradetf = new TradeTFKeys();
var backpacktf = new BackpackTFKeys();

tradetf.load(function () {
    backpacktf.load(function () {
        keyPricer.injectSellers(backpacktf.getSellers());
        keyPricer.injectBuyers(backpacktf.getBuyers());
        keyPricer.injectSellers(tradetf.getSellers());
        keyPricer.injectBuyers(tradetf.getBuyers());
        console.log(keyPricer.get(), keyPricer.sellers.length);
    });
});