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
        shop: "h"
    };
    this.items_group = "i";
    this.unique_identifiers = {
        id: "x",
        level: "y",
        quality: "z",
        paint_color: "v",
        reserved_to: "w",
        relative_price: "f",
        currency: "g"
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
            hats: 1
        },
        image_url: function (url) {
            return url.slice(45);
        },
        image_url_large: function (url) {
            return url.slice(45);
        }
    }
}