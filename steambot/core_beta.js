var SOFTWARE_VERSION = "v4 beta";
var SteamTrade = require('steam-trade'); // change to 'steam-trade' if not running from the same directory
var steamTrade = new SteamTrade();
var SteamTradeOffers = require('steam-tradeoffers');
var tradeOffers = new SteamTradeOffers();
var fs = require('fs');
var Steam = require('steam');
var steam = new Steam.SteamClient();
var TeamFortress2 = require('./teamFortress.js');
var tf2 = new TeamFortress2(steam);
var Sfuminator = require("./sfuminator.js");
var sfr = new Sfuminator(tf2, steamTrade);
var api = require("../lib/api.js");
var browser = new api("steamcommunity.com");
var outpost = new api("www.tf2outpost.com");
var cheerio = require("cheerio");
var IncomingOffers = require("./incomingOffers.js");
var incomingOffers = new IncomingOffers(steam, tradeOffers, sfr);
sfr.on('debug', function (msg, level) {
    if (typeof level === "undefined") {
        level = 2;
    }
    debugmsg("\tsfr->" + msg, {level: level});
});
sfr.on('message', function (msg) {
    debugmsg(msg);
});
sfr.on('error', function (e, error_code) {
    var console_text = "ERROR #" + error_code + ": " + e;
    debugmsg(console_text);
    sfr.addToLogs(console_text, "errors");
});
///////////////////////////////////////////////////////////////////////////////
STEAMBOT_DIRECTORY = './'; // windows directory
ACCOUNTS = {
    axe_fish: {username: "axe_fish", password: "emvalerio?", steamid: "76561198045065602"},
    sfumin: {username: "sfumin", password: "Error36ismadeup", steamid: "76561198189662807"},
    sfuminator: {username: "sfuminator", password: "3-.skate.-3", steamid: "76561198145778912"},
    sfuminator1: {username: "sfuminator1", password: "noMaybeNotYet5", steamid: "76561198195936315", steamApiKey: "EFF763E361AE251C6A3A79FE9DA23F17"},
    sfuminator2: {username: "sfuminator2", password: "wipeMyAssWithDogs1", steamid: "76561198228007284"},
    sfuminator3: {username: "sfuminator3", password: "theStadiumIsShort", steamid: "76561198195909649"},
    sfuminator4: {username: "sfuminator4", password: "fuckYourTightThumb", steamid: "76561198195946391"}
};
myAccount = ACCOUNTS.sfuminator1;


username = myAccount.username;
password = myAccount.password;
myself = myAccount.steamid;
steamguard = "";
moderators = {
    "76561198046649970": {
        steamid: "76561198046649970",
        permission: 0
    },
    "***REMOVED***": {
        steamid: "***REMOVED***",
        permission: 0
    }
};
firstLogin = true;
webTradeEligibilityCookie = "webTradeEligibility=%7B%22allowed%22%3A0%2C%22reason%22%3A2048%2C%22allowed_at_time%22%3A1428933009%2C%22steamguard_required_days%22%3A15%2C%22sales_this_year%22%3A0%2C%22max_sales_per_year%22%3A200%2C%22forms_requested%22%3A0%2C%22new_device_cooldown_days%22%3A7%7D";
///////////////////////////////////////////////////////////////////////////////
// if we've saved a server list, use it
if (fs.existsSync('servers')) {
    Steam.servers = JSON.parse(fs.readFileSync('servers'));
}
try {
    sentryhash = require('fs').readFileSync(STEAMBOT_DIRECTORY + '/sentryfile_' + username);
    steam.logOn({
        accountName: username,
        password: password,
        shaSentryfile: sentryhash
    });
} catch (e) {
    debugmsg("WARNING: Could not open sentryfile, will generate a new one", {level: 1});
    steam.logOn({
        accountName: username,
        password: password,
        authCode: steamguard
    });
}
steam.on('loggedOn', function (result) {
    debugmsg('Logged in!', {level: 1});
    steam.setPersonaState(Steam.EPersonaState.Online);
    sfr.logging = false;
});
steam.on("loogedOff", function (error) {
    debugmsg("Logged OFF", {level: 1});
    sfr.logged = false;
});
steam.on("error", function (e) {
    debugmsg("ERROR: " + e, {level: 1});
});
steam.on("debug", function (d) {
    console.log(d);
});
steam.on('sentry', function (sentryHash) {
    require('fs').writeFile(STEAMBOT_DIRECTORY + '/sentryfile_' + username, sentryHash, function (err) {
        if (err) {
            debugmsg("ERROR: " + err);
        } else {
            debugmsg('Saved sentry file hash as "sentryfile_' + username + '"', {level: 2});
        }
    });
});
steam.on('webSessionID', function (sessionID) {
    debugmsg("Got new webSessionID", {level: 2});
    steamTrade.sessionID = sessionID;
    steam.webLogOn(function (cookies) {
        debugmsg("Got cookies: " + JSON.stringify(cookies) + ", configuring trade...", {level: 2});
        steamTrade.setCookie(cookies[0]);
        steamTrade.setCookie(cookies[1]);
        steamTrade.setCookie(cookies[2]);
        browser.setCookie(cookies);
        browser.setCookie(webTradeEligibilityCookie);
        tradeOffers.setup({sessionID: sessionID, webCookie: cookies}, function () {
            debugmsg("Alright, logged on steam for trade!", {level: 1});
            if (firstLogin) {
                firstLogin = false;
                setTimeout(keepLoginAlive, 10000);
                botStartUp();
            } else {
                sfr.updateCurrency();
            }
        });
    });
    if (sfr.in_trade) {
        steamTrade.open(steamTrade.tradePartnerSteamID);
    }
});
steam.on('relationships', function () {
    for (var friend in steam.friends) {
        if (steam.friends[friend] === Steam.EFriendRelationship.PendingInvitee) {
            steam.addFriend(friend);
            debugmsg('SteamID ' + friend + ' accepted!', {level: 1});
        }
    }
});
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
sfr.busy = true;
sfr.init(true);
debugmsg("Going busy untill login token has been received...");
function botStartUp() {
    debugmsg("Loading inventory...");
    steamTrade.loadInventory(440, 2, function (inv) {
        sfr.injectBackpack(inv);
        sfr.busy = false;
        sfr.logged = true;
        checkTradeOffersChanges();
        cleanUpSentTradeOffers();
    });
}

