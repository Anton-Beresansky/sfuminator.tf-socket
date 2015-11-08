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
}