module.exports = LastTrades;

var TF2Item = require('../tf2/tf2Item.js');

/**
 * @param stats {Stats}
 * @constructor
 */
function LastTrades(stats) {
    this.stats = stats;
    this.sfuminator = this.stats.sfuminator;
    this.users = this.sfuminator.users;
    this.db = this.sfuminator.db;
    this.shop = this.sfuminator.shop;
    this.backpacksApi = this.shop.webApi.backpacks;
    this.queries = LastTrades.QUERIES;
    this.last_trades = [];
}

LastTrades.prototype.read = function (callback) {
    var self = this;
    this.db.connect(function (connection) {
        connection.query(self.queries.getTrades(), function (result) {
            connection.release();
            callback({
                trades: self.parse(result),
                currency: self.shop.tf2Currency.valueOf()
            });
        });
    })
};

LastTrades.prototype.parse = function (result) {
    var i, attributes = [], items = [], trades = [], itemID, tradeID;
    for (i = 0; i < result.length; i += 1) {
        var r = result[i];
        itemID = r.item_id;
        tradeID = r.trade_id;
        attributes.push({
            defindex: r.attr_defindex,
            value: r.value,
            float_value: r.float_value,
            steamid: r.attr_steamid
        });
        if (((i + 1) === result.length) || result[i + 1].item_id !== itemID) {
            if (itemID) {
                var item = new TF2Item(this.backpacksApi.mergeItemWithSchemaItem({
                    id: r.item_id,
                    owner: r.owner,
                    original_id: r.original_id,
                    defindex: r.defindex,
                    level: r.level,
                    quantity: r.quantity,
                    origin: r.origin,
                    flag_cannot_craft: r.flag_cannot_craft,
                    flag_cannot_trade: r.flag_cannot_trade,
                    quality: r.quality,
                    attributes: attributes,
                    scrapPrice: r.scrapPrice,
                    shop: r.shop_type
                }, this.backpacksApi.tf2.schema[r.defindex]), r.owner);
                items.push({
                    id: item.id,
                    owner: item.owner,
                    name: item.name,
                    quality: item.quality,
                    level: item.level,
                    price: item.scrapPrice,
                    shop: item.shop,
                    image_url: item.getImageUrl()
                });
            }
            attributes = [];
        }
        if (((i + 1) === result.length) || result[i + 1].trade_id !== tradeID) {
            trades.push({
                trade_id: r.trade_id,
                last_update_date: r.trade_last_update_date,
                partner: {
                    steamid: r.partner_steamid,
                    name: r.partner_name,
                    avatar: r.partner_avatar,
                    wallet: r.partner_wallet
                },
                bot: {
                    steamid: r.bot_steamid,
                    name: r.bot_name,
                    avatar: r.bot_avatar
                },
                status: r.status,
                status_info: r.status_info,
                trade_type: r.trade_type,
                forced_balance: r.forced_balance,
                items: items
            });
            items = [];
        }
    }
    return trades;
};

LastTrades.QUERIES = {
    getTrades: function () {
        return "SELECT "
            + "trades.id as trade_id,"
            + "trades.last_update_date as trade_last_update_date,"
            + "trades.steamid as partner_steamid,"
            + "partner.name as partner_name,"
            + "partner.avatar as partner_avatar,"
            + "partner.wallet as partner_wallet,"
            + "trades.bot_steamid,"
            + "bot.name as bot_name,"
            + "bot.avatar as bot_avatar,"
            + "trades.status,"
            + "trades.status_info,"
            + "trades.trade_type,"
            + "trades.forced_balance,"
            + "my_sfuminator.shop_trade_items.item_id,"
            + "my_sfuminator.shop_trade_items.scrapPrice,"
            + "my_sfuminator.shop_trade_items.shop_type,"
            + "my_sfuminator_items.items.owner,"
            + "my_sfuminator_items.items.original_id,"
            + "my_sfuminator_items.items.defindex,"
            + "my_sfuminator_items.items.level,"
            + "my_sfuminator_items.items.quantity,"
            + "my_sfuminator_items.items.origin,"
            + "my_sfuminator_items.items.flag_cannot_craft,"
            + "my_sfuminator_items.items.flag_cannot_trade,"
            + "my_sfuminator_items.items.quality,"
            + "my_sfuminator_items.attributes.defindex as attr_defindex,"
            + "my_sfuminator_items.attributes.value,"
            + "my_sfuminator_items.attributes.float_value,"
            + "my_sfuminator_items.attributes.steamid as attr_steamid "
            + "FROM "
            + "("
            + "SELECT "
            + "* "
            + "FROM "
            + "my_sfuminator.shop_trades WHERE my_sfuminator.shop_trades.status_info='accepted' "
            + "ORDER BY "
            + "my_sfuminator.shop_trades.id DESC LIMIT 100"
            + ") "
            + "as trades "
            + "JOIN "
            + "my_sfuminator.users partner "
            + "ON partner.steam_id = trades.steamid "
            + "JOIN "
            + "my_sfuminator.users bot "
            + "ON bot.steam_id = trades.bot_steamid "
            + "LEFT JOIN "
            + "my_sfuminator.shop_trade_items "
            + "ON my_sfuminator.shop_trade_items.trade_id = trades.id "
            + "LEFT JOIN "
            + "my_sfuminator_items.items "
            + "ON my_sfuminator.shop_trade_items.item_id = my_sfuminator_items.items.id "
            + "LEFT JOIN "
            + "my_sfuminator_items.attributes "
            + "ON my_sfuminator.shop_trade_items.item_id = my_sfuminator_items.attributes.id"
    }
};