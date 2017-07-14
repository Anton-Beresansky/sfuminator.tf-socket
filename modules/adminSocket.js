module.exports = AdminSocket;

var LogLog = require('log-log');
var fs = require('fs');

/**
 * @param sfuminator {Sfuminator}
 * @constructor
 */
function AdminSocket(sfuminator) {
    this.sfuminator = sfuminator;
    this.db = this.sfuminator.db;
    this.queries = AdminSocket.QUERIES;
    this.log = LogLog.create({applicationName: "Admin Socket", color: "yellow"});
    this.init();
}

AdminSocket.prototype.init = function () {
    if (fs.existsSync('bufferedTradedItems')) {
        this.log.debug("Reading traded items...");
        this.tradedItems = JSON.parse(fs.readFileSync('bufferedTradedItems'));
    }
};

/**
 * @param request {SfuminatorRequest}
 * @param callback
 */
AdminSocket.prototype.request = function (request, callback) {
    var self = this;
    if (this.sfuminator.isAdmin(request.getRequesterSteamid())) {
        var command = request.getData().command;
        if (typeof this[command] === "function") {
            this[command](function (err, response) {
                if (err) {
                    self.log.error(err);
                }
                callback(response);
            }, request);
        } else {
            callback(this[command]);
        }
    } else {
        this.log.warning("Access denied");
    }
};

AdminSocket.prototype.getTradedItems = function (callback) {
    this.log.debug("Getting traded items...");
    var self = this;
    if (this.tradedItems) {
        callback(null, {path: "bti"});
    } else {
        this.db.connect(function (connection) {
            connection.query(self.queries.getTradedItems(), function (result) {
                connection.release();
                self.log.debug("Query ended");
                console.log(JSON.stringify(result).slice(0, 200));
                self.tradedItems = self.compressTradedItems(result);
                self.log.debug("Storing traded items... " + result.length + " records");
                fs.writeFileSync('bufferedTradedItems', JSON.stringify({items: self.tradedItems}));
                self.log.debug("Done");
                callback(null, self.tradedItems.toString('utf8'));
            });
        });
    }
};

AdminSocket.prototype.getSchema = function (callback) {
    callback(null, this.sfuminator.webApi.backpacks.tf2.schema);
};

AdminSocket.prototype.compressTradedItems = function (items) {
    this.log.debug("Compressing items...");
    var itemBuffer = new Buffer(9 * items.length);
    for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var d = new Date(item.d).getTime() / 1000;
        itemBuffer[(9 * i)] = d & 0xFF;
        d = d >> 8;
        itemBuffer[(9 * i) + 1] = d & 0xFF;
        d = d >> 8;
        itemBuffer[(9 * i) + 2] = d & 0xFF;
        d = d >> 8;
        itemBuffer[(9 * i) + 3] = d & 0xFF;

        itemBuffer[(9 * i) + 4] = ((item.t === "mine") ? 1 : 0) | ((item.q << 1) & 0xFE);

        itemBuffer[(9 * i) + 5] = (item.p) & 0xFF;
        itemBuffer[(9 * i) + 6] = (item.p >> 8) & 0xFF;
        itemBuffer[(9 * i) + 7] = (item.i) & 0xFF;
        itemBuffer[(9 * i) + 8] = (item.i >> 8) & 0xFF;

        if (i % 5000 === 0) {
            this.log.progressBar(i, items.length);
        }
    }
    return itemBuffer;
};

AdminSocket.QUERIES = {
    getTradedItems: function () {
        return 'SELECT traded_items.trade_date d,traded_items.shop_type t,traded_items.scrapPrice p,defindex i,quality q FROM (SELECT trade_id,trade_date,item_id,shop_type,scrapPrice FROM ' +
            '(SELECT id,last_update_date trade_date FROM my_sfuminator.shop_trades where my_sfuminator.shop_trades.status_info="accepted" AND last_update_date>"2016-01-01 00:00:00") ' +
            'as trades JOIN my_sfuminator.shop_trade_items ON id=trade_id) as traded_items JOIN my_sfuminator_items.items ON my_sfuminator_items.items.id=item_id ' +
            '';
    }
};