sfr.on("initComplete", function () {
    debugmsg("Everything successifully initialized", {level: 1});
    debugmsg(" --- SFUMINATOR BOT " + SOFTWARE_VERSION + " ---");
    debugmsg("Checking for interrupted trade offers...");
    for (var x in sfr.tradeOffers) {
        var thisOffer = sfr.tradeOffers[x];
        if (thisOffer.status === "active" || thisOffer.status === "hold") {
            sfr.tradeOfferStep(thisOffer, thisOffer.status);
            debugmsg("Fixed (active/hold) trade offer with " + thisOffer.steamid);
        } else if (thisOffer.status === "sent") {
            sfr.appendTradeOffer(thisOffer.steamid, thisOffer.additional);
            debugmsg("Fixed (sent) trade offer with " + thisOffer.steamid);
        }
    }

    debugmsg("Checking for pending friend invites");
    for (var friend in steam.friends) {
        if (steam.friends[friend] === Steam.EFriendRelationship.PendingInvitee) {
            steam.addFriend(friend);
            debugmsg('SteamID ' + friend + ' accepted!', {level: 1});
        }
    }
    setTimeout(function () {
        debugmsg("Checking friend list");
        while (sfr.removeFriend()) {

        }
    }, 5000);
});
sfr.on("queue", function (queue) {
    debugmsg("Queue changed... there are now " + queue.length + " people in the queue");
    for (var x in queue) {
        if (!sfr.users.hasOwnProperty(queue[x].steamid)) { // New user
            sfr.updateUser(queue[x].steamid);
        }
        if (!sfr.friends.hasOwnProperty(queue[x].steamid)) {
            steam.addFriend(queue[x].steamid);
        }
    }
});
sfr.on("contactNextPerson", function (nextQueuePerson) {
    if (!sfr.busy) {
        sfr.busy = true;
        sfr.contacting = true;
        if (sfr.users[nextQueuePerson.steamid].metal_reservation === true) {
            sfr.contacting = false;
            debugmsg("Got request contactNextPerson, will contact: " + nextQueuePerson.steamid + " (" + sfr.users[nextQueuePerson.steamid].personaname + ")");
            if (!sfr.friends.hasOwnProperty(nextQueuePerson.steamid)) {
                sfr.informSocket("friend_added");
            }
            sfr.trackEvent(nextQueuePerson.steamid);
            sfr.startAfkCheck(nextQueuePerson.steamid);
            steam.addFriend(nextQueuePerson.steamid);
        } else {
            debugmsg("Got request contactNextPerson, metal has to be reserved, holdin the request");
        }
    }
});
sfr.on("metalReservation", function (steamid) {
    if (steamid === sfr.firstInQueue.steamid && sfr.contacting) {
        debugmsg("Got metalReservation, going to contactNextPerson");
        sfr.busy = false;
        sfr.emit("contactNextPerson", sfr.firstInQueue);
    }
});
sfr.on("tradeNextPerson", function (steamid, firstInvite) { // sfr.thisTrade OBJECT IS CREATED RIGHT BEFORE TRADE NEXT PERSON IS FIRED
    if (typeof firstInvite === "undefined") {
        firstInvite = false;
    }
    debugmsg("Starting trade procedure with: " + steamid + " (" + sfr.users[steamid].personaname + ")");
    sfr.informSocket("invited_to_trade");
    if (sfr.startTradeProcedure(steamid)) {
        if (firstInvite) {
            sfr.message(steamid, "trade_hello");
        }
        startTrade(steamid);
    }
});
sfr.on("cancelTrade", function () {
    steamTrade.cancel();
    sfr.in_trade = false;
});
sfr.on("addFriend", function (steamid) {
    steam.addFriend(steamid);
});
sfr.on("removeFriend", function (steamid) {
    debugmsg("Removing friend: " + steamid);
    steam.removeFriend(steamid);
});
sfr.on("steamMessage", function (obj) {
    console.log("##Following line is for debug purpose, very annoying error##");
    console.log(JSON.stringify(obj));
    if (obj.steamid) {
        steam.sendMessage(obj.steamid, obj.message);
    } else {
        console.log("##ERROR COUGHT - EMPTY STEAMID GIVEN, WON'T SEND MESSAGE##");
    }
});
sfr.on("sendTradeOffer", function (offer) {
    debugmsg("Making trade offer to " + offer.partnerSteamId);
    tradeOffers.makeOffer(offer, function (error, result) {
        if (typeof result !== "undefined") {
            sfr.appendTradeOffer(offer.partnerSteamId, result.tradeofferid);
        } else {
            debugmsg("Error sending trade offer to " + offer.partnerSteamId + " (relation: " + steam.friends[offer.partnerId] + "): " + error);
            if (offer.hasOwnProperty("makeAttempts")) {
                offer.makeAttempts += 1;
            } else {
                offer.makeAttempts = 1;
            }
            if (offer.makeAttempts > 4) {
                sfr.endTradeOfferSession(offer.partnerSteamId);
                steam.sendMessage(offer.partnerSteamId, "There was an error when making the offer, cancelling you trade... if this is your first attempt maybe you can try again, if not retry later");
            } else {
                if (offer.makeAttempts === 2) {
                    webRelog(function () {
                        retryTradeOffer(offer);
                    });
                } else {
                    retryTradeOffer(offer);
                }
            }
        }
    });
});
sfr.on("postProfileComment", function (steamid, message) {
    if (steamTrade.hasOwnProperty("sessionID") && steamTrade.sessionID) {
        var sessionID = getSessionID();
        var options = {
            comment: message,
            count: 6,
            sessionid: sessionID
        };
        browser.post("http://steamcommunity.com/comment/Profile/post/" + steamid + "/-1/", options, function (result) {
            if (!result.hasOwnProperty("success") || result.success !== true) {
                debugmsg("ERROR: received bad answer when posting profile comment (sessionID: " + sessionID + ") - " +
                        ((result.hasOwnProperty("success")) ? ("Success: " + result.success) : ("Bad response: " + result)));
                onPostCommentError(function (retry) {
                    if (retry) {
                        sfr.emit("postProfileComment", steamid, message);
                    } else {
                        debugmsg("ERROR: too many attempts on posting comment, stopping");
                        sfr.raw_message(steamid, "There was a problem when leaving the comment, I guess we will try this later :( sorry");
                        if (message.slice(0, 4) === "+rep") {
                            delete sfr.users[steamid].behavior.repped;
                        }
                    }
                });
            } else {
                onPostCommentSuccess(sessionID);
                debugmsg("Success, postProfileComment accomplished");
            }
        });
    } else {
        debugmsg("ERROR: Couldn't post profile comment: no sessionID found");
    }
});
function onPostCommentSuccess(sessionID) {
    browser.validSessionID = sessionID;
    browser.postProfileCommentErrors = 0;
}
function onPostCommentError(retryComment) {
    if (browser.hasOwnProperty("postProfileCommentErrors")) {
        browser.postProfileCommentErrors += 1;
    } else {
        browser.postProfileCommentErrors = 1;
    }
    if (browser.postProfileCommentErrors === 3) {
        webRelog();
    }
    if (browser.postProfileCommentErrors < browser.steamSessionIDs.length) {
        setTimeout(function () {
            retryComment(true);
        }, 1000);
    } else {
        setTimeout(function () {
            retryComment(false);
        }, 100);
        browser.postProfileCommentErrors = 0;
    }
}
function getSessionID() {
    if (!browser.hasOwnProperty("steamSessionIDs")) {
        browser.steamSessionIDs = [];
    }
    if (!browser.hasOwnProperty("postProfileCommentErrors")) {
        browser.postProfileCommentErrors = 0;
    }
    var sessionIDfound = false;
    for (var x in browser.steamSessionIDs) {
        if (browser.steamSessionIDs[x] === steamTrade.sessionID) {
            sessionIDfound = true;
        }
    }
    if (!sessionIDfound) {
        browser.steamSessionIDs.push(steamTrade.sessionID);
        debugmsg("Stored new sessionID");
    }
    if (browser.postProfileCommentErrors === 0 && browser.hasOwnProperty("validSessionID")) {
        return browser.validSessionID;
    } else {
        var sessionIDindex = browser.steamSessionIDs.length - browser.postProfileCommentErrors;
        if (sessionIDindex < 0) {
            sessionIDindex = 0;
        }
        if (sessionIDindex === browser.steamSessionIDs.length) {
            sessionIDindex -= 1;
        }
        return browser.steamSessionIDs[sessionIDindex];
    }
}
function retryTradeOffer(offer) {
    debugmsg("Trying again...");
    setTimeout(function () {
        sfr.emit("sendTradeOffer", offer);
    }, 1000 * offer.makeAttempts);
}

