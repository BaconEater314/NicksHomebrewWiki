function Roll1d6() {
    let roll = Math.floor(Math.random() * 6) + 1;
    let attempts = 1;
    while (roll === 1) {
        roll = Math.floor(Math.random() * 6) + 1;
        attempts++;
    }
    return { value: roll, attempts };
}

function RollStat() {
    // Roll 4 six-sided dice
    let rolls = [];
    let totalRerolls = 0;

    for (let i = 0; i < 4; i++) {
        let currentRoll = Roll1d6();
        rolls.push(currentRoll);
        totalRerolls += (currentRoll.attempts - 1);
    }

    // Sort descending based on the die value to easily drop the lowest
    rolls.sort((a, b) => b.value - a.value);

    // Grab the top three and isolate the dropped one
    let topThree = rolls.slice(0, 3);
    let dropped = rolls[3];

    // Sum the top three dice values
    let stat = topThree.reduce((sum, roll) => sum + roll.value, 0);

    return { stat, dropped: dropped.value, totalRerolls };
}

function RollCharacterStats() {
    const abilities = [
        { key: "str", label: "STR" },
        { key: "dex", label: "DEX" },
        { key: "con", label: "CON" },
        { key: "int", label: "INT" },
        { key: "wis", label: "WIS" },
        { key: "cha", label: "CHA" }
    ];

    let logLines = [];

    abilities.forEach(({ key, label }) => {
        const { stat, totalRerolls } = RollStat();
        setAbilityScore(key, stat);

        const rerollNote = totalRerolls > 0
            ? ` (${totalRerolls} reroll${totalRerolls > 1 ? "s" : ""})`
            : "";
        logLines.push(`${label}: ${stat}${rerollNote}`);
    });

    text.textContent = logLines.join("   ·   ");
}

const button = document.getElementById("RollStats");
const text = document.getElementById("result");
button.addEventListener("click", RollCharacterStats);