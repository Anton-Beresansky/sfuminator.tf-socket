module.exports = BotInteractions;

var Logs = require("./../lib/logs.js");
var Events = require('events');

/**
 * @event sendMessage (steamid, message)
 * @constructor
 */
function BotInteractions() {
    /**
     * @type {UserInteraction[]}
     */
    this.interactions = [];
    this.moderatorSteamids = [
        "76561197992634049"
    ];
    this.log = new Logs({applicationName: "Bot Interaction", color: "cyan", dim: true});
    Events.EventEmitter.call(this);

    var self = this;
    this.message_senteces = {
        help: {
            message: [
                "Your message is going to trigger a help request to the online staff, are you sure you want to continue?"
            ],
            need_answer: true,
            onAnswer: function (user, type) {
                if (type === "boolean_answer_yes") {
                    for (var i = 0; i < self.moderatorSteamids.length; i += 1) {
                        self.emit('sendMessage', self.moderatorSteamids[i], "User " + user.getSteamid() + " is asking for help, contact: #chat " + user.getSteamid() + "\nFast message: Hello! You are now talking with a sfuminator.tf staff member, how can I help you?");
                    }
                    return "Okay, if there is a supervisor available, you should be contacted soon, if not, maybe the website FAQ could help you"
                } else if (type === "boolean_answer_no") {
                    return "Alright";
                } else {
                    return "Answer yes or no, please.";
                }
            }
        },
        i_love_you: {
            message: [
                "Me too <3",
                "Aww so sweet, of course I love you too!",
                "You make me blush ^^",
                "I love you too!",
                "010010010010000001101100011011110111011001100101001000000111100101101111011101010010000001110100011011110110111100100001",
                "Ok, but wear protection please. Just kidding ;o I love you too!"
            ]
        },
        hug: {
            message: [
                "Well, I'm a bit cold to hug but okay",
                ":)"
            ]
        },
        you_sell: {
            message: [
                "I'm selling hats and misc, if you want to buy them, please go here: http://sfuminator.tf/hats/#hats select which one you want and I'll trade you."
            ]
        },
        i_buy: {
            message: [
                "If you want to buy or sell hats and misc, please go here: http://sfuminator.tf/hats/ select what you want and I'll trade you."
            ]
        },
        you_best: {
            message: [
                "Thank you! 010000100111010101110100001000000111100101101111011101010010000001100001011100100110010100100000011001010111011001100101011011100010000001100010011001010111010001110100011001010111001000100001",
                "Ohhh thanks! <3",
                "So nice of you, thanks :D"
            ]
        },
        hello: {
            message: [
                "Hello!",
                "Hey =D",
                "Hi",
                "Hello my friend ^^",
                "Bip bu bi bup... oh hey!",
                "Hey",
                "Hello"
            ]
        },
        bye: {
            message: [
                "Bye bye!",
                "Bye, have a nice day =D",
                "Bye, hope to see you again",
                "Bye :)",
                "Bye bye, have a nice day!"
            ]
        },
        how_are_you: {
            message: [
                "I'm fine thanks ^^",
                "It's all good!",
                "My bits are perfectly working ...well... i hope :P",
                "My bits are perfectly working!",
                "I'm ok, thank you",
                "I think that I'm fine, although not sure if I can really think of it :S",
                "I'm fine thanks"
            ]
        },
        are_you_there: {
            message: [
                "Yeah... I think so",
                "Yes I'm here",
                "Yep",
                "Yeah bip biup bip, I'm here"
            ]
        },
        are_you_bot: {
            message: [
                "Bip bup biip, yes I'm I bot. No, seriously, I'm a bot.",
                "Yep, I'm a bot",
                "Yes... I think so =D",
                "Yeah, I'm a bot",
                "Yes",
                "Yes, I'm a bot"
            ]
        },
        who_are_you: {
            message: [
                "I'm the Sfuminator bot",
                "I'm the Sfuminator bot",
                "I'm a bot",
                "Bip bup bip... I'm a bot!",
                "Bip bip buuuup, I'm the Sfuminator bot"
            ]
        },
        you_trade: {
            message: [
                "If you want to trade me please go here and select what you want to do: http://sfuminator.tf/",
                "In order to trade with me you have to go on our website and select what you want to do: http://sfuminator.tf/",
                "If you would like to trade with me, please visit our website and select what you want to do there: http://sfuminator.tf/",
                "If you are looking to trade with me, please select what you want on our website: http://sfuminator.tf/",
                "If you would like to trade with me, take a look at our website and choose what to trade there: http://sfuminator.tf/"
            ]
        },
        your_site: {
            message: [
                "My website is: http://sfuminator.tf/",
                "Here is the link: http://sfuminator.tf/"
            ],
            pending_answer: ["thanks"]
        },
        thanks: {
            message: [
                "You are welcome :D",
                "You are welcome",
                "No problem my friend!",
                "No problem!",
                "Thanks to you ;)",
                "You are welcome!"
            ]
        },
        boolean_answer_yes: {
            message: [
                "Ok",
                "Alright"
            ]
        },
        boolean_answer_no: {
            message: [
                "Oh.. ok",
                "Oh"
            ]
        },
        already_answered: {
            message: [
                "I think I've already answered to that...",
                "Hmm, didn't I tell you that already?",
                "I did answer already to that... I think...",
                "I think I've already answered to that...",
                "Didn't I just tell you that?"
            ],
            pending_answer: ["boolean_answer_yes", "boolean_answer_no"]
        },
        generic_question: {
            message: [
                "Yeah, hope that I can answer... =P But I'll take note of your question if not.",
                "Sure go haead",
                "Yeah, sure",
                "Yes, tell me",
                "Ok, hope that I can answer :D",
                "Bip bup bip... ok my bits are listening you"
            ]
        },
        trade_too_long_alert: {
            message: [
                "Trade is taking too much time, sorry but you will be kicked from the queue in 30 seconds",
                "Hey, sorry but this trade is taking too much time, I will end this session in 30 seconds",
                "This trade is taking too much time, sorry but in 30 seconds you will be kicked from the queue"
            ]
        },
        trade_too_long: {
            message: [
                "Sorry, I removed you from the queue, trade took too much time",
                "Sorry but trade took too much time, I removed you from the queue"
            ]
        },
        afk_alert: {
            message: [
                "Hey, are you there?",
                "Everything ok? Are you there?",
                "Hello? Are you there?"
            ],
            pending_answer: ["boolean_answer_yes"]
        },
        afk_kick: {
            message: [
                "Sorry but you were afk too much, you have been kicked from the queue",
                "Sorry, I removed you from the queue, you were afk too much"
            ]
        },
        trade_hello: {
            message: function (user) {
                var number_of_trades = user.getNumberOfTrades();
                var message = [
                    [
                        "This is your first time trading with me eh? Alright, let's do this!",
                        "Nice to meet you, let's trade :D",
                        "Oh welcome on the sfuminator community! Let's trade",
                        "Hope that all was nice and easy, alright one more step =P let's trade!",
                        "What's up? Nice to meet you, let's trade!"
                    ], [
                        "Nice to see you again :), let's trade!",
                        "Nice to see you again, let's trade",
                        "Alright let's trade ^^",
                        "It's you! Alright let's trade!",
                        "Oh, it's you! Alright let's trade...",
                        "What's up? Happy to trade with you again, let's do this :D",
                        "I'm ready, let's trade!",
                        "Was waiting for you, hope you were as well! Let's trade =D"
                    ], [
                        "Here's my pal, let's trade",
                        "Here's my pal, let's trade!",
                        "Here's my pal, let's do this",
                        "You know how this works... let's trade :D",
                        "Well, you know the procedure... =P",
                        "How's going? Hope it's all good, let's trade!",
                        "What's up? Hope it's all good, let's trade!",
                        "How's going? Hope you are ok, let's trade!",
                        "Yes! it's you! Let's trade :D",
                        "It's you, again! Happy that you like our service, let's trade!",
                        "Nice to see you again! And again, and again, and again and again and again *hitting with a spoon* ...ehmm ok let's trade...",
                        "Wow, this is your trade number // with me, you should be a veteran by now!"
                    ]
                ];
                if (number_of_trades > 0 && number_of_trades < 10) {
                    number_of_trades = 1;
                }
                if (number_of_trades >= 10) {
                    number_of_trades = 2;
                }
                var hello_message = "";
                if (self.getInteraction(user).canGreet()) {
                    hello_message = getRandomElement(self.message_senteces.hello.message) + " ";
                }
                return hello_message + getRandomElement(message[number_of_trades]).replace("//", number_of_trades);
            }
        },
        trade_session_start: {
            message: function (user) {
                return "";
            }
        },
        trade_wrong_items: {
            message: function () {
                return "";
            }
        },
        trade_complete: {
            message: function (user) {
                var number_of_trades = 1;
                if (user.getNumberOfTrades() > 0) {
                    number_of_trades = user.getNumberOfTrades();
                }
                number_of_trades -= 1; //Needed to be compatible with array index
                var message = [[
                    "Yay! Thanks a lot! Hope that all went nice and easy also for you.",
                    "Thanks a lot! Everything went well? I hope so!",
                    "Thank you! If you didn't already, you can join our group to keep in touch with the community and get notified for the incoming events http://steamcommunity.com/groups/tf2sfuminator"
                ], [
                    "Thanks a lot! It has been a pleasure to trade with you, if you want, remember that you can join our group! http://steamcommunity.com/groups/tf2sfuminator",
                    "Thank you very much! Hope to trade with you again, meanwhile if you didn't already, you might want to join our group!  http://steamcommunity.com/groups/tf2sfuminator",
                    "Thanks a lot!! Hope to trade with you again",
                    "Thank you! Enjoy your new items!"
                ], [
                    "Thanks!",
                    "Thank you!",
                    "Thanks a lot!"
                ]];
                if (number_of_trades > 0 && number_of_trades < 10) {
                    number_of_trades = 1;
                }
                if (number_of_trades >= 10) {
                    number_of_trades = 2;
                }
                if (self.getInteraction(user).canBeRepped()) {
                    setTimeout(function () {
                        self.emit("sendMessage", user.getSteamid(), self.getMessage("ask_rep", user));
                    }, 2000);
                }
                return getRandomElement(message[number_of_trades]);
            },
            pending_answer: ["thanks"]
        },
        trade_complete_escrow: {
            message: function (user) {
                var number_of_trades = 1;
                if (user.getNumberOfTrades() > 0) {
                    number_of_trades = user.getNumberOfTrades();
                }
                number_of_trades -= 1; //Needed to be compatible with array index
                var default_msg = "Thanks a lot for accepting the trade. Remember that items are now in escrow. This means that Steam will keep the items we traded for 3 days. " +
                    "If the next time you want to trade your items instantly you have to enable mobile confirmations on your smartphone from the steam app for at least 7 days. ";
                var message = [[
                    "Hope to see you again!",
                    "By the way, if you didn't already, you can join our group to keep in touch with the community and get notified for the incoming events http://steamcommunity.com/groups/tf2sfuminator"
                ], [
                    "It has been a pleasure trading with you, if you want, remember that you can join our group! http://steamcommunity.com/groups/tf2sfuminator",
                    "Hope to trade with you again, meanwhile if you didn't already, you might want to join our group!  http://steamcommunity.com/groups/tf2sfuminator",
                    ""
                ], [
                    ""
                ]];
                if (number_of_trades > 0 && number_of_trades < 10) {
                    number_of_trades = 1;
                }
                if (number_of_trades >= 10) {
                    number_of_trades = 2;
                }
                if (self.getInteraction(user).canBeRepped()) {
                    setTimeout(function () {
                        self.emit("sendMessage", user.getSteamid(), self.getMessage("ask_rep", user));
                    }, 2000);
                }
                return default_msg + getRandomElement(message[number_of_trades]);
            },
            pending_answer: ["thanks"]
        },
        trade_cancel: {
            message: [
                "Oh, it seems you cancelled the trade...",
                "You cancelled the trade...",
                "It seems you cancelled the trade",
                "Oh... you cancelled the trade"
            ]
        },
        trade_timeout: {
            message: [
                "Ops, something went wrong with the connection...",
                "Hum, timeout.",
                "Timeout... hmm something went wrong with the connection."
            ]
        },
        trade_fail: {
            message: [
                "Trade failed! No items were exchanged :( ",
                "Something went wrong with steam, trade failed.",
                "Oh... trade failed."
            ]
        },
        trade_retry: {
            message: [
                "Let's retry the trade.",
                "Shell we try this again?",
                "I'll invite you to trade again",
                "Let's retry to trade."
            ]
        },
        trade_too_many_attempts: {
            message: [
                "We tried too many times, sorry I think that there is something wrong with steam, let's retry this later.",
                "Sorry, we tried too many times, let's retry this later.",
                "It seems that there is something wrong with steam, let's retry this later.",
                "Sorry but trade failed too many times, I think that there is something wrong with steam, let's retry later."
            ]
        },
        tradeOffer_hello: {
            message: function (user) {
                var number_of_trades = user.getNumberOfTrades();
                var message = [
                    [
                        "This is your first time trading with us eh? Alright, let's do this!",
                        "Nice to meet you, your request is being processed...",
                        "Oh, welcome to the sfuminator community! I'm processing your request...",
                        "Hope that all was nice and easy, alright one more step!",
                        "What's up? Nice to meet you, I'm processing your request..."
                    ], [
                        "Nice to see you again :), your trade is being processed...",
                        "Nice to see you again, your trade is being processed...",
                        "Alright let's do this! ^^",
                        "It's you! let's do this!",
                        "Oh, it's you! Alright I'm processing your trade...",
                        "What's up? Happy to trade with you again, hold on a sec :D",
                        "I'm ready, let me process your trade",
                        "Was waiting for you. Let's do this =D"
                    ], [
                        "Here's my pal, hold on a sec...",
                        "Here's my pal ^^ what's up?",
                        "Here's my pal, let's do this",
                        "Hey",
                        "Well, you know the procedure... =P",
                        "How's going? Hope it's all good!",
                        "What's up? Hope it's all good! Hold on a sec...",
                        "How's going? Hope you are ok",
                        "Hey! It's you! Wait a sec :D",
                        "It's you, again! Happy that you like our service! Wait a sec",
                        "Nice to see you again! And again, and again, and again and again and again *hitting with a spoon* ...ehmm ok let's do this trade...",
                        "Wow, this is your trade number // with us, you should be a veteran by now!",
                        "Hello!",
                        "Sup :)",
                        "What's up :D",
                        "Hey! ^^"
                    ]
                ];
                if (number_of_trades > 0 && number_of_trades < 10) {
                    number_of_trades = 1;
                }
                if (number_of_trades >= 10) {
                    number_of_trades = 2;
                }
                var hello_message = "";
                if (self.getInteraction(user).canGreet()) {
                    hello_message = getRandomElement(self.message_senteces.hello.message) + " ";
                }
                return hello_message + getRandomElement(message[number_of_trades]).replace("//", user.getNumberOfTrades());
            }
        },
        tradeOffer_sent: {
            message: [
                "I just sent you a trade offer",
                "Ok! I sent you a trade offer",
                "Alright, trade offer has been sent :D",
                "Here you go! Trade offer sent."
            ]
        },
        tradeOffer_afk_kick: {
            message: [
                "Sorry, but you were afk too much, your trade offer has been cancelled",
                "Sorry, you were too much afk, your trade offer has been cancelled"
            ]
        },
        tradeOffer_trade_too_long: {
            message: [
                "Sorry, but it took too much to accept the trade, your trade offer has been cancelled"
            ]
        },
        tradeOffer_trade_too_long_alert: {
            message: [
                "Sorry but this is taking too much time, your trade offer will be cancelled in 30 seconds"
            ]
        },
        tradeOffer_declined: {
            message: [
                "Oh, it seems you declined the trade offer...",
                "Oh... you declined the trade offer :(",
                "It seems you declined the trade offer... D:",
                "Oh, It seems you declined the trade offer"
            ]
        },
        tradeOffer_cancel: {
            message: [
                "Alright, I cancelled your trade",
                "Okay, your trade has been successfully cancelled",
                "I cancelled your trade"
            ]
        },
        insufficent_hisMetal: {
            message: [
                "Sorry, but it seems you don't have enough metal in your backpack, I'm cancelling the trade... If you have keys, you can type '#magic number_of_keys' and bot will give you some metal (ex: #magic 1)"
            ]
        },
        insufficent_myMetal: {
            message: [
                "Sorry, but I don't have enough metal to buy your hats, I'm cancelling the trade..."
            ]
        },
        inexistent_hisItem: {
            message: [
                "Sorry, but it seems that one or more items you selected are no more in your backpack..."
            ]
        },
        relog: {
            message: [
                "It seems I have some problems with steam, let me try to relog",
                "Seems I have some problems with steam, wait a second, I'll try to relog",
                "I think I have some problems with steam, hold on, I'm going to relog into steam"
            ]
        },
        trade_me: {
            message: [
                "If you didn't get any trade request, or you weren't able to accept in time, try to invite me to trade.",
                "Did you get my trade request? If not, or you just weren't able to accept my request in time, try to invite me to trade."
            ]
        },
        exited_queue: {
            message: [
                "Oh, It seems you quit the queue.",
                "Oh, It seems you exited the queue..."
            ]
        },
        hello_queue: {
            message: function (user) {
                var number_of_trades = user.getNumberOfTrades();
                var message = [
                    [
                        "Thanks for accepting my invite, As soon as it's your turn I'm going to trade you ;)",
                        "What's up? At the moment there is someone before you in the queue, but I will trade you as soon as it is your turn"
                    ], [
                        "Hey! I'll get to you as soon as I can ;)"
                    ]
                ];
                if (number_of_trades > 1) {
                    return "";
                } else {
                    return getRandomElement(message[number_of_trades]);
                }

            }
        },
        ask_rep: {
            message: [
                "Would you like me to leave a +rep on your profile?",
                "Would you like a +rep on your profile?"
            ],
            need_answer: true,
            onAnswer: function (user, type) {
                if (type === "boolean_answer_yes") {
                    self.postReputationComment(user.getSteamid());
                    return self.getMessage("yes_rep", user);
                } else if (type === "boolean_answer_no") {
                    return self.getMessage("no_rep", user);
                } else {
                    return "Please answer yes or no";
                }
            }
        },
        yes_rep: {
            message: [
                "Ok! I'm leaving you a +rep comment",
                "Alright, I'm going to give you a nice +rep"
            ]
        },
        no_rep: {
            message: [
                "Okay sorry, I wont post anything on your profile ^^'"
            ]
        },
        rep_comment: {
            message: [
                "+rep | A great individual! We're proud to deliver the best item prices for you at http://sfuminator.tf/",
                "+rep | Thank you for using our bot and joining our community! A big thank you from http://sfuminator.tf/",
                "+rep | Thank you for being a part of the http://sfuminator.tf/ community! We hope you enjoy our fair prices and plentiful hat stock!",
                "+rep | Enjoy your new items bought from http://sfuminator.tf/",
                "+rep | I would totally invite this handsome lad for dinner at my mother's house! After all, he uses http://sfuminator.tf/ ;)",
                "+rep | This guy understands how easy and fast trading can be! Thank you for using http.//sfuminator.tf/",
                "+rep | What's cooler than a penguin in a disco? This guy! After all, he uses http://sfuminator.tf/",
                "+rep | I'd totally take this lovely fella to a picnic for a few sandviches! After all, he uses http://sfuminator.tf/",
                "+rep | I'm italian and I promise to you, this fella makes the best pasta in the world! After all, he uses http://sfuminator.tf/ Just kidding. I make the best pasta. But he is a good second.",
                "+rep | I'd totally invite him to water my plants while I'm on a vacation. After all, he uses http://sfuminator.tf/"
            ]
        },
        pendingMail_afk_kick: {
            message: [
                "Sorry but it seems that you didn't confirm the trade yet. You have been removed from the queue",
                "Sorry but your trade confirmation took too much. You have been removed from the queue"
            ]
        },
        steamTradeError: {
            generic: "Oh no! Steam returned an error when sending the offer: ",
            not_available_for_trade: "Sorry, but I had problems sending you the trade. It seems that your account " +
            "is not available for trade. It's possible that you don't have Steam Guard enabled on your account " +
            "or that you are on a trade cool down period because you recently logged on a new device."
        }
    };
}

