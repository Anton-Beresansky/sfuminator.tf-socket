module.exports = SteamTradeError;

/**
 * @param error
 * @constructor
 */
function SteamTradeError(error) {
    this.original_error = error.toString();
    this._codedErrorMessage = "Error: There was an error sending your trade offer.  Please try again later.";
    this._uselessMessagePart = "Error: ";

    this.errorCode = this._parseCode();
    this.message = this._parseMessage();
}

SteamTradeError.SteamError26 = 26;
SteamTradeError.SteamError8 = 8;
SteamTradeError.SteamError6 = 6; //LoggedInSomewhereElse

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
    if (this.original_error.slice(0, this._codedErrorMessage.length) === this._codedErrorMessage) {
        var matching = this.original_error.match(/\d+/);
        return parseInt(matching ? matching[0] : 0);
    }
};

SteamTradeError.prototype._parseMessage = function () {
    if (this._codedErrorMessage.slice(0, this._uselessMessagePart.length) === this._uselessMessagePart) {
        return this.original_error.slice(this._uselessMessagePart.length, this._codedErrorMessage.length);
    }
    return this.original_error;
};

SteamTradeError.prototype.valueOf = function () {
    return this.errorCode;
};