const spellName = document.getElementById("spellName");
const spellSubtitle = document.getElementById("spellSubtitle");
const castingTime = document.getElementById("castingTime");
const spellRange = document.getElementById("spellRange");
const components = document.getElementById("components");
const duration = document.getElementById("duration");
const spellDescription = document.getElementById("spellDescription");
const higherLevels = document.getElementById("higherLevels");
const spellLists = document.getElementById("spellLists");
const spellSource = document.getElementById("spellSource");

const schoolNames = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
  V: "Evocation"
};

function formatText(value) {
  return String(value)
    .replace(/\{@(?:dice|damage|hit|chance) ([^}]+)\}/g, "$1")
    .replace(/\{@[^ ]+ ([^}]+)\}/g, "$1");
}

function formatTime(time) {
  if (typeof time === "string") return time;
  const value = time?.[0];
  return value ? `${value.number} ${value.unit}` : "";
}

function formatRange(range) {
  if (typeof range === "string") return range;
  const distance = range?.distance;
  if (!distance) return range?.type || "";
  if (distance.type === "self") return "Self";
  if (distance.type === "touch") return "Touch";
  if (distance.amount === undefined) return distance.type || "";
  return distance.amount ? `${distance.amount} ${distance.type}` : distance.type;
}

function formatDuration(duration) {
  if (typeof duration === "string") return duration;
  const value = duration?.[0];
  if (!value) return "";
  if (value.type === "instant") return "Instantaneous";
  if (value.type === "permanent") return "Permanent";

  const length = value.duration;
  return length ? `${length.amount} ${length.type}` : value.type;
}

function levelLabel(level) {
  const normalizedLevel = String(level);
  if (normalizedLevel === "0" || normalizedLevel === "Cantrip") return "Cantrip";
  if (normalizedLevel === "1") return "1st";
  if (normalizedLevel === "2") return "2nd";
  if (normalizedLevel === "3") return "3rd";
  return `${normalizedLevel}th`;
}

function formatComponents(value) {
  if (!value) return "";
  const names = [];
  if (value.v) names.push("V");
  if (value.s) names.push("S");
  if (value.m) names.push(`M (${formatText(value.m)})`);
  return names.join(", ");
}

function entryText(entry) {
  if (typeof entry === "string") return formatText(entry);
  return (entry.entries || []).map(entryText).join(" ");
}

function renderEntries(container, entries) {
  container.innerHTML = "";
  for (const entry of entries || []) {
    const paragraph = document.createElement("p");
    paragraph.textContent = entryText(entry);
    container.appendChild(paragraph);
  }
}

function normalizeSpell(spell) {
  const duration = spell.duration || [];
  const classes = Array.isArray(spell.classes)
    ? spell.classes
    : spell.classes?.fromClassList || [];
  const school = Array.isArray(spell.school)
    ? spell.school
    : [spell.school];

  return {
    ...spell,
    level: String(spell.level) === "0" ? "Cantrip" : String(spell.level),
    school: school.map(value => schoolNames[value] || value).join(", "),
    castingTime: spell.castingTime || formatTime(spell.time),
    range: formatRange(spell.range),
    duration: formatDuration(duration),
    classes: classes.map(entry => typeof entry === "string" ? entry : entry.name),
    source: spell.source || "Homebrew",
  };
}

async function loadSpellData() {
  const files = [
    "spells-phb.json",
    "spells-scag.json",
    "spells-xge.json",
    "Spells.json"
  ];
  const responses = await Promise.all(
    files.map(file => fetch(`Data/${file}`))
  );

  for (const response of responses) {
    if (!response.ok) {
      throw new Error(`Failed to load spell data (${response.status})`);
    }
  }

  const datasets = await Promise.all(responses.map(response => response.json()));
  return datasets.flatMap(dataset => {
    const spellList = Array.isArray(dataset) ? dataset : dataset.spell;
    if (!Array.isArray(spellList)) {
      throw new Error("Invalid spell data format.");
    }
    return spellList.map(normalizeSpell);
  });
}

async function displaySpell() {
  const requestedName = new URLSearchParams(window.location.search).get("name");
  if (!requestedName) throw new Error("No spell name was provided.");

  const spell = (await loadSpellData()).find(
    entry => entry.name.toLowerCase() === requestedName.toLowerCase()
  );
  if (!spell) throw new Error(`Spell not found: ${requestedName}`);

  const title = `${spell.name} - Homebrew Hub`;

  document.title = title;
  document.querySelector('meta[name="description"]').content = `${spell.name} spell details.`;
  spellName.textContent = spell.name;
  spellSubtitle.textContent = `${levelLabel(spell.level)} Level ${spell.school}`;
  castingTime.textContent = spell.castingTime;
  spellRange.textContent = spell.range;
  components.textContent = formatComponents(spell.components);
  duration.textContent = spell.duration;
  spellLists.textContent = spell.classes.join(", ");
  spellSource.textContent = spell.source;
  renderEntries(spellDescription, spell.entries);
  higherLevels.innerHTML = "";
  for (const section of spell.entriesHigherLevel || []) {
    const heading = document.createElement("p");
    const headingText = document.createElement("strong");
    headingText.textContent = `${section.name || "At Higher Levels"}.`;
    heading.appendChild(headingText);
    higherLevels.appendChild(heading);
    for (const entry of section.entries || []) {
      const paragraph = document.createElement("p");
      paragraph.textContent = entryText(entry);
      higherLevels.appendChild(paragraph);
    }
  }
}

displaySpell().catch(error => {
  console.error(error);
  spellName.textContent = "Spell unavailable";
  spellDescription.textContent = "There was a problem loading this spell.";
});