require("util").inherits(BotInteractions, Events.EventEmitter);

BotInteractions.prototype.postReputationComment = function (steamid) {
    this.emit("postProfileComment", steamid, getRandomElement(this.message_senteces.rep_comment.message));
};

BotInteractions.prototype.getMessage = function (type, user) {
    var message = "";
    if (typeof this.message_senteces[type].message === "function") {
        message = this.message_senteces[type].message(user);
    } else {
        var messageList = this.message_senteces[type].message;
        message = getRandomElement(messageList);
    }
    if (this.message_senteces[type].hasOwnProperty("need_answer") && this.message_senteces[type].need_answer && message !== "") {
        this.getInteraction(user).setAnswerNeed(type);
    } else {
        this.getInteraction(user).unsetAnswerNeed();
    }
    if (message.replace(" ", "") !== "") {
        return message;
    }
};

BotInteractions.prototype.getAnswer = function (message, user) {
    var context = answer_understand(message);
    var thisInteraction = this.getInteraction(user);

    var final_answer = "";
    var bestAffinity = 60;
    var type = "not_understood";
    for (var z in context) {
        if (context[z].affinity > bestAffinity) {
            type = context[z].type;
            bestAffinity = context[z].affinity;
        }
    }

    if (thisInteraction.isAnswerNeeded()) {
        if (this.message_senteces.hasOwnProperty(thisInteraction.getAnswerType())) {
            if (this.message_senteces[thisInteraction.getAnswerType()].hasOwnProperty("onAnswer")) {
                var answerMessage = this.message_senteces[thisInteraction.getAnswerType()].onAnswer(user, type);
                if (answerMessage) {
                    this.getInteraction(user).unsetAnswerNeed();
                    return answerMessage;
                }
            } else {
                this.getInteraction(user).unsetAnswerNeed();
                this.log.error("Can't handle needed answer: '" + type + "' has no method onAnswer", 42);
            }
        } else {
            this.getInteraction(user).unsetAnswerNeed();
            this.log.error("Can't handle needed answer '" + type + "' it's not defined in message_senteces", 41);
        }
    } else if (type !== "not_understood") {
        var answerList = this.message_senteces[type].message;
        var answer = getRandomElement(answerList);
        switch (type) {
            case "hello":
                if (thisInteraction.isFirstGreeting()) {
                    answer = getRandomElement(this.message_senteces.hello.message) + " " + getRandomElement(this.message_senteces.who_are_you.message) + ". " + getRandomElement(this.message_senteces.you_trade.message);
                    if (final_answer !== "") {
                        final_answer = answer + ", " + final_answer;
                    } else {
                        final_answer = answer;
                    }
                    thisInteraction.setAsGreeted();
                } else if (thisInteraction.canGreet()) {
                    if (final_answer !== "") {
                        final_answer = answer + ", " + final_answer;
                    } else {
                        final_answer = answer;
                    }
                    thisInteraction.setAsGreeted();
                }
                break;
            case "boolean_answer_yes":
                if (thisInteraction.waitingForBooleanAnswer()) {
                    final_answer += answer + " ";
                    thisInteraction.unsetWaitingForBooleanAnswer();
                }
                break;
            case "boolean_answer_no":
                if (thisInteraction.waitingForBooleanAnswer()) {
                    if (thisInteraction.isBooleanAnswerAssociatedToType()) {
                        answer = answer + ". " + getRandomElement(this.message_senteces[thisInteraction.getTypeForBooleanAnswer()].message);
                    } else {
                        answer = answer + ". ";
                    }
                    final_answer += answer + " ";
                    thisInteraction.unsetWaitingForBooleanAnswer();
                }
                break;
            default:
                if (type === "bye") {
                    thisInteraction.resetDecayingInteractions();
                }
                if (!thisInteraction.getDiscussionFor(type).hasBeenAnswered()) {
                    final_answer += answer + " ";
                } else {
                    answer = getRandomElement(this.message_senteces.already_answered.message);
                    final_answer += answer + " ";
                    thisInteraction.setWaitingForBooleanAnswer(type);
                    thisInteraction.getDiscussionFor("thanks").forceOnceToNotAnswered(); //temp
                }
                thisInteraction.getDiscussionFor(type).setAsAnswered();
                break;
        }
    }
    if (this.message_senteces.hasOwnProperty(type) && this.message_senteces[type].hasOwnProperty("need_answer")) {
        return this.getMessage(type, user);
    } else if (type !== "not_understood") {
        return final_answer;
    } else {
        //Couldn't understand 'message'
    }
};