sfr.on("cancelTradeOffer", function (tradeofferid) {
    tradeOffers.cancelOffer({tradeOfferId: tradeofferid});
});
function steam_relog() {
    sfr.logging = true;
    steam.logOn({
        accountName: username,
        password: password,
        shaSentryfile: sentryhash
    });
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

function keepLoginAlive() { // Fires every 15 minutes
    sfr.timeout.keepLoginAlive = setTimeout(function () {
        debugmsg("keepLoginAlive fired", {level: 5});
        if (sfr.tradesInProgress() === 0) {
            steam_relog();
        } else {
            debugmsg("There are some trades in progress, procrastinating relog");
        }
        keepLoginAlive();
    }, (1000 * 60 * 15));
}
function startTrade(steamid) {
    sfr.onTradeStart(function () {
        debugmsg("Inviting trade: " + steamid);
        steam.trade(steamid);
    });
}
steam.on('friend', function (steamid, relation) {//Fires on friend invite from me or from someone else
    console.log("##Following lines for debug purpose, friends##");
    console.log("FRIEND EVENT Steamid: " + steamid + " - Relation: " + relation);
    if (relation === Steam.EFriendRelationship.PendingInvitee || relation === 2) {//Happen when the bot has a pending invite
        steam.addFriend(steamid);
        debugmsg("I accepted " + steamid + " friend invite.");
        sfr.newFriend(steamid);
    }
    if (relation === Steam.EFriendRelationship.Friend) {//Basically after bot invite if the other accepts/already friend
//Happen when someone else accept the friend invite and also if already friend
        debugmsg(steamid + " has accepted my friend request");
        sfr.trackEvent(steamid);
        sfr.users[steamid].pendingFriendRequest = false;
        steam.friends[steamid] = 3;
        sfr.newFriend(steamid);
    }
});
steam.on("message", function (who, message) {
    sfr.trackEvent(who);
    if (message !== "") {
        sendToPassives(message, who);
        if (isMod(who)) {
            if (message[0] === "#") {
                bot_cmd(message.slice(1), who);
            } else if (isChatting(who)) {
                sendChatMessage(message, who);
            } else {
                sfr.answer(who, message);
            }
        } else {
            if (isChatting(who)) {
                sendChatMessage(message, who);
            } else {
                sfr.answer(who, message);
            }
            if (message[0] === "#") {
                bot_cmd(message.slice(1), who);
            }
        }
    }
});
//////////////////////////////////////////////////////////////////STEAM TRADE
var inventory;
var client;
var _sentOffers = null;
var _receivedOffers = null;
function checkTradeOffersChanges() {
    setInterval(function () {
        tradeOffersChanged(
                function (result) {
                    if (result) {
                        onSentTradeOffersChange(result);
                    }
                },
                function (result) {
                    if (result) {
                        onReceivedTradeOffersChange(result);
                    }
                });
    }, 1500);
}
function tradeOffersChanged(onSentChange, onReceivedChange) {
    tradeOffers.getOffers({get_sent_offers: 1, get_received_offers: 1, active_only: 1}, function (error, body) {
        if (body && body.hasOwnProperty("response") && body.response.hasOwnProperty("trade_offers_sent")) {
            body.response.trade_offers_sent.forEach(function (offer) {
                if (!_sentOffers) {
                    _sentOffers = JSON.parse(JSON.stringify(body.response.trade_offers_sent));
                    onSentChange(false);
                    return;
                } else {
                    var found = false;
                    for (var x in _sentOffers) {
                        if (_sentOffers[x].tradeofferid === offer.tradeofferid) {
                            found = true;
                            if (_sentOffers[x].trade_offer_state !== offer.trade_offer_state) {
                                _sentOffers = JSON.parse(JSON.stringify(body.response.trade_offers_sent));
                                onSentChange(body);
                                return;
                            }
                            break;
                        }
                    }
                    if (!found) {
                        _sentOffers = JSON.parse(JSON.stringify(body.response.trade_offers_sent));
                        onSentChange(body);
                        return;
                    }
                }
            });
        } else {
            onSentChange(false);
        }
        if (body && body.hasOwnProperty("response") && body.response.hasOwnProperty("trade_offers_received")) {
            body.response.trade_offers_received.forEach(function (offer) {
                if (_receivedOffers === null) {
                    _receivedOffers = JSON.parse(JSON.stringify(body.response.trade_offers_received));
                    onReceivedChange(false);
                    return;
                } else {
                    var found = false;
                    for (var x in _receivedOffers) {
                        if (_receivedOffers[x].tradeofferid === offer.tradeofferid) {
                            found = true;
                            if (_receivedOffers[x].trade_offer_state !== offer.trade_offer_state) {
                                _receivedOffers = JSON.parse(JSON.stringify(body.response.trade_offers_received));
                                onReceivedChange(body);
                                return;
                            }
                            break;
                        }
                    }
                    if (!found) {
                        _receivedOffers = JSON.parse(JSON.stringify(body.response.trade_offers_received));
                        onReceivedChange(body);
                        return;
                    }
                }
            });
        } else {
            onReceivedChange(false);
        }
    });
}
function onSentTradeOffersChange(body) {
    debugmsg("Sent trade offers changed...");
    if (body && body.hasOwnProperty("response") && body.response.hasOwnProperty("trade_offers_sent")) {
        body.response.trade_offers_sent.forEach(function (offer) {
            if (sfr.sentTradeOffers.hasOwnProperty(offer.steamid_other) && (sfr.sentTradeOffers[offer.steamid_other].tradeOfferID === offer.tradeofferid)) {
                offer.steamid = offer.steamid_other;
                if ((offer.trade_offer_state === 3) || (offer.trade_offer_state === 7)) {
                    debugmsg(offer.steamid + " has " + (((offer.trade_offer_state - 3) / 4) ? "declined" : "accepted") + " the offer (" + offer.tradeofferid + ")");
                    if (sfr.tradeOffers.hasOwnProperty(offer.steamid)) {
                        if (offer.trade_offer_state === 3) {
                            sfr.tradeOfferStep(offer, "accepted");
                        }
                        if (offer.trade_offer_state === 7) {
                            sfr.tradeOfferStep(offer, "declined");
                        }
                    } else {
                        debugmsg("WARNING: This wasn't a trade done from the site (" + offer.steamid + ")");
                    }
                } else if ((sfr.sentTradeOffers[offer.steamid_other].when + 600) < time()) { // Secure decline after 10 minutes of inactivity
                    sfr.endTradeOfferSession(offer.steamid_other, "bad_trade_state");
                } else {
                    checkIfSteamFailed(offer, function (result) {
                        if (result === true) {
                            delete sfr.sentTradeOffers[offer.steamid]; //Forcing sentTradeOffers removal to avoid double error report
                            debugmsg("onTradeOffersChange @" + offer.steamid + ": " + sfr.sentTradeOffers.hasOwnProperty(offer.steamid) + " -> " + sfr.sentTradeOffers[offer.steamid]);
                            debugmsg("Steam failed recording the trade, recovering info and saving the trade @" + offer.steamid);
                            sfr.tradeOfferStep(offer, "accepted");
                        }
                    });
                }
            }
        });
    }
}
function onReceivedTradeOffersChange(body) {
    debugmsg("Received trade offers changed...");
    if (body && body.hasOwnProperty("response") && body.response.hasOwnProperty("trade_offers_received")) {
        body.response.trade_offers_received.forEach(function (offer) {
            offer.steamid = offer.steamid_other;
            if (offer.steamid === "76561198145778912" && offer.message === "ANTIERROR25_STEAMISBAD" && offer.trade_offer_state === 2) {
                debugmsg("Recognised antiError25, declining");
                tradeOffers.declineOffer({tradeOfferId: offer.tradeofferid});
            } else {
                incomingOffers.onOfferChange(offer);
            }
        });
    }
    browser.loadPage("steamcommunity.com/id/axefish/tradeoffers/", function (body) {
        try {
            var browser_tradeOffers = parseTradeOffersStatus(body);
            debugmsg("Trade offers status (browser):\n\t" + browser_tradeOffers);
        } catch (e) {
            debugmsg("ERROR when processing antiError25: " + e);
        }
    });
}

function parseTradeOffersStatus(body) {
    $ = cheerio.load(body);
    var innerText = "--- ";
    $(".rightcol_controls_content > .right_controls_large_block").each(function () {
        innerText += $(this).text() + " --- ";
    });
    return innerText;
}

function checkIfSteamFailed(offer, callback) {
    var steamid = offer.steamid;
    debugmsg("CheckIfSteamFaield @" + offer.steamid + ": " + sfr.sentTradeOffers.hasOwnProperty(steamid) + " -> " + sfr.sentTradeOffers[steamid]);
    if (sfr.sentTradeOffers.hasOwnProperty(steamid) && sfr.tradeOffers.hasOwnProperty(steamid) && (sfr.tradeOffers[steamid].additional !== "accepted")) {
        sfr.loadBackpack(function () {
            var myItems = offer.items_to_give;
            var steamFailed = false;
            if (sfr.sentTradeOffers.hasOwnProperty(steamid)) {
                for (var x in myItems) {
                    if (!sfr.backpack.items.hasOwnProperty(myItems[x].assetid)) {
                        steamFailed = true;
                    }
                }
            }
            callback(steamFailed);
        });
    } else {
        callback(false);
    }
}
function cleanUpSentTradeOffers(force) {
    debugmsg("Cleaning sent trade offers");
    tradeOffers.getOffers({get_sent_offers: 1, active_only: 1}, function (error, body) {
        if (body && body.hasOwnProperty("response") && body.response.hasOwnProperty("trade_offers_sent")) {
            body.response.trade_offers_sent.forEach(function (offer) {
                if (offer.trade_offer_state !== 2 || force) {
                    tradeOffers.cancelOffer({tradeOfferId: offer.tradeofferid});
                }
            });
        }
    });
}

steam.on('tradeProposed', function (tradeID, otherClient) {
    sfr.trackEvent(otherClient);
    debugmsg(otherClient + ' proposed a trade');
    var steamid = otherClient;
    if (steamid === sfr.firstInQueue.steamid) {
        steam.respondToTrade(tradeID, true);
    } else {
        steam.respondToTrade(tradeID, false);
        sfr.message(otherClient, "who_are_you");
        sfr.message(otherClient, "you_trade");
    }
});
steam.on('sessionStart', function (otherClient) {
    sfr.trackEvent(otherClient);
    sfr.in_trade = true;
    client = otherClient;
    debugmsg('trading ' + sfr.users[client].personaname);
    if (otherClient === sfr.firstInQueue.steamid) {
        sfr.message(otherClient, "trade_session_start");
    }
    steamTrade.loadInventory(440, 2, function (myInv) {
        if (myInv) {
            sfr.injectBackpack(myInv);
            debugmsg("Starting trade procedure...");
            steamTrade.open(otherClient, function () {
                if (otherClient !== sfr.firstInQueue.steamid) {
                    sfr.emit("cancelTrade");
                    debugmsg("Cancelling trade, user is no more first in the queue");
                    return;
                }
                sfr.informSocket("in_trade");
                debugmsg(textize_trade(sfr.thisTrade));
                secureAddItem(sfr.thisTrade.myItems);
            });
        } else {
            debugmsg("WHATAFACK?! My trade inventory is empty!?!?!?");
            sfr.message(otherClient, "relog");
            setTimeout(function () {
                steam_relog();
            }, 1500);
        }
    });
});
sfr.on("changeMetal", function (items) {
    debugmsg("Change metal request...");
    if (items.toAdd.length > 0) {
        secureAddItem(items.toAdd, function () {
            sfr.thisTrade.metalChanging = sfr.thisTrade.metalToChange;
        });
    }
    if (items.toRemove.length > 0) {
        secureRemoveItem(items.toRemove, function () {
            sfr.thisTrade.metalChanging = sfr.thisTrade.metalToChange;
        });
    }
});
steamTrade.on('offerChanged', function (added, item) {
    sfr.trackEvent(sfr.thisTrade.partnerID);
    sfr.onTradeChange(added, item, steamTrade.themAssets);
    debugmsg('they ' + (added ? 'added ' : 'removed ') + item.name);
});
steamTrade.on('ready', function () {
    sfr.trackEvent(sfr.thisTrade.partnerID);
    debugmsg('He is readying');
    if (sfr.onTradeReady(steamTrade.themAssets)) {
        steamTrade.ready(function () {
            debugmsg("Confirming trade");
            steamTrade.confirm();
        });
    }
});
steamTrade.on('end', function (result) {
    //'complete', 'empty' (no items on either side), 'cancelled', 'timeout' or 'failed'
    sfr.trackEvent(sfr.thisTrade.partnerID);
    if (result === "pending") { //Mail stupid
        debugmsg("Pending result, waiting mail verification to be accepted");
        startHoldQueueProcedure(sfr.thisTrade);
        sfr.jumpToNextQueuePerson();
    } else {
        endTradeProcedure(result, sfr.thisTrade);
    }

});
function endTradeProcedure(result, thisTrade) {
    debugmsg('End trade ' + result);
    if (result === "timeout") {
        sfr.informSocket("trade_timeout");
    }
    if (result === "failed") {
        sfr.informSocket("trade_fail");
    }
    if (result === "cancelled" || result === "complete") {
        sfr.removeFirstInQueue();
    }
    if (result === "mailConfirmed") {
        result = "complete";
        var tradeSessionSteamid = thisTrade.partnerID;
    }
    if (result === "mailCancelled") {
        result = "cancelled";
        tradeSessionSteamid = thisTrade.partnerID;
    }
    sfr.manageTradeResult(result, thisTrade, function (trade_result) {
        if (trade_result === "cancelled" || trade_result === "complete" || trade_result === "too_many_attempts") {
            sfr.endTradeSession(tradeSessionSteamid); //Will dereserve metal etc etc, and will jump to next trade only if undefiend given
        }
        if (trade_result === "relog") {
            steam_relog();
        }
        if (trade_result === "timeout") {
            setTimeout(function () {
                sfr.emit("tradeNextPerson", sfr.firstInQueue.steamid);
            }, 1500);
        }
    });
}
function startHoldQueueProcedure(tradeInfo) {
    var steamid = tradeInfo.partnerID;
    sfr.emit("steamMessage", {steamid: steamid, message: "I'll keep the items for you another minute, waiting your mail confirmation."});
    sfr.pendingMailVerifications.push(tradeInfo.partnerID);
    sfr.lockPendingMailVerificationChanges();
    sfr.socket.queueHoldTrade(tradeInfo.partnerID, function () {
        sfr.unlockPendingMailVerificationChanges();
    });
    var myItems = tradeInfo.myItems;
    var mailCheck = setInterval(function () {
        _sentOffers.forEach(function (offer) {
            if (offer.steamid_other === steamid) {
                if (offer.trade_offer_state === 10) { //10 occurs on mail cancel
                    sfr.emit("debug", "queueHoldTrade: mail cancelled, trade with " + tradeInfo.partnerID + " has been cancelled");
                    endTradeProcedure("mailCancelled", tradeInfo);
                    clearInterval(mailCheck);
                }
            }
        });
        if (sfr.hasPendingMailVerification(steamid)) { //If is still pending...
            for (var i = 0; i < myItems.length; i += 1) {
                if (!sfr.backpack.items.hasOwnProperty(myItems[i].id)) {
                    sfr.emit("debug", "queueHoldTrade: spotted item inconsistency, trade with " + tradeInfo.partnerID + " has been accepted");
                    endTradeProcedure("mailConfirmed", tradeInfo);
                    clearInterval(mailCheck);
                    break;
                }
            }
        } else { //Trade is no more pending he stayed afk too much
            _sentOffers.forEach(function (offer) {
                if (offer.steamid_other === steamid) { //Find trade and cancel
                    tradeOffers.cancelOffer({tradeOfferId: offer.tradeofferid});
                }
            });
            clearInterval(mailCheck);
        }
    }, 1500);
}
function secureAddItem(itemsToAdd, callback) {
    setTimeout(function () {
        var addedItemCallbacks = 0;
        for (var x in itemsToAdd) {
            debugmsg("I'm adding: " + itemsToAdd[x].name + " (" + itemsToAdd[x].id + ") | non-standardized: " + itemsToAdd[x].non_standard_item.id);
            steamTrade.addItem(itemsToAdd[x].non_standard_item, function () {
                addedItemCallbacks += 1;
            });
        }
        setTimeout(function () {
            if (sfr.in_trade) {
                if (addedItemCallbacks < itemsToAdd.length) {
                    debugmsg("Added items don't correspond to the reserved ones, readding");
                    secureAddItem(itemsToAdd);
                } else {
                    debugmsg("All items have been added");
                    if (callback) {
                        callback(true);
                    }
                }
            }
        }, 10000);
    }, 500);
}
function secureRemoveItem(itemsToRemove, callback) {
    setTimeout(function () {
        var removedItemCallbacks = 0;
        for (var x in itemsToRemove) {
            debugmsg("I'm removing: " + itemsToRemove[x].name + "(" + itemsToRemove[x].id + ")");
            steamTrade.removeItem(itemsToRemove[x].non_standard_item, function () {
                removedItemCallbacks += 1;
            });
        }
        setTimeout(function () {
            if (sfr.in_trade) {
                if (removedItemCallbacks < itemsToRemove.length) {
                    debugmsg("Removed items don't correspond to the reserved ones, removing again");
                    secureRemoveItem(itemsToRemove);
                } else {
                    debugmsg("All items have been removed");
                    if (callback) {
                        callback(true);
                    }
                }
            }
        }, 5000);
    }, 500);
}
//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////

function bot_cmd(message, moderator_steamid) {
    var wordList = message.split(" ");
    var command = wordList[0];
    var additional = "";
    if (wordList.length > 1) {
        for (var x = 1; x < wordList.length; x += 1) {
            additional += wordList[x] + " ";
        }
        additional = additional.slice(0, additional.length - 1);
    }
    if (botCommands.hasOwnProperty(command) &&
            ((moderators.hasOwnProperty(moderator_steamid)) && (botCommands[command].permission >= moderators[moderator_steamid].permission) ||
                    (botCommands[command].permission === 3))) {
        var pass_additional = false;
        var pass_callback = false;
        if (botCommands[command].hasOwnProperty("callback") && botCommands[command].callback) {
            var callback_function = function (result) {
                if (result.hasOwnProperty("message")) {
                    tell(moderator_steamid, result.message);
                }
            };
            pass_callback = true;
        }
        if (botCommands[command].hasOwnProperty("additional") && botCommands[command].additional) {
            var pass_additional = true;
        }
        var result = {};
        if (pass_additional && pass_callback) {
            result = botCommands[command].method(moderator_steamid, additional, callback_function);
        } else if (pass_additional) {
            result = botCommands[command].method(moderator_steamid, additional);
        } else if (pass_callback) {
            result = botCommands[command].method(moderator_steamid, callback_function);
        } else {
            result = botCommands[command].method(moderator_steamid);
        }
        if (result.hasOwnProperty("message")) {
            tell(moderator_steamid, result.message);
        }
        saveBotCommand(getDateTime() + " " + moderator_steamid + " - " + message);
    } else {
        tell(moderator_steamid, "Unknown command");
    }
}
function saveBotCommand(textToSave) {
    var thisFileName = "logs_issuedCommands.txt";
    try {
        var oldLogs = fs.readFileSync("./" + thisFileName);
        fs.writeFileSync("./" + thisFileName, oldLogs + textToSave + "\n");
    } catch (e) {
        debugmsg("autoSave: " + thisFileName + " doesn't exist, creating a new one.");
        fs.writeFileSync("./" + thisFileName, textToSave + "\n");
    }
}
function tellMe(msg) {
    tell(admin, msg);
}
function tell(_steamid, msg) {
    var steamid = String(_steamid);
    if (steamid) {
        if (steamid[0] === "7") {
            debugmsg("I say to " + steamid + ": " + msg);
            steam.sendMessage(steamid, msg);
        }
    }
}
function chatTell(msg) {
    debugmsg("TradeChat - I say: " + msg);
    steamTrade.chatMsg(msg);
}
function debugmsg(msg, additional) {
    var time = getDateTime();
    console.log(time + " " + msg);
}
function isMod(steamid) {
    if (moderators.hasOwnProperty(steamid)) {
        return true;
    } else {
        return false;
    }
}

function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return day + "/" + month + "/" + year + " " + hour + ":" + min + ":" + sec + " ";
}
function time() {
    return Math.round(new Date().getTime() / 1000);
}
function textize_trade(trade) {
    try {
        var queueScrapi = 0;
        for (var x in sfr.firstInQueue.items) {
            queueScrapi += sfr.firstInQueue.items[x].scrapPrice;
        }
        var text = "";
        if (trade.tradeMode === "hatShop" && trade.tradeModePlus === "hatShop") {
            text = "\nI'm adding (" + queueScrapi + "):";
            text += "\n";
            for (var x in trade.myItems) {
                text += "\t" + trade.myItems[x].name + "\n";
            }
            text += "I Need (" + trade.iNeed + "):\n\t" + duplicated_metal_convertToNiceSentence(trade.iNeed) + "\n";
        }
        if (trade.tradeMode === "metal_mine" && trade.tradeModePlus === "hatShop") {
            var metals = ["refined", "reclaimed", "scrap"];
            var scrapi = 0;
            for (var x in metals) {
                for (var y in sfr.backpack.metal[metals[x]]) {
                    if (sfr.backpack.metal[metals[x]][y].reserved && sfr.backpack.metal[metals[x]][y].to === trade.partnerID) {
                        if (metals[x] === "refined") {
                            scrapi += 9;
                        } else if (metals[x] === "reclaimed") {
                            scrapi += 3;
                        } else {
                            scrapi += 1;
                        }
                    }
                }
            }
            text = "\nI'm adding (" + scrapi + "):";
            text += "\n\t" + duplicated_metal_convertToNiceSentence(scrapi);
            text += "\nI need (" + queueScrapi + "):\n";
            for (var x in trade.iNeed) {
                text += "\t" + trade.iNeed[x].name + "\n";
            }
        }
        if (trade.tradeMode === "hatExchange" && trade.tradeModePlus === "hatExchange") {
            text += "\n";
            for (var x in trade.myItems) {
                text += "\t" + trade.myItems[x].name + "\n";
            }
            text += "I Need: " + trade.iNeed + "\n";
        }
        return text;
    } catch (e) {
        console.log(JSON.stringify(trade, null, "\t"));
        console.log(JSON.stringify(sfr.firstInQueue, null, "\t"));
        console.log(JSON.stringify(sfr.queue, null, "\t"));
        debugmsg("ERROR! Wasn't able to textize items... " + e);
    }
}
function duplicated_metal_convertToNiceSentence(scraps) {
    var metal_to_add = duplicated_metal_convertToOrganic(scraps);
    var additionalInfo = "";
    var delayedCoolizer = "";
    for (var x in metal_to_add) {
        additionalInfo += delayedCoolizer;
        delayedCoolizer = "";
        if (metal_to_add[x] > 0) {
            delayedCoolizer = metal_to_add[x] + " " + x + ", ";
        }
    }
    if (delayedCoolizer !== "") {
        if (additionalInfo !== "") {
            additionalInfo = additionalInfo.slice(0, additionalInfo.length - 2);
            additionalInfo += " and ";
        }
        additionalInfo += delayedCoolizer;
        additionalInfo = additionalInfo.slice(0, additionalInfo.length - 2);
    } else {
        if (additionalInfo !== "") {
            additionalInfo = additionalInfo.slice(0, additionalInfo.length - 2);
        }
    }
    return additionalInfo;
}
function duplicated_metal_convertToOrganic(scraps) {
    var org_refineds = parseInt(scraps / 9);
    var org_reclaimeds = parseInt((scraps - org_refineds * 9) / 3);
    var org_scraps = scraps - org_refineds * 9 - org_reclaimeds * 3;
    return {refined: org_refineds, reclaimed: org_reclaimeds, scrap: org_scraps};
} //Returns object: {refined: int, reclaimed: int, scrap: int}

