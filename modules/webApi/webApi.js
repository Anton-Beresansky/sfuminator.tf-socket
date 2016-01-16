module.exports = WebApi;

var BackpacksAPI = requrie("./backpacksApi.js");
var TF2API = require("./tf2Api.js");

/**
 * @constructor
 */
function WebApi(db_items, steamApi) {
    this.db_items = db_items;
    this.steamApi = steamApi;

    this.tf2 = new TF2API(this.db_items, this.steamApi, "***REMOVED***", {debug: true});
    this.backpacks = new BackpacksAPI(this.db_items, this.steamApi, this.tf2, {debug: true});
}