function answer_understand(original_message) {
    var result = [];
    ///////////////////////////// REMOVE SYMBOLS AND NORMALIZE MESSAGE
    var original_normalized_message = (original_message.replace(/[^A-Z0-9]+/ig, ",")).toLowerCase();
    original_normalized_message = answer_remove_double_letters(original_normalized_message);
    if (original_normalized_message[0] === ",") {
        original_normalized_message = original_normalized_message.slice(1);
    }
    if (original_normalized_message[original_normalized_message.length - 1] === ",") {
        original_normalized_message = original_normalized_message.slice(0, original_normalized_message.length - 1);
    }
    var kl = answer_keywords.list;
    var new_affinity = {};
    var old_affinity = {};
    /////////////////////////////// PARTICLUAR AFFINITY
    var original_normalized_message_particularized = original_normalized_message;
    var wordsToRemove = [];
    for (var x in kl) {
        var klt = kl[x].type;
        var particular_affinity = answer_getParticularAffinity(klt, original_normalized_message);
        new_affinity[klt] = particular_affinity.affinity;
        if (old_affinity.hasOwnProperty(klt)) {
            if (new_affinity[klt] > old_affinity[klt]) {
                old_affinity[klt] = new_affinity[klt];
            }
            wordsToRemove.push(particular_affinity.to_remove);
        } else {
            old_affinity[klt] = new_affinity[klt];
            wordsToRemove.push(particular_affinity.to_remove);
        }
    }
    for (var x in wordsToRemove) {
        var rep0 = new RegExp(wordsToRemove[x], 'g');
        original_normalized_message_particularized = original_normalized_message_particularized.replace(rep0, "");
    }

/////////////////////////////////// FILTER MISLEADING WORDS
    for (var x in words_to_filter) {
        original_normalized_message_particularized = answer_normalizedWordReplace(words_to_filter[x], original_normalized_message_particularized);
    }

///////////////////////////////// PRIORITY AND AFFINITY
    for (var x in kl) {
        var klt = kl[x].type;
        var priority_coefficent = answer_getPriorityCoefficent(kl[x], original_normalized_message);
        var all_variations = answer_keywords_getAllVariations(klt);
        for (var y in all_variations) {
            var normalized_message = original_normalized_message_particularized;
            var original_compatted_message = normalized_message.replace(/,/g, "");
            var thisVariationList = all_variations[y].split(",");
            var compatted_message = normalized_message.replace(/,/g, "");
            var non_removed = 0;
            for (var z in thisVariationList) {
                var preremoval = normalized_message;
                var rep4 = new RegExp(thisVariationList[z], "g");
                normalized_message = answer_normalizedWordReplace(thisVariationList[z], normalized_message);
                compatted_message = compatted_message.replace(rep4, "");
                if (preremoval === normalized_message) {
                    non_removed += 1;
                }
            }
            var non_removed_factor = ((thisVariationList.length - non_removed) / thisVariationList.length);
            var normalized_message_compatted = normalized_message.replace(/,/g, "");
            var partial_replacement_factor = 1;
            if (normalized_message_compatted !== compatted_message) {
                partial_replacement_factor = 5;
            }
            var charsAffinity = (((original_compatted_message.length - normalized_message_compatted.length) * 100) / original_compatted_message.length);
            var orginal_nwords = (original_normalized_message_particularized.split(",")).length;
            var new_nwords = (normalized_message.split(",")).length;
            var wordsAffinity = ((orginal_nwords - new_nwords) * 100) / orginal_nwords;
            var consideredAffinity;
            if (charsAffinity > wordsAffinity) {
                consideredAffinity = charsAffinity;
            } else {
                consideredAffinity = wordsAffinity;
                partial_replacement_factor = 1;
            }
            new_affinity[klt] = parseInt((consideredAffinity * non_removed_factor) / partial_replacement_factor);
            if (old_affinity.hasOwnProperty(klt)) {
                if (new_affinity[klt] > old_affinity[klt]) {
                    old_affinity[klt] = new_affinity[klt];
                }
            } else {
                old_affinity[klt] = new_affinity[klt];
            }
        }
        result.push({
            type: klt,
            affinity: parseInt(old_affinity[klt] * priority_coefficent),
            priority: priority_coefficent
        });
    }
    result.sort(function (a, b) {
        if (a.affinity > b.affinity) {
            return -1;
        }
        if (a.affinity < b.affinity) {
            return 1;
        }
        return 0;
    });
    return result;
}

