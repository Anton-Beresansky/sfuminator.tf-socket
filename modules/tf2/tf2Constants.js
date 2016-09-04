module.exports = new TF2Constants();

function TF2Constants() {

    this.defindexes = {
        ScrapMetal: 5000,
        ReclaimedMetal: 5001,
        RefinedMetal: 5002,
        MannCoKey: 5021
    };

    this.qualities = [
        "Normal", "Genuine", "rarity2", "Vintage", "rarity3",
        "Unusual", "Unique", "Community", "Valve", "Self-Made",
        "Customized", "Strange", "Completed", "Haunted",
        "Collector's", "Decorated Weapon"
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

    this.attributeDefindexes = {
        Australium: 2027,
        Paint: 142,
        Particle: 134
    };
}