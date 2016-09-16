module.exports = SteamTradeError;

/**
 * @param error
 * @constructor
 */
function SteamTradeError(error) {
    this.original_error = error.toString();
    this._notAvailableForTrade = "is not available to trade. More information will be shown";
    this._uselessMessagePart = "Error: ";

    this.errorCode = this._parseCode();
    this.message = this._parseMessage();
}

SteamTradeError.ERROR = {
    SERVICE_UNAVAILABLE: 20,
    ITEMS_REVOKED: 26,
    WRONG_ITEMS: 8,
    TIMEOUT: 16,
    LOGGED_IN_SOMEWHERE_ELSE: 6,
    MAX_SENT_OFFER_LIMIT_REACHED: 50,
    BACKPACK_FULL: 15,
    NO_WEB_LOGIN: 403,
    SESSION_EXPIRED: 401,
    NOT_AVAILABLE_FOR_TRADE: 1001,
    COULD_NOT_ACT_ON_CONFIRMATION: 1002,
    NO_CONFIRMATION_AVAILABLE: 1003
};

SteamTradeError.prototype.hasCode = function () {
    return !isNaN(this.errorCode);
};

SteamTradeError.prototype.getCode = function () {
    return this.errorCode;
};

SteamTradeError.prototype.getMessage = function () {
    return this.message;
};

SteamTradeError.prototype._parseCode = function () {
    var matching = this.original_error.match(/\d+/);
    if (matching) {
        return parseInt(matching[0]);
    } else {
        return this._makeCode();
    }
};

SteamTradeError.prototype._makeCode = function () {
    if (this.original_error.match(this._notAvailableForTrade)) {
        return SteamTradeError.ERROR.NOT_AVAILABLE_FOR_TRADE;
    }
};

SteamTradeError.prototype._parseMessage = function () {
    if (this.original_error.slice(0, this._uselessMessagePart.length) === this._uselessMessagePart) {
        return this.original_error.slice(this._uselessMessagePart.length, this.original_error.length);
    }
    return this.original_error;
};

SteamTradeError.prototype.valueOf = function () {
    return this.errorCode;
};