function answer_remove_double_letters(normalized_message) {
    var wordList = normalized_message.split(",");
    var final_msg = "", thisWord = "";
    for (var x in wordList) {
        thisWord = wordList[x];
        var firstLetter = thisWord[0];
        var zpointer = 1;
        while (thisWord[zpointer] === firstLetter && zpointer < thisWord.length) {
            zpointer += 1;
        }
        thisWord = thisWord.slice(zpointer - 1, thisWord.length);
        zpointer = 0;
        var count_same = 0;
        var thisNewWord = "";
        while (zpointer < thisWord.length) {
            var last_char = new_char;
            var new_char = thisWord[zpointer];
            if (new_char === last_char) {
                count_same += 1;
            }
            if (new_char !== last_char || count_same < 2) {
                thisNewWord += thisWord[zpointer];
                if (count_same > 1) {
                    count_same = 0;
                }
            }
            zpointer += 1;
        }
        if (thisNewWord[thisNewWord.length - 1] === thisNewWord[thisNewWord.length - 2]) {
            thisNewWord = thisNewWord.slice(0, thisNewWord.length - 1);
        }
        final_msg += thisNewWord + ",";
    }
    return final_msg.slice(0, final_msg.length - 1);
}

function answer_getParticularAffinity(type, normalized_message) {
    switch (type) {
        case "hello":
            var old_affinity = 0;
            var splitted_message = normalized_message.split(',');
            var h = 0;
            for (var g in splitted_message) {
                h += 1;
                if (g > 1) {
                    break;
                }
                var new_affinity = answer_matchWord(type, splitted_message[g]);
                if (new_affinity > old_affinity) {
                    var wordmatch = splitted_message[g];
                    old_affinity = new_affinity;
                    break;
                }
            }
            var to_remove = "";
            if (splitted_message.length > 1) {
                to_remove = wordmatch;
            }
            return {affinity: parseInt(old_affinity / h), matched_word: wordmatch, to_remove: to_remove};
        default:
            return {affinity: 0, matched_word: ""};
    }
}
function answer_getPriorityCoefficent(kl, normalized_message) {
    var coefficent = 0.8;
    if (kl.hasOwnProperty("priority")) {
        var pr_words_non_splitted = kl.priority;
        var replaced_words = 0;
        for (var x in pr_words_non_splitted) {
            var pr_words = pr_words_non_splitted[x].split(",");
            for (var z in pr_words) {
                var pr_word_variations = answer_keywords_getAllWordVarations(pr_words[z]);
                for (var y in pr_word_variations) {
                    var new_normalized_message = answer_normalizedWordReplace(pr_word_variations[y], normalized_message);
                    if (new_normalized_message !== normalized_message) {
                        replaced_words += 1;
                        break;
                    }
                }
            }
            if (replaced_words === pr_words.length) {
                coefficent = 1.6;
                break;
            }
        }
    } else {
        coefficent = 1;
    }
    return coefficent;
}
function answer_normalizedWordReplace(replacement, normalized_message) {
    if (normalized_message !== "") {
        if (normalized_message.indexOf(",") === -1) {
            if (normalized_message === replacement) {
                normalized_message = "";
            }
        } else {
            var rep1 = new RegExp("," + replacement + ",", 'g');
            normalized_message = normalized_message.replace(rep1, ",");
            var firstCommaIndex = normalized_message.indexOf(",");
            var lastCommaIndex = normalized_message.lastIndexOf(",");
            var first_word = normalized_message.slice(0, firstCommaIndex);
            var last_word = normalized_message.slice(lastCommaIndex + 1, normalized_message.length);
            if (first_word === replacement) {
                normalized_message = normalized_message.slice(firstCommaIndex + 1, normalized_message.length);
            }
            if (last_word === replacement) {
                normalized_message = normalized_message.slice(0, lastCommaIndex);
            }
        }
    }
    return normalized_message;
}
function answer_matchWord(keyword, word) {
    var variations = answer_keywords.variations[keyword];
    var affinity = 0;
    if (variations) {
        var variationsList = (variations.split(",")).concat(keyword);
        for (var x in variationsList) {
            if (variationsList[x] === word) {
                affinity = 100;
                break;
            }
        }
    }
    return affinity;
}
function answer_keywords_getAllVariations(type) {
    return answer_keywords_all_variations[type];
}
function answer_generate_all_variations() {
    var answer_list = answer_keywords.list;
    for (var ip in answer_list) {
        var allVariations = [];
        var keywords_full = answer_list[ip].keywords;
        for (var x in keywords_full) {
            var single_keyword_splitted = (keywords_full[x]).split(",");
            var single_keyword_variations = [];
            for (var y in single_keyword_splitted) {
                single_keyword_variations.push(answer_keywords_getAllWordVarations(single_keyword_splitted[y]));
            }
            allVariations = allVariations.concat(answer_variations_allPossibleCases(single_keyword_variations));
        }
        answer_keywords_all_variations[answer_list[ip].type] = allVariations;
    }
}
function answer_variations_allPossibleCases(arr) {
    if (arr.length === 0) {
        return [];
    }
    else if (arr.length === 1) {
        return arr[0];
    }
    else {
        var result = [];
        var allCasesOfRest = answer_variations_allPossibleCases(arr.slice(1)); // recur with the rest of array
        for (var c in allCasesOfRest) {
            for (var i = 0; i < arr[0].length; i++) {
                result.push(arr[0][i] + "," + allCasesOfRest[c]);
            }
        }
        return result;
    }
}
function answer_keywords_getAllWordVarations(word) {
    var variations = [];
    if (answer_keywords.variations.hasOwnProperty(word)) {
        variations = answer_keywords.variations[word].split(",");
    }
    variations.push(word);
    return variations;
}