steam.on('error', function (err) {
    console.log("ERROR bot: " + err);
});
steamTrade.on('error', function (err) {
    if (err) {
        console.log("ERROR steamTrade: " + err);
        sfr.raw_message(sfr.firstInQueue.steamid, "Wait a second, I've got some problems with my steam, let me relog");
        sfr.emit("cancelTrade");
        setTimeout(function () {
            steam.logOn({
                accountName: username,
                password: password,
                shaSentryfile: sentryhash
            });
        }, 2000);
        setTimeout(function () {
            sfr.raw_message(sfr.firstInQueue, "Ok, let's try this again.");
            sfr.emit("tradeNextPerson", sfr.firstInQueue.steamid);
        }, 5000);
    }
});
botCommands = {
    "clearMetalReservations": {
        command: "clearMetalReservations",
        description: "will cancell all current metal reservations",
        permission: 0,
        method: function () {
            sfr.tradeMetalReserve(null, "all");
            return {message: "Cleared all metal reservations"};
        }
    },
    "metalReservations": {
        command: "metalReservations",
        description: "list the current metal reservations",
        permission: 1,
        method: function () {
            var metal = sfr.backpack.metal;
            var metals = ["refined", "reclaimed", "scrap"];
            var reservers = {};
            for (var x in metals) {
                for (var y in metal[metals[x]]) {
                    if (metal[metals[x]][y].reserved === true) {
                        if (!reservers.hasOwnProperty(metal[metals[x]][y].to)) {
                            reservers[metal[metals[x]][y].to] = {refined: 0, reclaimed: 0, scrap: 0};
                        }
                        reservers[metal[metals[x]][y].to][metals[x]] += 1;
                    }
                }
            }
            var message = "Here's all the current metal reservations:";
            for (var x in reservers) {
                message += ("\n@" + x + " -> |||" + reservers[x].refined + ", ||" + reservers[x].reclaimed + ", |" + reservers[x].scrap);
            }
            return {message: message};
        }
    },
    "userObject": {
        command: "userObject",
        description: "print userObject",
        permission: 0,
        method: function () {
            return {message: JSON.stringify(sfr.users["***REMOVED***"], null, "\t")};
        }
    },
    "firstInQueueItems": {
        command: "firstInQueueItems",
        description: "print out first person in queue",
        permission: 1,
        method: function () {
            var message = "";
            if (sfr.firstInQueue) {
                message = ("Item list: " + JSON.stringify(sfr.firstInQueue.items));
            } else {
                message = ("Item list: null");
            }
            return {message: message};
        }
    },
    "preleva": {
        command: "preleva",
        description: "take some refs",
        permission: 0,
        additional: true,
        method: function (moderator_steamid, additional) {
            var quantity = 50;
            if (additional !== "") {
                quantity = parseInt(additional);
            }
            steam.sendMessage(admin, moderator_steamid + " is getting " + quantity + " refined");
            sfr.tradeOffer(moderator_steamid, {currency: {metal: {quantity: (quantity * 9)}}}, null, "Here's your prelievo of " + quantity + " refined =D");
            return {message: "Ok, will leave you prelievo for " + quantity + " refined..."};
        }
    },
    "deposita": {
        command: "deposita",
        description: "put some refs",
        permission: 0,
        callback: true,
        additional: true,
        method: function (moderator_steamid, additional, callback) {
            var backpackSlots = sfr.backpack.num_backpack_filled;
            var MAXBACKPACKSLOTS = 2000;
            var MAXREFNUMBER = 300;
            var quantity = 50;
            if (additional !== "") {
                quantity = parseInt(additional);
            }
            if ((backpackSlots + quantity) < MAXBACKPACKSLOTS) {
                if (quantity <= MAXREFNUMBER) {
                    sfr.loadPersonBackpack(moderator_steamid, function (inventory) {
                        var partnerRefineds = inventory.metal.refined;
                        var hisRefs = [];
                        var refCounter = 0;
                        for (var x in partnerRefineds) {
                            hisRefs.push(x);
                            refCounter += 1;
                            if (refCounter === quantity) {
                                break;
                            }
                        }
                        if (refCounter === quantity) {
                            sfr.tradeOffer(moderator_steamid, null, {items: hisRefs}, "Here's your deposito of " + quantity + " refineds");
                            callback({message: "Sent the offer :D"});
                        } else {
                            callback({message: "Oh..an ingredient is missing.. you don't have enough metal :("});
                        }
                    });
                    return {message: "la la la.. shalala.."};
                } else {
                    return {message: "No, you can do a maximum of " + MAXREFNUMBER + " refined"};
                }
            } else {
                return {message: "Aww, I don't have enough space for this deposito"};
            }
        }
    },
    "sfr": {
        command: "sfr",
        description: "Print out any sfr object",
        permission: 0,
        additional: true,
        method: function (moderator_steamid, additional) {
            var selectors = additional.split(".");
            var myStructure = sfr;
            var stringStructure = "sfr";
            for (var x in selectors) {
                if (myStructure.hasOwnProperty(selectors[x])) {
                    myStructure = myStructure[selectors[x]];
                    stringStructure += "." + selectors[x];
                } else {
                    return{message: "Cannot read property " + selectors[x] + " of " + stringStructure};
                }
            }
            var stringified = JSON.stringify(myStructure, null, "\t");
            console.log(stringified);
            return {message: stringified};
        }
    },
    "chiavi": {
        command: "chiavi",
        description: "take some keys",
        permission: 0,
        additional: true,
        method: function (moderator_steamid, additional) {
            var keyQuantity = 0;
            if (additional !== "") {
                keyQuantity = parseInt(additional);
            } else {
                var quantity = "all";
            }
            if (quantity === "all") {
                for (var x in sfr.backpack.items) {
                    if (sfr.backpack.items[x].defindex === 5021) {
                        keyQuantity += 1;
                    }
                }
            }
            sfr.tradeOffer(admin, {currency: {key: {quantity: keyQuantity}}}, null, "Here's your " + keyQuantity + " chiavi =D");
            return {message: "Ok, will leave you " + keyQuantity + " chiavi offer..."};
        }
    },
    "refreshBackpack": {
        command: "refreshBackpack",
        description: "manually refresh local bot backpack",
        permission: 1,
        callback: true,
        method: function (moderator_steamid, callback) {
            sfr.loadBackpack(function () {
                callback({message: "Done"});
            });
            return {message: "Ok, will refresh local backpack"};
        }
    },
    "commands": {
        command: "commands",
        description: "returns the list of commands available",
        permission: 1,
        method: function (moderator_steamid) {
            var message = "Here's a list of commands you can type:";
            for (var x in botCommands) {
                if (x !== "commands") {
                    if (botCommands[x].permission >= moderators[moderator_steamid].permission) {
                        message += "\n#" + x + ": " + botCommands[x].description;
                    }
                }
            }
            return {message: message};
        }
    },
    "chat": {
        command: "chat",
        description: "chat with person, argument: steamid is needed",
        permission: 1,
        additional: true,
        chats: {}, // modID: {modID, partnerID, status}
        method: function (moderator_steamid, argument) {
            var message = "";
            var flag_status = "available";
            if (argument === "passive") {
                flag_status = "passive";
            } else if (argument[0] === "7" && argument.length === 17 && !isNaN(argument) && sfr.users.hasOwnProperty(argument)) {
                var currentChats = botCommands.chat.chats;
                if (currentChats.hasOwnProperty(moderator_steamid) && currentChats[moderator_steamid].status === "active") {
                    message = "You are already chatting with someone close this chat first (#closeChat)";
                    flag_status = "you_busy";
                } else {
                    for (var x in currentChats) {
                        if ((currentChats[x].partnerID === argument) && (currentChats[x].status === "active")) {
                            flag_status = "busy";
                            message = "This user is already chatting with " + sfr.users[currentChats[argument].modID].personaname + " (" + currentChats[argument].modID + ")";
                            break;
                        }
                    }
                }
            } else {
                message = "Invalid steamid";
                flag_status = "error";
            }
            if (flag_status === "available") {
                botCommands.chat.chats[moderator_steamid] = {modID: moderator_steamid, partnerID: argument, status: "active"};
                message = "You are now chatting with user " + sfr.users[argument].personaname + ", to close the chat: #closeChat";
                keepAliveChat(moderator_steamid);
            }
            if (flag_status === "passive") {
                botCommands.chat.chats[moderator_steamid] = {modID: moderator_steamid, partnerID: argument, status: "passive"};
                message = "You are now in passive mode, you will receive all messages sent to the bot";
            }
            return {message: message};
        }
    },
    "closeChat": {
        command: "closeChat",
        description: "close your current active chat",
        permission: 1,
        method: function (moderator_steamid) {
            var message = "";
            if (botCommands.chat.chats.hasOwnProperty(moderator_steamid)) {
                var thisChat = botCommands.chat.chats[moderator_steamid];
                if (thisChat.status === "active") {
                    botCommands.chat.chats[moderator_steamid].status = "closed";
                    if (thisChat.hasOwnProperty("timeout")) {
                        clearTimeout(botCommands.chat.chats[moderator_steamid].timeout);
                    }
                    message = "Closed chat with: " + sfr.users[thisChat.partnerID].personaname + " (" + thisChat.partnerID + ")";
                    tell(thisChat.partnerID, "Moderator closed this chat, he wont receive any message from you unless you ask again for help");
                } else if (thisChat.status === "passive") {
                    botCommands.chat.chats[moderator_steamid].status = "closed";
                    message = "Closed chat passive chat";
                } else {
                    message = "You don't have any active chat";
                }
            } else {
                message = "You don't have any active chat";
            }
            return {message: message};
        }
    },
    "broadcastQueue": {
        command: "broadcastQueue",
        description: "broadcast message to the queue",
        permission: 1,
        additional: true,
        method: function (moderator_steamid, additional) {
            if (additional !== "") {
                for (var x in sfr.queue) {
                    tell(sfr.queue[x].steamid, additional);
                }
                return {message: "Success message has been broadcasted"};
            } else {
                return {message: "Error, no message given"};
            }
        }
    },
    "webRelog": {
        command: "webRelog",
        description: "relog from steam web",
        permission: 0,
        method: function (moderator_steamid) {
            webRelog(function () {
                return;
            });
            return {message: "okay relogging"};
        }
    },
    "cancelOffers": {
        command: "cancelOffers",
        description: "cancel any sent offer",
        permission: 0,
        method: function () {
            cleanUpSentTradeOffers(true);
            return {message: "Okay cleaning trade offers"};
        }
    },
    "repStatus": {
        command: "repStatus",
        description: "list all reps",
        permission: 1,
        method: function (moderator_steamid) {
            var message = "Rep status: ";
            var totalYesReps = 0;
            var totalReps = 0;
            var totalUsers = 0;
            var repList = [];
            for (var x in sfr.users) {
                var thisUser = sfr.users[x];
                totalUsers += 1;
                if (thisUser.hasOwnProperty("behavior") && thisUser.behavior.hasOwnProperty("repped")) {
                    totalReps += 1;
                    if (thisUser.behavior.repped.status) {
                        totalYesReps += 1;
                        repList.push([x, thisUser.behavior.repped.when]);
                    }
                }
            }
            repList.sort(function (a, b) {
                return b[1] - a[1];
            });
            message += "left " + totalYesReps + "/" + totalReps + " reps (users encountered: " + totalUsers + ")\nLatest reps:\n";
            for (var x in repList) {
                message += "http://steamcommunity.com/profiles/" + repList[x][0] + " @" + repList[x][1] + "\n";
                if (x > 10) {
                    break;
                }
            }
            return {message: message};
        }
    },
    "resetRep": {
        command: "resetRep",
        description: "reset my rep",
        permission: 0,
        method: function (moderator_steamid) {
            delete sfr.users[moderator_steamid].behavior.repped;
            return {message: "okay resetted"};
        }
    },
    "testRep": {
        command: "testRep",
        description: "test leave rep",
        permission: 0,
        method: function (moderator_steamid) {
            sfr.message(moderator_steamid, "trade_complete");
            return {message: "okay... let the test begin"};
        }
    },
    "relog": {
        command: "relog",
        description: "relog on steam",
        permission: 1,
        method: function (moderator_steamid) {
            steam_relog();
            return {message: "relogging"};
        }
    },
    "setKeyPrice": {
        command: "setKeyPrice",
        description: "Set new key scrap price",
        permission: 0,
        callback: true,
        additional: true,
        method: function (moderator_steamid, _additional, callback) {
            var additional = convert_refined_string_to_scrap(_additional);
            if (additional) {
                try {
                    var currentKeyPrice = parseInt(botCommands.magic.keyPrice());
                } catch (e) {
                    fs.writeFileSync("keyPrice", additional);
                    return {message: "Ahhhh!! Could not determinate price, created new file with price: " + fs.readFileSync("keyPrice")};
                }
                fs.writeFileSync("keyPrice", additional);
                var newKeyPrice = fs.readFileSync("keyPrice");
                var deltaPrice = newKeyPrice - currentKeyPrice;
                var finalRefinedPrice = (parseInt(newKeyPrice * 100 / 9) / 100).toString();
                updateOutpostKeyPrice(finalRefinedPrice, function (response) {
                    if (response.result === "success") {
                        callback({message: "Also updated price on tf2outpost ;)"});
                    } else {
                        callback({message: "But got problems updating tf2outpost: " + response.message});
                    }
                });
                return {message: "Updated key price! Now is " + finalRefinedPrice + " (" + newKeyPrice + " scrap). "
                            + "Price changed by " + ((deltaPrice >= 0) ? "+" : "") + deltaPrice + " scrap"};
            } else {
                return {message: "Given price is not a valid scrap price"};
            }
        }
    },
    "magic": {
        command: "magic",
        description: "Magically transform your keys in metal",
        permission: 3,
        callback: true,
        additional: true,
        keyPrice: function () {
            return fs.readFileSync("keyPrice");
        },
        method: function (moderator_steamid, additional, callback) {
            if (sfr.isTrading(moderator_steamid)) {
                return {message: "You are trading with me already, we can't do this, retry when you have done"};
            }
            var MINMETAL = 500;
            var MAXKEYNUMBER = 15;
            try {
                var keyPrice = parseInt(botCommands.magic.keyPrice());
            } catch (e) {
                return {message: "Ahhhh!! Could not determinate price"};
            }
            if (sfr.backpack.metal.getRefinedCount() > MINMETAL) {
                var numberOfKeys = 1;
                if (additional !== "" && !isNaN(additional)) {
                    numberOfKeys = parseInt(additional);
                }
                if (numberOfKeys <= MAXKEYNUMBER) {
                    sfr.loadPersonBackpack(moderator_steamid, function (inventory) {
                        var partnerItems = inventory.items;
                        var hisKeys = [];
                        var keyCounter = 0;
                        for (var x in partnerItems) {
                            if ((partnerItems[x].defindex === 5021) && (!partnerItems[x].hasOwnProperty("flag_cannot_craft") || !partnerItems[x].flag_cannot_craft)) {
                                hisKeys.push(partnerItems[x]);
                                keyCounter += 1;
                            }
                            if (keyCounter === numberOfKeys) {
                                break;
                            }
                        }
                        if (keyCounter === numberOfKeys) {
                            sfr.tradeOffer(moderator_steamid, {currency: {metal: {quantity: (keyPrice * numberOfKeys)}}}, {items: hisKeys}, "Hey!");
                            callback({message: "Sent the offer :D"});
                        } else {
                            callback({message: "Oh..an ingredient is missing.. you don't have enough keys :("});
                        }
                    });
                    return {message: "la la la.. shalala.."};
                } else {
                    return {message: "No, you can do a maximum of " + MAXKEYNUMBER + " keys"};
                }
            } else {
                return {message: "Aww, I don't have enough metal to make some magic, sorry, come back later"};
            }
        }
    }
};
function isChatting(chatterID) {
    if (getOtherChatterID(chatterID)) {
        return true;
    }
    return false;
}
function isPassive(modID) {
    if (moderators.hasOwnProperty(modID) && botCommands.chat.chats.hasOwnProperty(modID) && botCommands.chat.chats[modID].status === "passive") {
        return true;
    }
    return false;
}
function sendToPassives(message, who) {
    if (sfr.users.hasOwnProperty(who)) {
        for (var x in moderators) {
            if (isPassive(x)) {
                tell(x, "(" + who + ") " + sfr.users[who].personaname + ": " + message);
            }
        }
    }
}
function getOtherChatterID(chatterID) {
    var currentChats = botCommands.chat.chats;
    if (currentChats.hasOwnProperty(chatterID) && (currentChats[chatterID].status === "active")) {
        return currentChats[chatterID].partnerID;
    }
    for (var x in currentChats) {
        if ((currentChats[x].partnerID === chatterID) && (currentChats[x].status === "active")) {
            return x;
        }
    }
    return false;
}
function getChatMod(chatterID) {
    var currentChats = botCommands.chat.chats;
    if (currentChats.hasOwnProperty(chatterID) && (currentChats[chatterID].status === "active")) {
        return chatterID;
    }
    for (var x in currentChats) {
        if ((currentChats[x].partnerID === chatterID) && (currentChats[x].status === "active")) {
            return x;
        }
    }
    return false;
}
function keepAliveChat(chatterID) {
    var modID = getChatMod(chatterID);
    if (botCommands.chat.chats[modID].hasOwnProperty("timeout")) {
        clearTimeout(botCommands.chat.chats[modID].timeout);
    }
    var thisChat = botCommands.chat.chats[modID];
    if (thisChat.status === "active") {
        botCommands.chat.chats[modID].timeout = setTimeout(function () {
            if (botCommands.chat.chats[modID].status === "active") {
                botCommands.chat.chats[modID].status = "closed";
                tell(modID, "Chat with " + sfr.users[thisChat.partnerID].personaname + " has been closed due to inactivity (" + thisChat.partnerID + ")");
            }
        }, 240000);
    }
}

