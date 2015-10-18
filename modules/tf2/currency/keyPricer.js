module.exports = KeyPricer;

/*
 * Trade list format:
 * [
 *      {
 *          count: int,
 *          metal_price: float
 *      }
 * ]
 * 
 */


function KeyPricer() {
    this.sellers = [];
    this.buyers = [];
    this.sell_price = 0;
    this.buy_price = 0;
}

KeyPricer.prototype.get = function () {
    return {sold_for: this.sell_price, bought_for: this.buy_price};
};

KeyPricer.prototype.makeAverage = function (trades) {
    var groupedPrices = this._getGroupedPrices(trades);
    var num = 0, den = 0;
    for (var _price in groupedPrices) {
        var price = parseFloat(_price);
        var normalized_price = this._normalizeMetalPrice(price);
        var price_weight = this._getPriceWeight(price, groupedPrices);
        var trades_weight = 0;
        for (var j = 0; j < trades.length; j += 1) {
            if (trades[j].metal_price === price) {
                trades_weight += trades[j].count_weight * trades[j].priority_weight;
            }
        }
        num += normalized_price * price_weight * trades_weight;
        den += price_weight * trades_weight;
    }
    return (num / den) / 9; //Averaging + Returning to refined notation
};

KeyPricer.prototype._normalizeMetalPrice = function (refined_price) {
    return parseInt((refined_price + 0.1) * 9);
};

KeyPricer.prototype.injectSellers = function (sellers) {
    this.sellers = this.sellers.concat(sellers);
    this.sellers.sort(function (a, b) {
        if (a.metal_price > b.metal_price) {
            return 1;
        } else if (a.metal_price < b.metal_price) {
            return -1;
        } else if (a.count > b.count) {
            return -1;
        } else if (a.count < b.count) {
            return 1;
        }
        return 0;
    });
    this.sellers = this.weightTrades(this.sellers);
    this.sell_price = this.makeAverage(this.sellers);
};

KeyPricer.prototype.injectBuyers = function (buyers) {
    this.buyers = this.buyers.concat(buyers);
    this.buyers.sort(function (a, b) {
        if (a.metal_price > b.metal_price) {
            return -1;
        } else if (a.metal_price < b.metal_price) {
            return 1;
        } else if (a.count > b.count) {
            return 1;
        } else if (a.count < b.count) {
            return -1;
        }
        return 0;
    });
    this.buyers = this.weightTrades(this.buyers);
    this.buy_price = this.makeAverage(this.buyers);
};

KeyPricer.prototype.weightTrades = function (trades) {
    var weighted_trades = [];
    for (var i = 0; i < trades.length; i += 1) {
        weighted_trades.push(trades[i]);
        weighted_trades[i].count_weight = this._getQuantityWeight(trades[i].count);
        weighted_trades[i].priority_weight = this._getTradePriority(i, trades);
    }
    return weighted_trades;
};

KeyPricer.prototype._getTradePriority = function (index, trades) {
    return Math.pow(Math.E, -((index + 1) * 5) / (trades.length + 2)); //tau = nTrades / 5
};

KeyPricer.prototype._getPriceWeight = function (price, groupedPrices) {
    if (groupedPrices.hasOwnProperty(price)) {
        return Math.log(groupedPrices[price]);
    }
    return 0;
};

KeyPricer.prototype._getGroupedPrices = function (trades) {
    var groupedPrices = {};
    for (var i = 0; i < trades.length; i += 1) {
        var price = trades[i].metal_price;
        if (!groupedPrices.hasOwnProperty(price)) {
            groupedPrices[price] = 0;
        }
        groupedPrices[price] += 1;
    }
    return groupedPrices;
};

KeyPricer.prototype._getQuantityWeight = function (count) {
    if (count >= 1) {
        return Math.log(count) + 1;
    } else {
        return 0;
    }
};