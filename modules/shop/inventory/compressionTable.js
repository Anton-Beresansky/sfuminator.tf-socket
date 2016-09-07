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
        shop: "h"
    };
    this.items_group = "i";
    this.unique_identifiers = {
        id: "x",
        level: "y",
        paint_color: "z",
        reserved_to: "w",
        price: "m",
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
            paint: 4
        },
        image_url: function (shopItem) {
            if (shopItem.getItem().isPaint()) {
                return shopItem.getItem().image_url;
            } else {
                return shopItem.getItem().image_url.slice(45);
            }
        },
        image_url_large: function (shopItem) {
            if (shopItem.getItem().isPaint()) {
                return shopItem.getItem().image_url_large;
            } else {
                return shopItem.getItem().image_url_large.slice(45);
            }
        }
    }
}