var answer_keywords = {
    variations: {
        are: "re,ar,is,is",
        ask: "tell,request",
        bot: "robot,software",
        buy: "buying,buy,buyng",
        bye: "bb,cya,goodbye,byebye",
        can: "could,coud,culd",
        "do": "does,do,doesn,don",
        give: "giv,gave,gve,have",
        going: "goin",
        hello: "hi,heya,hey,ola,ciao,helo,hy,ello,salut,yo,hiya",
        how: "haw,hiw,hpw",
        i: "me,im",
        is: "s",
        link: "url",
        me: "i,us",
        need: "ned,want,wanted,deserve",
        nice: "good,wanderfull,awesome,great",
        no: "nope,nop,n,nein,na,not,t,didn,nah",
        not: "t",
        of: "on,to",
        ok: "k,oki,okay,kk",
        question: "demand,request,ask",
        remember: "remembre",
        selling: "sell,sel,seling",
        site: "website,web-site,web,page,sfuminator,link",
        something: "smthing,someting,somethin",
        still: "stil,again",
        thanks: "ty,thx,thank,thankyou,thenks,thk,thnk,tty",
        the: "de,te",
        trade: "trde",
        yes: "yep,y,ya,da,yeah,sure,yep",
        you: "u,yu,ya,yo",
        your: "ur,you,yours,the",
        want: "wanted,wnat",
        wassap: "wasap,wassup",
        what: "wat,wich,whitch,witch,which",
        who: "whos,wo,whos",
        hug: "hugs,hugging"
    },
    list: [
        {
            type: "hello",
            keywords: ["hello"],
            priority: ["hello"]
        },
        {
            type: "bye",
            keywords: ["bye", "have,a,nice,day", "bye,have,a,nice,day"],
            priority: ["bye"]
        },
        {
            type: "how_are_you",
            keywords: ["how,are,you", "how,is,going", "are,you,ok", "what,is,up", "sup", "wassap"]
        },
        {
            type: "thanks",
            keywords: ["thank,you", "thanks"]
        },
        {
            type: "generic_question",
            keywords: ["can,I,ask,you,something", "I,would,like,to,ask,you,a,question", "I,want,to,ask,you,something", "I,have,a,question"],
            priority: ["ask,question"]
        },
        {
            type: "who_are_you",
            keywords: ["who,are,you", "do,i,know,you"]
        },
        {
            type: "are_you_bot",
            keywords: ["are,you,a,bot"],
            priority: ["you,bot"]
        },
        {
            type: "you_trade",
            keywords: ["trade", "can,we,trade", "shell,we,trade", "let,s,trade", "i,want,to,trade"],
            priority: ["trade"]
        },
        {
            type: "your_site",
            keywords: ["what,is,your,site", "can,give,link,of,your,site", "i,do,not,remember,your,site", "give,the,site", "can,your,give,me,site", "site"],
            priority: ["site"]
        },
        {
            type: "boolean_answer_yes",
            keywords: ["yes"],
            priority: ["yes"]
        },
        {
            type: "boolean_answer_no",
            keywords: ["no"],
            priority: ["no"]
        },
        {
            type: "are_you_there",
            keywords: ["are,you,there", "you,there", "are,you,still,there", "you,still,there"]
        },
        {
            type: "i_love_you",
            keywords: ["i,love,you", "love,you"]
        },
        {
            type: "you_sell",
            keywords: ["are,you,selling"],
            priority: ["you,selling"]
        },
        {
            type: "i_buy",
            keywords: ["i,buy", "buy"],
            priority: ["buy"]
        },
        {
            type: "you_best",
            keywords: ["you,are,the,best"],
            priority: ["you,best"]
        },
        {
            type: "help",
            keywords: ["i,need,help", "help"],
            priority: ["help"]
        },
        {
            type: "hug",
            keywords: ["i,hug,you", "hug,me"]
        }
    ]
};

