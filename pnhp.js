let spells = [];
let spellNum = 0;

const spellNumElement = document.getElementById("spellNum");
// Resolve the data path from this script's location so pages in subfolders work too
const spellsUrl = new URL("Extras/Spells/Data/Spells.json", document.currentScript.src);

async function loadSpells() {
  try {
    const response = await fetch(spellsUrl);

    if (!response.ok) {
      throw new Error(`Failed to load spells.json (${response.status})`);
    }

    spells = await response.json();
    spellNum = spells.length;
  } catch (error) {
    console.error(error);
    resultsCount.textContent = "Failed to load spells.";
    noResults.hidden = false;
    noResults.textContent = "There was a problem loading the spell list.";
  }
}

loadSpells().then(() => {
  if (spellNumElement) {
    spellNumElement.textContent = `${spellNum} spells`;
  }
});