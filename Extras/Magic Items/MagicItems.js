const searchInput = document.getElementById("searchInput");
const rarityFilter = document.getElementById("rarityFilter");
const attunementFilter = document.getElementById("attunementFilter");
const clearFiltersBtn = document.getElementById("clearFilters");
const tableBody = document.getElementById("itemsTableBody");
const resultsCount = document.getElementById("resultsCount");
const noResults = document.getElementById("noResults");

let items = [];

function yesNo(value) {
  return value ? "Yes" : "No";
}

function normalize(text) {
  return String(text).toLowerCase().trim();
}

function renderTableRows(itemList) {
  tableBody.innerHTML = "";

  if (itemList.length === 0) {
    noResults.hidden = false;
    resultsCount.textContent = "Showing 0 magic items";
    return;
  }

  noResults.hidden = true;
  resultsCount.textContent = `Showing ${itemList.length} magic item${itemList.length === 1 ? "" : "s"}`;

  for (const item of itemList) {
    const row = document.createElement("tr");

    const effectNames = Object.keys(item.specialEffects).join(", ");

    row.innerHTML = `
      <td><a href="${item.url}">${item.name}</a></td>
      <td>${item.rarity}</td>
      <td>${item.description !== "null" ? item.description : "—"}</td>
      <td>${effectNames}</td>
      <td>${yesNo(item.attunement)}</td>
    `;

    tableBody.appendChild(row);
  }
}

function getFilteredItems() {
  const search = normalize(searchInput.value);
  const selectedRarity = rarityFilter.value;
  const selectedAttunement = attunementFilter.value;

  return items.filter(item => {
    const matchesSearch =
      !search ||
      normalize(item.name).includes(search) ||
      normalize(item.description).includes(search) ||
      Object.keys(item.specialEffects).some(k => normalize(k).includes(search)) ||
      Object.values(item.specialEffects).some(v => normalize(v).includes(search));

    const matchesRarity =
      !selectedRarity ||
      item.rarity === selectedRarity;

    const matchesAttunement =
      !selectedAttunement ||
      String(item.attunement) === selectedAttunement;

    return matchesSearch && matchesRarity && matchesAttunement;
  });
}

function sortItems(itemList) {
  return [...itemList].sort((a, b) => {
    // Primary sort: rarity order
    const rarityOrder = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"];
    const rarityDiff = rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
    if (rarityDiff !== 0) return rarityDiff;

    // Secondary sort: alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

function updateTable() {
  const filtered = getFilteredItems();
  const sorted = sortItems(filtered);
  renderTableRows(sorted);
}

function clearFilters() {
  searchInput.value = "";
  rarityFilter.value = "";
  attunementFilter.value = "";
  updateTable();
}

async function loadItems() {
  try {
    const response = await fetch("Data/MagicItems.json");

    if (!response.ok) {
      throw new Error(`Failed to load MagicItems.json (${response.status})`);
    }

    items = await response.json();
    updateTable();
  } catch (error) {
    console.error(error);
    resultsCount.textContent = "Failed to load magic items.";
    noResults.hidden = false;
    noResults.textContent = "There was a problem loading the magic item list.";
  }
}

searchInput.addEventListener("input", updateTable);
rarityFilter.addEventListener("change", updateTable);
attunementFilter.addEventListener("change", updateTable);
clearFiltersBtn.addEventListener("click", clearFilters);

loadItems();