function sendChatMessage(message, chatterID) {
    var otherChatterID = getOtherChatterID(chatterID);
    tell(otherChatterID, message);
    keepAliveChat(chatterID);
}

SteamTrade.prototype.loadPersonInventory = function (steamid, callback) {
    var appid = 440;
    var contextid = 2;
    var inventory = [];
    this._request.get({
        uri: 'http://steamcommunity.com/profiles/' + steamid + '/inventory/json/' + appid + '/' + contextid,
        json: true
    }, function continueFullInventoryRequestIfNecessary(error, response, body) {
        if (error || response.statusCode !== 200 || JSON.stringify(body) === '{}') { // the latter happens when GC is down
            this.emit('debug', 'loading my inventory: ' + (error || (response.statusCode !== 200 ? response.statusCode : '{}')));
            this.loadInventory(steamid, callback);
            return;
        }
        if (body.hasOwnProperty("success") && (body.success === false)) {
            if (body.hasOwnProperty("Error") && body.Error === "This profile is private.") {
                callback("private");
            } else {
                callback("error");
            }
            return;
        }
        if (typeof body !== 'object') {
            // no session
            callback();
            return;
        }
        inventory = inventory
                .concat(mergeWithDescriptions(body.rgInventory, body.rgDescriptions, contextid))
                .concat(mergeWithDescriptions(body.rgCurrency, body.rgDescriptions, contextid));
        if (body.more) {
            this.emit('debug', 'loading my inventory: continuing from ' + body.more_start);
            this._request.get({
                uri: 'http://steamcommunity.com/profiles/' + steamid + '/inventory/json/' + appid + '/' + contextid + '?start=' + body.more_start,
                json: true
            }, continueFullInventoryRequestIfNecessary.bind(this));
        } else {
            callback(inventory);
        }
    }.bind(this));
};
function mergeWithDescriptions(items, descriptions, contextid) {
    return Object.keys(items).map(function (id) {
        var item = items[id];
        var description = descriptions[item.classid + '_' + (item.instanceid || '0')];
        for (var key in description) {
            item[key] = description[key];
        }
        // add contextid because Steam is retarded
        item.contextid = contextid;
        return item;
    });
}

