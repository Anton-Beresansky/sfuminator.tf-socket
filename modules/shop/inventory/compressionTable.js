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
        shop: "h"
    };
    this.items_group = "i";
    this.unique_identifiers = {
        id: "x",
        level: "y",
        paint_color: "z",
        reserved_to: "w",
        relative_price: "m",
        currency: "n",
        real_id: "o"
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
            strange: 2
        },
        image_url: function (url) {
            return url.slice(45);
        },
        image_url_large: function (url) {
            return url.slice(45);
        }
    }
}