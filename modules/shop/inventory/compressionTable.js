module.exports = new CompressionLookup();

/**
 * All the properties are optional and compressed only if they exist
 * @constructor
 * @returns {CompressionLookup}
 */
function CompressionLookup() {
    this.schema = {
        defindex: "a",
        name: "b",
        image_url: "c",
        image_url_large: "d",
        used_by_classes: "e",
        quality: "f",
        particle: "g",
        decorated_grade: "gg",
        shop: "h"
    };
    this.items_group = "i";
    this.unique_identifiers = {
        id: "x",
        level: "y",
        paint_color: "z",
        reserved_to: "w",
        price: "m",
        mine_price: "mm",
        max_price: "MM",
        real_id: "n"
    };
    this.values = {
        currency: {
            usd: 0,
            metal: 1,
            keys: 2,
            earbuds: 3
        },
        shop: {
            mine: 0,
            hats: 1,
            strange: 2,
            taunt: 3,
            other: 4,
            market: 5,
            marketer: 6
        },
        image_url: function (shopItem) {
            if (shopItem.getItem().isPaint()) {
                return shopItem.getItem().getImageUrl();
            } else {
                return shopItem.getItem().getImageUrl().slice(45);
            }
        },
        image_url_large: function (shopItem) {
            if (shopItem.getItem().isPaint()) {
                return shopItem.getItem().getImageUrl(true);
            } else {
                return shopItem.getItem().getImageUrl(true).slice(45);
            }
        }
    }
}