//{
// message: array/function (returns 1 message)
// need_answer: boolean,
// onAnswer: function(user, type), //returns message
//}
var words_to_filter = [
    "anyway"
];
var answer_keywords_all_variations = {};
function getRandomElement(this_array) {
    return this_array[Math.floor(Math.random() * this_array.length)];
}

/**
 * @param {User} user
 * @returns {UserInteraction}
 */
BotInteractions.prototype.getInteraction = function (user) {
    for (var i = 0; i < this.interactions.length; i += 1) {
        if (this.interactions[i].getSteamid() === user.getSteamid()) {
            return this.interactions[i];
        }
    }
    var newInteraction = new UserInteraction(user);
    this.interactions.push(newInteraction);
    return newInteraction;
};

BotInteractions.prototype.resetInteraction = function (steamid) {
    for (var i = 0; i < this.interactions.length; i += 1) {
        if (this.interactions[i].getSteamid() === steamid) {
            this.interactions.splice(i, 1);
            break;
        }
    }
};

/**
 * @param {User} user
 * @constructor
 */
function UserInteraction(user) {
    this.user = user;
    this.steamid = user.getSteamid();
    this.need_answer = {
        status: false,
        type: null
    };
    this.first_greeting_happened = false;
    this.waitingForBooleanAnswerFlag = false;
    this.typeForBooleanAnswer = null;
    this.discussions = {};
    this.resetDecayingInteractions();
}