function webRelog(callback) {
    steam.webLogOn(function (cookies) {
        debugmsg("Got cookies: " + JSON.stringify(cookies) + ", configuring trade...", {level: 2});
        steamTrade.setCookie(cookies[0]);
        steamTrade.setCookie(cookies[1]);
        steamTrade.setCookie(cookies[2]);
        browser.setCookie(cookies);
        tradeOffers.setup({sessionID: steamTrade.sessionID, webCookie: cookies}, function () {
            debugmsg("Alright, web logged!", {level: 1});
            if (callback) {
                callback(true);
            }
        });
    });
}

function convert_refined_string_to_scrap(_ref) {
    if (isNaN(_ref)) {
        console.log("Given number is not valid");
        return false;
    }
    var ref = _ref.split(".");
    var decimals = ".";
    if (ref.length > 1) {
        if ((ref[1].length === 2) && (ref[1][0] === ref[1][1])) {
            decimals += Array(5).join(ref[1]);
        } else {
            console.log("Given number has wrong decimals for a refined quantity: " + ref[1] + " (length: " + ref[1].length + ")");
            return false;
        }
    }
    var finalString = ref[0] + decimals;
    if (!isNaN(finalString)) {
        return Math.round(parseFloat(finalString) * 9);
    } else {
        console.log("Given number is not valid");
        return false;
    }
}

function updateOutpostKeyPrice(keyPrice, callback) {
    outpost.setCookie("uhash=331bfaba3e70706cc5eb9666d149e6fd");
    outpost.setHeader("User-Agent", "Mozilla/5.0 (X11; Linux x86_64; rv:12.0) Gecko/20100101 Firefox/21.0");
    var notes = "[color=#00CCFF][b]Buying for " + keyPrice + " ref each[/b][/color] \n\n"
            + "If you want you can use my bot: http://steamcommunity.com/id/axefish \n"
            + "Type in the chat '#magic []' (replacing [] with the number of keys you want to sell) \n"
            + "bot will leave you a trade offer.";
    var options = {
        action: "trade.notes_edit",
        hash: "331bfaba3e70706cc5eb9666d149e6fd",
        tradeid: "21942117",
        notes: notes
    };
    outpost.post("http://www.tf2outpost.com/api/core", options, function (result) {
        console.log(JSON.stringify(result));
    });
}