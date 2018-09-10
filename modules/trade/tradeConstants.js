// Sfuminator.tf | Collection of trading Constants and Identifiers

module.exports = new TradeConstants();

/**
 * @class TradeConstants
 * @constructor
 */
function TradeConstants() {
    /**
     * Legend
     * - Trade Offer => Normal trade offer with no trade token
     * - Manual Trade => Trade via manual request
     * @type {{TRADE_OFFER: string, MANUAL_TRADE: string}}
     */
    this.mode = {
        TRADE_OFFER: "trade_offer",
        MANUAL_TRADE: "manual"
    };
    /**
     * Legend:
     * - Hold:[info] => Trade is being processed
     * - Active => Trade is being made
     * - Sent:[info] => Trade has been sent
     * - Accepted => Trade has been accepted by partner
     * - Declined => Trade has been declined by partner
     * - Closed:[info] => Trade ended for other causes
     * @type {{HOLD: string, ACTIVE: string, SENT: string, CLOSED: string, NO_FRIEND: string}}
     */
    this.status = {
        HOLD: "hold",
        ACTIVE: "active",
        SENT: "sent",
        CLOSED: "closed",
        NO_FRIEND: "noFriend"
    };
    /**
     * Legend:
     * - Hold.noFriend => Partner has to accept friend request
     * - Sent.[String] => Steam trade id of this Shop Trade
     * - Closed.cancelled => Trade has been cancelled
     * - Closed.error => Most likely steam errored
     * - Closed.afk => Partner didn't accept in time
     * @type {{active: {TRANSFERRING: string, MAKING: string}, closed: {ACCEPTED: string, CANCELLED: string, DECLINED: string, ERROR: string, AFK: string}}}
     */
    this.statusInfo = {
        closed: {
            ACCEPTED: "accepted",
            CANCELLED: "cancelled",
            DECLINED: "declined",
            ERROR: "error",
            AFK: "afk"
        },
        active: {
            TRANSFERRING: "transferring",
            MAKING: "making"
        }
    };
}