UserInteraction.newUserDeadLine = 1000 * 60 * 60 * 3; //3 Hours
UserInteraction.greetingDecay = 1000 * 60 * 60 * 3;//3 Hours

UserInteraction.prototype.getSteamid = function () {
    return this.steamid;
};

UserInteraction.prototype.waitingForBooleanAnswer = function () {
    return this.waitingForBooleanAnswerFlag;
};

UserInteraction.prototype.getTypeForBooleanAnswer = function () {
    return this.typeForBooleanAnswer;
};

UserInteraction.prototype.isBooleanAnswerAssociatedToType = function () {
    return this.typeForBooleanAnswer !== null;
};

UserInteraction.prototype.setWaitingForBooleanAnswer = function (type) {
    this.typeForBooleanAnswer = type;
    this.waitingForBooleanAnswerFlag = true;
};

UserInteraction.prototype.unsetWaitingForBooleanAnswer = function () {
    this.waitingForBooleanAnswerFlag = false;
    this.typeForBooleanAnswer = null;
};

UserInteraction.prototype.setAnswerNeed = function (type) {
    this.need_answer.status = true;
    this.need_answer.type = type;
};

UserInteraction.prototype.unsetAnswerNeed = function () {
    this.need_answer.status = false;
};

UserInteraction.prototype.isAnswerNeeded = function () {
    return this.need_answer.status;
};

