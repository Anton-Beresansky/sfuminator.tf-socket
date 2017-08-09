module.exports = new TF2Constants();

function TF2Constants() {

    this.defindexes = {
        ScrapMetal: 5000,
        ReclaimedMetal: 5001,
        RefinedMetal: 5002,
        MannCoKey: 5021
    };

    this.namedQualities = [
        "Normal", "Genuine", "rarity2", "Vintage", "rarity3",
        "Unusual", "Unique", "Community", "Valve", "Self-Made",
        "Customized", "Strange", "Completed", "Haunted",
        "Collector's", "Decorated Weapon"
    ];

    this.namedDecoratedWearings = [
        "Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle Scarred"
    ];

    this.namedDecoratedGrade = [
        "Civilian Grade",
        "Freelance Grade",
        "Mercenary Grade",
        "Commando Grade",
        "Assassin Grade",
        "Elite Grade"
    ];
    
    this.classes = [
        "Scout",
        "Demoman",
        "Pyro",
        "Sniper",
        "Spy",
        "Heavy",
        "Soldier",
        "Engineer",
        "Medic"
    ];

    this.quality = {
        Normal: 0,
        Genuine: 1,
        rarity2: 2,
        Vintage: 3,
        rarity3: 4,
        Unusual: 5,
        Unique: 6,
        Community: 7,
        Valve: 8,
        SelfMade: 9,
        Customized: 10,
        Strange: 11,
        Completed: 12,
        Haunted: 13,
        Collectors: 14,
        DecoratedWeapon: 15
    };

    this.decoratedWearAttribute = {
        "Factory New": 0.2,
        "Minimal Wear": 0.4,
        "Field-Tested": 0.6,
        "Well-Worn": 0.8,
        "Battle Scarred": 1
    };

    this.decoratedGrade = {
        common: 0,
        uncommon: 1,
        rare: 2,
        mythical: 3,
        legendary: 4,
        ancient: 5
    };

    this.attributeDefindexes = {
        Australium: 2027,
        Paint: 142,
        Particle: 134,
        DecoratedWear: 725
    };
}