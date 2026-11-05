const spellNumElement = document.getElementById("spellNum");
const scriptUrl = document.currentScript?.src;
const spellDataUrl = scriptUrl
  ? new URL("Extras/Spells/Data/", scriptUrl)
  : new URL("Extras/Spells/Data/", document.baseURI);

async function loadJson(location) {
  const response = await fetch(new URL(location, spellDataUrl));
  if (!response.ok) {
    throw new Error(`Failed to load ${location} (${response.status})`);
  }

  return response.json();
}

async function loadSpellCount() {
  const sourceFiles = await loadJson("index.json");
  const spellLists = await Promise.all([
    ...Object.values(sourceFiles).map(loadJson),
    loadJson("Spells.json")
  ]);

  return spellLists.reduce((count, data) => {
    const spellList = Array.isArray(data) ? data : data.spell;
    if (!Array.isArray(spellList)) {
      throw new Error("Invalid spell data");
    }

    return count + spellList.length;
  }, 0);
}

if (spellNumElement) {
  loadSpellCount()
    .then(spellCount => {
      spellNumElement.textContent = `${spellCount} spells`;
    })
    .catch(error => {
      console.error("Unable to load spell count:", error);
      spellNumElement.textContent = "Unable to load spell count";
    });
}