UserInteraction.prototype.getAnswerType = function () {
    return this.need_answer.type;
};

/**
 * @param type
 * @returns {UserDiscussion}
 */
UserInteraction.prototype.getDiscussionFor = function (type) {
    if (!this.discussions.hasOwnProperty(type)) {
        this.discussions[type] = new UserDiscussion(type);
    }
    return this.discussions[type];
};

UserInteraction.prototype.setAsGreeted = function () {
    this.last_greeting_date = new Date();
    this.first_greeting_happened = true;
};

UserInteraction.prototype.canGreet = function () {
    return (new Date() - UserInteraction.greetingDecay) > this.getLastGreetingDate();
};

UserInteraction.prototype.getLastGreetingDate = function () {
    return this.last_greeting_date;
};

UserInteraction.prototype.isFirstGreeting = function () {
    return !this.first_greeting_happened && this.isANewUser();
};

UserInteraction.prototype.canBeRepped = function () {
    var o = this.user.getNumberOfTrades();
    return o === 0 || o === 1 || o === 10;
};

UserInteraction.prototype.isANewUser = function () {
    return this.user.getFirstLogin() > (new Date() - UserInteraction.newUserDeadLine);
};

UserInteraction.prototype.resetDecayingInteractions = function () {
    this.last_greeting_date = new Date(0);
    this.discussions = {};
};

/**
 * @param type
 * @constructor
 */
function UserDiscussion(type) {
    this.type = type;
    this.answer_date = new Date(0);
    this.hasBeenForcedOnce = false;
}

UserDiscussion.answerDecay = 1000 * 60 * 5; //5 minutes

UserDiscussion.prototype.hasBeenAnswered = function () {
    if (this.hasBeenForcedOnce) {
        this.hasBeenForcedOnce = false;
        return false;
    } else {
        return new Date() - UserDiscussion.answerDecay < this.answer_date;
    }
};

UserDiscussion.prototype.forceOnceToNotAnswered = function () {
    this.hasBeenForcedOnce = true;
};

UserDiscussion.prototype.setAsAnswered = function () {
    this.answer_date = new Date();
};

answer_generate_all_variations();