// Cyberpunk version of the initiative tracker (see initiative.js for the D&D one)
//
// Each entry: { id, name, initiative, isPlayer, isBoss, isVehicle,
//               hp: [number|null, ...], spHead: [number|null, ...], spBody: [number|null, ...] }
// hp holds one value per creature in the group (3 gangers -> 3 values). For vehicles it's their SDP.
// Player characters have a single hp value, which is null when no HP was entered
// spHead / spBody hold stopping power per individual; null means none was entered (counts as 0)
// Vehicles only have one SP, kept in spBody (their spHead is unused)
// Regular enemies also get identifiers: one optional note per individual ("red jacket", "on the left")
// Non-players keep selected: one flag per individual, marking who the next "Apply Damage" hits
// Enemies (not players or vehicles) carry quickInfo: [{ evasion, combat, move }, ...] and
// canDodge: [bool, ...], one entry per individual so each one can be tweaked on its own
// Bosses are always a single enemy and get their own tag and colour so they stand out
//
// Everyone also gets, per individual:
//   maxHp:  the HP they started with (null until a player enters some), used for wound thresholds
//   status: { ignoreSerious, ignoreMortal, fire, open } - the status effects dropdown
//   crits:  { deathSavePenalty, open, headOpen, active: { critKey: bool | "none"/"right"/"left" } }
//           - the Body Crits and Head Crits dropdowns (see BODY_CRITS / HEAD_CRITS)
// Seriously / Mortally Wounded aren't stored; they're worked out from HP vs maxHp every time
let creatures = [];
let nextId = 1;

// Combat state: currentId is the creature whose turn it is (null = not in combat)
// When that creature is in a player group, the whole group is up
let currentId = null;
let round = 1;

// End-of-turn effects (like burning) from the last "Next" click, shown in the combat bar
let turnNote = "";

// HP lost at the end of a turn while on fire, by fire level
const FIRE_LEVELS = {
    none: { label: "None", damage: 0 },
    light: { label: "Light", damage: 2 },
    strong: { label: "Strong", damage: 4 },
    deadly: { label: "Deadly", damage: 6 }
};

// How much each wound state lowers Combat and Evasion base
const WOUND_PENALTY = { serious: 2, mortal: 4 };

// Critical injuries in the Body Crits / Head Crits dropdowns. Each one can have:
//   side:      "hand", "arm", "eye" or "ear" - picked from a Right/Left dropdown. Shown as a
//              notice between the HP/SP stats and Combat/Evasion/MOVE while active, unless
//              the crit already shows up as a combat note or a MOVE warning
//   move:      how much MOVE drops (all of them stack, but MOVE never goes below 1)
//   deathSave: how much the Death Save Penalty goes up
//   noDodge:   can't dodge bullets while this is active
//   hurts:     shows a warning with a button that deals HURT_DAMAGE straight to HP
//   combatNote: a reminder shown under Combat base (or with the notices for players)
//   statPenalty: how much Combat and Evasion base drop (stacks with wounds and other crits)
//   moveWarning: shows a warning under MOVE (no damage button)
//   warningLabel: name to use in warnings when the label alone is ambiguous
//   headshotMultiplier: headshots multiply damage that gets through by this instead of 2
//   replaces:  keys of lesser side crits this one rules out on the same side (a lost eye
//              can't also be damaged); picking a side clears them there and blocks them
const BODY_CRITS = [
    { key: "dismemberedLeg", label: "Dismembered Leg", move: 6, deathSave: 1, noDodge: true },
    { key: "crushedFingers", label: "Crushed Fingers", side: "hand" },
    { key: "spinalInjury", label: "Spinal Injury", deathSave: 1 },
    { key: "tornMuscle", label: "Torn Muscle", side: "arm" },
    { key: "brokenLeg", label: "Broken Leg", move: 4 },
    { key: "foreignObject", label: "Foreign Object", hurts: true, warningLabel: "Foreign Object (body)" },
    { key: "brokenArm", label: "Broken Arm", side: "arm" },
    { key: "brokenRibs", label: "Broken Ribs", hurts: true },
    { key: "collapsedLung", label: "Collapsed Lung", move: 2, deathSave: 1 },
    { key: "dismemberedHand", label: "Dismembered Hand", side: "hand", deathSave: 1, replaces: ["crushedFingers"] },
    { key: "dismemberedArm", label: "Dismembered Arm", side: "arm", deathSave: 1, replaces: ["tornMuscle", "brokenArm", "dismemberedHand", "crushedFingers"] }
];

const HEAD_CRITS = [
    { key: "lostEye", label: "Lost Eye", side: "eye", deathSave: 1, combatNote: "-4 to Ranged Attacks", replaces: ["damagedEye"] },
    { key: "brainInjury", label: "Brain Injury", deathSave: 1, statPenalty: 2 },
    { key: "damagedEye", label: "Damaged Eye", side: "eye", combatNote: "-2 to Ranged Attacks" },
    { key: "concussion", label: "Concussion", statPenalty: 2 },
    { key: "brokenJaw", label: "Broken Jaw" },
    { key: "headForeignObject", label: "Foreign Object", hurts: true, warningLabel: "Foreign Object (head)" },
    { key: "whiplash", label: "Whiplash", deathSave: 1 },
    { key: "crackedSkull", label: "Cracked Skull", deathSave: 1, headshotMultiplier: 3 },
    { key: "damagedEar", label: "Damaged Ear", side: "ear", moveWarning: true },
    { key: "crushedWindpipe", label: "Crushed Windpipe", deathSave: 1 },
    { key: "lostEar", label: "Lost Ear", side: "ear", moveWarning: true, deathSave: 1, replaces: ["damagedEar"] }
];

const ALL_CRITS = [...BODY_CRITS, ...HEAD_CRITS];

const HURT_DAMAGE = 5;

// A fresh crits record for one individual: side crits start at "none", the rest at false
function createCrits()
{
    const active = {};

    for (const crit of ALL_CRITS)
    {
        active[crit.key] = crit.side ? "none" : false;
    }

    return { deathSavePenalty: 0, open: false, headOpen: false, active: active };
}

const form = document.getElementById("creatureForm");
const list = document.getElementById("initiativeList");
const combatButton = document.getElementById("combatButton");
const roundDisplay = document.getElementById("roundDisplay");
const playerCheckbox = document.getElementById("creatureIsPlayer");
const hpInput = document.getElementById("creatureHp");
const hpLabel = document.getElementById("creatureHpLabel");
const amountInput = document.getElementById("creatureAmount");
const spHeadField = document.getElementById("spHeadField");
const spHeadInput = document.getElementById("creatureSpHead");
const spBodyInput = document.getElementById("creatureSpBody");
const spBodyLabel = document.getElementById("creatureSpBodyLabel");
const groupPlayersCheckbox = document.getElementById("groupPlayers");
const bossCheckbox = document.getElementById("creatureIsBoss");
const vehicleCheckbox = document.getElementById("creatureIsVehicle");
const quickInfoFields = document.getElementById("quickInfoFields");
const evasionInput = document.getElementById("creatureEvasion");
const combatInput = document.getElementById("creatureCombat");
const moveInput = document.getElementById("creatureMove");
const dodgeCheckbox = document.getElementById("creatureCanDodge");
const turnNoteDisplay = document.getElementById("turnNote");

// Blank number boxes become null; stats like SP can't go below 0
function parseOptional(input)
{
    const value = parseInt(input.value);
    return isNaN(value) ? null : Math.max(0, value);
}

form.addEventListener("submit", function (event)
{
    event.preventDefault();

    const name = document.getElementById("creatureName").value.trim();
    // Initiative can be a decimal so ties can be broken by hand (e.g. 15.5 goes before 15)
    const initiative = parseFloat(document.getElementById("creatureInitiative").value);
    const isPlayer = playerCheckbox.checked;
    const hp = parseInt(hpInput.value);
    const amount = parseInt(amountInput.value);
    const spHead = parseOptional(spHeadInput);
    const spBody = parseOptional(spBodyInput);
    const isBoss = bossCheckbox.checked;
    const isVehicle = vehicleCheckbox.checked;

    if (!name || isNaN(initiative))
    {
        return;
    }

    if (!isPlayer && (isNaN(hp) || isNaN(amount) || amount < 1))
    {
        return;
    }

    // Vehicles must have SDP (checked above) and SP
    if (isVehicle && spBody === null)
    {
        return;
    }

    const count = isPlayer || isBoss ? 1 : amount;

    const creature = {
        id: nextId++,
        name: name,
        initiative: initiative,
        isPlayer: isPlayer,
        isBoss: isBoss,
        isVehicle: isVehicle,
        hp: Array(count).fill(isNaN(hp) ? null : hp),
        maxHp: Array(count).fill(isNaN(hp) ? null : hp),
        spHead: Array(count).fill(isVehicle ? null : spHead),
        spBody: Array(count).fill(spBody),
        status: Array.from({ length: count }, () => ({
            ignoreSerious: false,
            ignoreMortal: false,
            fire: "none",
            open: false
        })),
        crits: Array.from({ length: count }, createCrits)
    };

    if (!isPlayer)
    {
        creature.selected = Array(count).fill(false);
        creature.damageOptions = { location: "body", armorPiercing: false, rubber: false };
    }

    if (!isPlayer && !isBoss)
    {
        creature.identifiers = Array(count).fill("");
    }

    if (!isPlayer && !isVehicle)
    {
        // The form values are the starting point; each individual can be edited separately after
        const evasion = parseOptional(evasionInput);
        const combat = parseOptional(combatInput);
        const move = parseOptional(moveInput);

        creature.quickInfo = Array.from({ length: count }, () => ({ evasion, combat, move }));
        creature.canDodge = Array(count).fill(dodgeCheckbox.checked);
    }

    creatures.push(creature);

    form.reset();
    amountInput.value = 1;
    updateTypeFields();
    document.getElementById("creatureName").focus();

    render();
});

// HP is optional for players, players and bosses are always a single creature, vehicles swap
// HP/SP for SDP and a single required SP, and the extra field groups only show when they apply
function updateTypeFields()
{
    const isPlayer = playerCheckbox.checked;
    const isBoss = bossCheckbox.checked;
    const isVehicle = vehicleCheckbox.checked;

    hpInput.required = !isPlayer;
    hpInput.placeholder = isPlayer ? "Optional" : "";
    hpLabel.textContent = isVehicle ? "SDP" : "HP";
    amountInput.disabled = isPlayer || isBoss;
    amountInput.required = !amountInput.disabled;

    if (amountInput.disabled)
    {
        amountInput.value = 1;
    }

    spHeadField.hidden = isVehicle;
    spBodyLabel.textContent = isVehicle ? "SP" : "SP (Body)";
    spBodyInput.required = isVehicle;
    spBodyInput.placeholder = isVehicle ? "" : "Optional";
    spHeadInput.placeholder = "Optional";

    // A player can't be a boss or a vehicle, and a boss or vehicle can't be a player
    playerCheckbox.disabled = isBoss || isVehicle;
    bossCheckbox.disabled = isPlayer;
    vehicleCheckbox.disabled = isPlayer;

    quickInfoFields.hidden = isPlayer || isVehicle;
}

playerCheckbox.addEventListener("change", updateTypeFields);
bossCheckbox.addEventListener("change", updateTypeFields);
vehicleCheckbox.addEventListener("change", updateTypeFields);
groupPlayersCheckbox.addEventListener("change", render);

document.getElementById("clearButton").addEventListener("click", function ()
{
    creatures = [];
    endCombat();
});

combatButton.addEventListener("click", function ()
{
    if (currentId === null)
    {
        startCombat();
    }
    else
    {
        endCombat();
    }
});

function sortCreatures()
{
    // Highest initiative goes first, and players win ties against non-players
    creatures.sort((a, b) => b.initiative - a.initiative || b.isPlayer - a.isPlayer);
}

// Splits the initiative order into turns. Normally each creature is its own turn, but in
// combat with grouping on, players who go back to back share a single turn.
function getTurns()
{
    const grouping = currentId !== null && groupPlayersCheckbox.checked;
    const turns = [];

    for (const creature of creatures)
    {
        const lastTurn = turns[turns.length - 1];

        if (grouping && creature.isPlayer && lastTurn && lastTurn[0].isPlayer)
        {
            lastTurn.push(creature);
        }
        else
        {
            turns.push([creature]);
        }
    }

    return turns;
}

function findTurnIndex(turns, id)
{
    return turns.findIndex(turn => turn.some(c => c.id === id));
}

function startCombat()
{
    if (creatures.length === 0)
    {
        return;
    }

    sortCreatures();
    round = 1;
    currentId = creatures[0].id;
    render();
}

function endCombat()
{
    currentId = null;
    round = 1;
    turnNote = "";
    render();
}

// Moves to the turn after the one holding the given creature, wrapping to the top for a new round
function advanceFrom(id)
{
    const turns = getTurns();
    const index = findTurnIndex(turns, id);

    if (index === turns.length - 1)
    {
        currentId = turns[0][0].id;
        round++;
    }
    else
    {
        currentId = turns[index + 1][0].id;
    }
}

// "Name 2 (red jacket)" for someone in a group, just "Name" for a single creature
function individualName(creature, index)
{
    if (creature.hp.length === 1)
    {
        return creature.name;
    }

    const identifier = creature.identifiers ? creature.identifiers[index].trim() : "";
    return `${creature.name} ${index + 1}${identifier ? ` (${identifier})` : ""}`;
}

// Anyone on fire when their turn ends loses HP straight off (armor doesn't help)
function burnAtEndOfTurn(creature)
{
    const notes = [];

    creature.status.forEach((status, index) =>
    {
        const damage = FIRE_LEVELS[status.fire].damage;
        const hp = creature.hp[index];

        if (damage === 0 || hp === null || hp <= 0)
        {
            return;
        }

        creature.hp[index] = Math.max(0, hp - damage);
        notes.push(`${individualName(creature, index)} burned for ${hp - creature.hp[index]}.`);
    });

    return notes;
}

function nextTurn()
{
    const turns = getTurns();
    const endingTurn = turns[findTurnIndex(turns, currentId)];

    turnNote = endingTurn.flatMap(burnAtEndOfTurn).join(" ");

    advanceFrom(currentId);
    render();
}

function removeCreature(id)
{
    if (currentId !== null)
    {
        const turns = getTurns();
        const currentTurn = turns[findTurnIndex(turns, currentId)];

        if (currentTurn.some(c => c.id === id))
        {
            if (currentTurn.length > 1)
            {
                // Someone else in the player group keeps the turn
                currentId = currentTurn.find(c => c.id !== id).id;
            }
            else if (turns.length === 1)
            {
                currentId = null;
                round = 1;
            }
            else
            {
                advanceFrom(id);
            }
        }
    }

    creatures = creatures.filter(c => c.id !== id);
    render();
}

function renderCombatBar()
{
    const inCombat = currentId !== null;

    combatButton.textContent = inCombat ? "End Combat" : "Start Combat";
    combatButton.classList.toggle("initiative-btn-secondary", inCombat);
    combatButton.disabled = !inCombat && creatures.length === 0;

    roundDisplay.textContent = inCombat ? `Round ${round}` : "Not in combat";
    roundDisplay.classList.toggle("active", inCombat);

    turnNoteDisplay.textContent = turnNote;
    turnNoteDisplay.hidden = turnNote === "";
}

// Editable initiative for one creature; the list re-sorts once the edit is committed
function createInitiativeInput(creature, className)
{
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.className = `${className} initiative-input`;
    input.value = creature.initiative;
    input.title = "Edit initiative";
    input.setAttribute("aria-label", `Initiative for ${creature.name}`);

    const fitText = () => input.classList.toggle("long", input.value.length > 2);
    fitText();
    input.addEventListener("input", fitText);

    input.addEventListener("change", () =>
    {
        const value = parseFloat(input.value);

        if (!isNaN(value))
        {
            creature.initiative = value;
        }

        render();
    });

    input.addEventListener("keydown", event =>
    {
        if (event.key === "Enter")
        {
            input.blur();
        }
    });

    return input;
}

function createInitiativeBadge(value)
{
    const badge = document.createElement("span");
    badge.className = "initiative";
    badge.textContent = value;
    return badge;
}

function createRemoveButton(id)
{
    const removeButton = document.createElement("button");
    removeButton.className = "creature-remove";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => removeCreature(id));
    return removeButton;
}

function createNextButton()
{
    const nextButton = document.createElement("button");
    nextButton.className = "creature-next";
    nextButton.type = "button";
    nextButton.textContent = "Next →";
    nextButton.addEventListener("click", nextTurn);
    return nextButton;
}

function createTag(text, className)
{
    const tag = document.createElement("span");
    tag.className = `creature-tag ${className}`;
    tag.textContent = text;
    return tag;
}

// A labelled number input for one stat (HP, SP, ...); onChange gets the parsed value (NaN when blank)
function createStatField(labelText, value, onChange)
{
    const field = document.createElement("label");
    field.className = "stat-field";

    const label = document.createElement("span");
    label.className = "stat-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "number";
    input.value = value === null ? "" : value;
    input.placeholder = "—";

    // Save edits back so they survive re-renders
    input.addEventListener("input", () => onChange(parseInt(input.value)));

    field.append(label, input);
    return field;
}

// Editable stat that can't go below 0; blank saves as null
function createNonNegativeField(labelText, values, index, className)
{
    const field = createStatField(labelText, values[index], value =>
    {
        if (value < 0)
        {
            value = 0;
            input.value = 0;
        }

        values[index] = isNaN(value) ? null : value;
    });
    field.classList.add(className);

    const input = field.querySelector("input");
    input.min = 0;
    return field;
}

function createSpFields(creature, index)
{
    if (creature.isVehicle)
    {
        return [createNonNegativeField("SP", creature.spBody, index, "stat-sp")];
    }

    return [
        createNonNegativeField("SP H", creature.spHead, index, "stat-sp"),
        createNonNegativeField("SP B", creature.spBody, index, "stat-sp")
    ];
}

// onHpChange runs after every edit so wound states and penalties can update live
function createHpField(creature, index, box, onHpChange)
{
    const isDown = () => creature.hp[index] !== null && creature.hp[index] <= 0;

    const field = createStatField(creature.isVehicle ? "SDP" : "HP", creature.hp[index], value =>
    {
        // Players can leave HP blank; everyone else treats a blank as 0
        creature.hp[index] = isNaN(value) ? (creature.isPlayer ? null : 0) : value;
        box.classList.toggle("down", isDown());

        if (onHpChange)
        {
            onHpChange();
        }
    });
    field.classList.add("stat-hp");

    // A player added without HP starts tracking wounds from the first HP they get.
    // This waits for the edit to be committed so typing "35" doesn't lock in 3.
    field.querySelector("input").addEventListener("change", () =>
    {
        if (creature.maxHp[index] === null && creature.hp[index] !== null && creature.hp[index] > 0)
        {
            creature.maxHp[index] = creature.hp[index];

            if (onHpChange)
            {
                onHpChange();
            }
        }
    });

    box.classList.toggle("down", isDown());
    return field;
}

// "mortal" at 0 HP, "serious" at or below half of starting HP, otherwise null.
// Mortally Wounded replaces Seriously Wounded rather than stacking with it.
// Vehicles take SDP damage, not wounds.
function getWoundState(creature, index)
{
    const hp = creature.hp[index];
    const maxHp = creature.maxHp[index];

    if (creature.isVehicle || hp === null)
    {
        return null;
    }

    if (hp <= 0)
    {
        return "mortal";
    }

    if (maxHp !== null && hp <= maxHp / 2)
    {
        return "serious";
    }

    return null;
}

function isWoundIgnored(creature, index, wound)
{
    const status = creature.status[index];
    return wound === "mortal" ? status.ignoreMortal : status.ignoreSerious;
}

// How much Combat and Evasion base are lowered right now
function getWoundPenalty(creature, index)
{
    const wound = getWoundState(creature, index);

    if (wound === null || isWoundIgnored(creature, index, wound))
    {
        return 0;
    }

    return WOUND_PENALTY[wound];
}

function isCritActive(creature, index, crit)
{
    const value = creature.crits[index].active[crit.key];
    return crit.side ? value !== "none" : value === true;
}

function getActiveCrits(creature, index)
{
    return ALL_CRITS.filter(crit => isCritActive(creature, index, crit));
}

// MOVE after crits; reductions stack but never take it below 1 (or raise a MOVE already under 1)
function getEffectiveMove(creature, index)
{
    const move = creature.quickInfo[index].move;
    const reduction = getActiveCrits(creature, index).reduce((total, crit) => total + (crit.move || 0), 0);

    if (move === null || reduction === 0)
    {
        return move;
    }

    return Math.min(move, Math.max(1, move - reduction));
}

// The editable base penalty plus whatever the active crits add
function getDeathSavePenalty(creature, index)
{
    const crits = creature.crits[index];
    return getActiveCrits(creature, index).reduce((total, crit) => total + (crit.deathSave || 0), crits.deathSavePenalty);
}

function canDodgeNow(creature, index)
{
    return creature.canDodge[index] && !getActiveCrits(creature, index).some(crit => crit.noDodge);
}

// "Crushed Fingers (right hand)", or just the label for crits without a side
function describeSideCrit(creature, index, crit)
{
    if (!crit.side)
    {
        return crit.label;
    }

    return `${crit.label} (${creature.crits[index].active[crit.key]} ${crit.side})`;
}

// Total drop to Combat and Evasion base: the wound penalty plus any crits that lower them
function getStatPenalty(creature, index)
{
    const critPenalty = getActiveCrits(creature, index).reduce((total, crit) => total + (crit.statPenalty || 0), 0);
    return getWoundPenalty(creature, index) + critPenalty;
}

// What headshots multiply damage by (2 normally, more with something like Cracked Skull)
function getHeadshotMultiplier(creature, index)
{
    return getActiveCrits(creature, index).reduce((multiplier, crit) => Math.max(multiplier, crit.headshotMultiplier || 2), 2);
}

// Green TRUE / red FALSE switch for whether this individual can dodge bullets
function createDodgeToggle(creature, index)
{
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dodge-toggle";
    button.title = "Can dodge bullets (click to change)";

    // A crit like Dismembered Leg forces it off; the saved choice comes back once the crit is gone
    const locked = getActiveCrits(creature, index).some(crit => crit.noDodge);

    if (locked)
    {
        button.disabled = true;
        button.title = "Can't dodge bullets because of a body crit";
    }

    const update = () =>
    {
        const canDodge = canDodgeNow(creature, index);
        button.classList.toggle("can-dodge", canDodge);
        button.textContent = canDodge ? "Dodge: TRUE" : "Dodge: FALSE";
        button.setAttribute("aria-pressed", canDodge);
    };

    button.addEventListener("click", () =>
    {
        creature.canDodge[index] = !creature.canDodge[index];
        update();
    });

    update();
    return button;
}

// One individual's Evasion, Combat and MOVE. The inputs hold the base values; when a wound or
// crit is lowering them, the number they actually use shows beside the input.
// Returns { elements, refresh } so HP changes can update the shown penalty.
function createQuickInfoFields(creature, index)
{
    const info = creature.quickInfo[index];
    const elements = [];
    const refreshers = [];

    const woundAdjusted = key => Math.max(0, info[key] - getStatPenalty(creature, index));

    // getEffective returns the value after penalties
    const addField = (labelText, key, getEffective) =>
    {
        const field = createStatField(labelText, info[key], value =>
        {
            if (value < 0)
            {
                value = 0;
                input.value = 0;
            }

            info[key] = isNaN(value) ? null : value;
            refreshEffective();
        });
        field.classList.add("stat-quick");

        const input = field.querySelector("input");
        input.min = 0;

        const effective = document.createElement("span");
        effective.className = "stat-effective";
        effective.title = "After penalties";
        field.appendChild(effective);

        const refreshEffective = () =>
        {
            const value = info[key] === null ? null : getEffective();
            const show = value !== null && value !== info[key];

            effective.hidden = !show;
            effective.textContent = show ? `→ ${value}` : "";
            field.classList.toggle("penalized", show);
        };

        refreshEffective();
        refreshers.push(refreshEffective);
        elements.push(field);
    };

    addField("EVA", "evasion", () => woundAdjusted("evasion"));
    addField("COM", "combat", () => woundAdjusted("combat"));

    // Crit reminders that apply to attacks (like Lost Eye) sit right under Combat base
    for (const crit of getActiveCrits(creature, index).filter(crit => crit.combatNote))
    {
        elements.push(createCombatNote(creature, index, crit));
    }

    addField("MOVE", "move", () => getEffectiveMove(creature, index));

    return { elements, refresh: () => refreshers.forEach(fn => fn()) };
}

// "Lost Eye: -4 to Ranged Attacks" / "Damaged Eye (left eye): -2 to Ranged Attacks"
function createCombatNote(creature, index, crit)
{
    const note = document.createElement("span");
    note.className = "crit-combat-note";
    note.textContent = `${describeSideCrit(creature, index, crit)}: ${crit.combatNote}`;
    return note;
}

// One condition line in the status dropdown: a checkbox that HP drives, plus an Ignore box
function createWoundRow(creature, index, wound, labelText, onChange)
{
    const row = document.createElement("div");
    row.className = "status-row";

    const applied = document.createElement("label");
    applied.className = "status-name";

    const appliedBox = document.createElement("input");
    appliedBox.type = "checkbox";
    appliedBox.disabled = true;
    appliedBox.title = "Applied automatically from HP";

    const name = document.createElement("span");
    name.textContent = labelText;

    applied.append(appliedBox, name);

    const detail = document.createElement("span");
    detail.className = "status-detail";

    const ignore = document.createElement("label");
    ignore.className = "status-ignore";

    const ignoreBox = document.createElement("input");
    ignoreBox.type = "checkbox";
    ignoreBox.checked = isWoundIgnored(creature, index, wound);
    ignoreBox.addEventListener("change", () =>
    {
        const status = creature.status[index];

        if (wound === "mortal")
        {
            status.ignoreMortal = ignoreBox.checked;
        }
        else
        {
            status.ignoreSerious = ignoreBox.checked;
        }

        onChange();
    });

    ignore.append(ignoreBox, " Ignore");
    row.append(applied, detail, ignore);

    const refresh = () =>
    {
        const active = getWoundState(creature, index) === wound;
        const penalty = creature.quickInfo ? `-${WOUND_PENALTY[wound]} Combat & Evasion` : "";
        const maxHp = creature.maxHp[index];

        appliedBox.checked = active;
        row.classList.toggle("active", active);
        row.classList.toggle("ignored", active && ignoreBox.checked);

        const threshold = wound === "mortal"
            ? "At 0 HP"
            : (maxHp === null ? "" : `At ${Math.floor(maxHp / 2)} HP or less`);

        detail.textContent = [threshold, penalty].filter(Boolean).join(". ");
    };

    return { row, refresh };
}

// The death save tracker that opens while Mortally Wounded.
// Shows the current Death Save Penalty with a button to raise it (it's the same base value
// as the Death Save Penalty box, so the whole list re-renders to keep both in sync).
function createDeathSaves(creature, index)
{
    const deathSaves = document.createElement("div");
    deathSaves.className = "death-saves";

    const title = document.createElement("span");
    title.className = "death-saves-title";
    title.textContent = "Death Saves";

    const penalty = document.createElement("span");
    penalty.className = "death-saves-penalty";

    const increase = document.createElement("button");
    increase.type = "button";
    increase.className = "death-saves-btn";
    increase.textContent = "+1";
    increase.title = "Increase Death Save Penalty";
    increase.setAttribute("aria-label", `Increase Death Save Penalty for ${individualName(creature, index)}`);
    increase.addEventListener("click", () =>
    {
        creature.crits[index].deathSavePenalty++;
        render();
    });

    deathSaves.append(title, penalty, increase);
    return { element: deathSaves, penalty: penalty };
}

// The editable Death Save Penalty. The input is the base; the total with crits shows beside it.
// Crits re-render the whole list when they change, so only edits to the base need onChange
// (it keeps the Death Saves box in the status dropdown in sync).
function createDeathSavePenaltyField(creature, index, onChange)
{
    const crits = creature.crits[index];

    const field = createStatField("Death Save Penalty", crits.deathSavePenalty, value =>
    {
        if (value < 0)
        {
            value = 0;
            input.value = 0;
        }

        crits.deathSavePenalty = isNaN(value) ? 0 : value;
        refreshTotal();
        onChange();
    });
    field.classList.add("stat-quick", "stat-death-save");

    const input = field.querySelector("input");
    input.min = 0;
    input.placeholder = "0";

    const total = document.createElement("span");
    total.className = "stat-effective";
    total.title = "With crits";
    field.appendChild(total);

    const refreshTotal = () =>
    {
        const value = getDeathSavePenalty(creature, index);
        const show = value !== crits.deathSavePenalty;

        total.hidden = !show;
        total.textContent = show ? `→ ${value}` : "";
    };

    refreshTotal();
    return field;
}

// A crits dropdown (Body Crits or Head Crits): a row per crit in critList.
// openKey is where the dropdown remembers being open ("open" or "headOpen").
// Turning a crit on or off re-renders, since crits change things all over the box
// (MOVE, dodge, notices, warnings, death save total).
function createCritsPanel(creature, index, title, critList, openKey)
{
    const crits = creature.crits[index];

    const panel = document.createElement("details");
    panel.className = "status-panel crits-panel";
    panel.open = crits[openKey];
    panel.addEventListener("toggle", () => crits[openKey] = panel.open);

    const summary = document.createElement("summary");
    summary.className = "status-summary";

    const body = document.createElement("div");
    body.className = "status-body";

    for (const crit of critList)
    {
        const row = document.createElement("div");
        row.className = "status-row crit-row";
        row.classList.toggle("active", isCritActive(creature, index, crit));

        const label = document.createElement("label");
        label.className = "status-name";

        const name = document.createElement("span");
        name.textContent = crit.label;

        if (crit.side)
        {
            // Side crits are picked with a None / Right / Left dropdown
            const select = document.createElement("select");
            select.className = "status-select";

            // A side that's been lost (e.g. Lost Eye on the left) can't take this crit
            const blockers = ALL_CRITS.filter(other => (other.replaces || []).includes(crit.key));

            for (const [value, text] of [["none", "—"], ["right", "Right"], ["left", "Left"]])
            {
                const choice = document.createElement("option");
                choice.value = value;
                choice.textContent = text;

                const blocker = value === "none" ? null : blockers.find(other => crits.active[other.key] === value);

                // Just greyed out; the reason goes in a tooltip so the dropdown stays narrow
                if (blocker)
                {
                    choice.disabled = true;
                    choice.title = blocker.label;
                }

                select.appendChild(choice);
            }

            select.value = crits.active[crit.key];
            select.addEventListener("change", () =>
            {
                crits.active[crit.key] = select.value;

                // Losing a part clears the lesser crits on that same side
                for (const replaced of crit.replaces || [])
                {
                    if (crits.active[replaced] === select.value)
                    {
                        crits.active[replaced] = "none";
                    }
                }

                render();
            });

            label.append(name, select);
        }
        else
        {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = crits.active[crit.key];
            checkbox.addEventListener("change", () =>
            {
                crits.active[crit.key] = checkbox.checked;
                render();
            });

            label.append(checkbox, name);
        }

        row.appendChild(label);

        // What the crit does, worked out from its definition
        const effects = [];

        if (crit.move)
        {
            effects.push(`-${crit.move} MOVE (min 1)`);
        }

        if (crit.deathSave)
        {
            effects.push(`+${crit.deathSave} Death Save`);
        }

        if (crit.noDodge)
        {
            effects.push("Can't dodge bullets");
        }

        if (crit.hurts)
        {
            effects.push(`Button to take ${HURT_DAMAGE} damage`);
        }

        if (crit.combatNote)
        {
            effects.push(crit.combatNote);
        }

        if (crit.statPenalty)
        {
            effects.push(`-${crit.statPenalty} Combat & Evasion`);
        }

        if (crit.headshotMultiplier)
        {
            effects.push(`Headshots do x${crit.headshotMultiplier} damage`);
        }

        if (crit.moveWarning)
        {
            effects.push("Warning by MOVE");
        }

        if (effects.length > 0)
        {
            const detail = document.createElement("span");
            detail.className = "status-detail";
            detail.textContent = effects.join(". ");
            row.appendChild(detail);
        }

        body.appendChild(row);
    }

    panel.append(summary, body);

    // Nothing in here depends on HP, so the summary only needs setting once per render
    const active = critList.filter(crit => isCritActive(creature, index, crit));
    panel.classList.toggle("has-status", active.length > 0);
    summary.textContent = `${title}: ${active.length === 0 ? "none" : active.length}`;

    return panel;
}

// Active side crits as notices, e.g. "Crushed Fingers (right hand)", plus combat notes for
// anyone without a Combat base field.
// Goes between the HP/SP stats and Combat/Evasion/MOVE. Returns null when there are none.
function createCritNotices(creature, index)
{
    const sideCrits = getActiveCrits(creature, index).filter(crit => crit.side && !crit.combatNote && !crit.moveWarning);

    // No Combat base to sit under (players, vehicles), so combat notes go here instead
    const combatNotes = creature.quickInfo
        ? []
        : getActiveCrits(creature, index).filter(crit => crit.combatNote);

    if (sideCrits.length === 0 && combatNotes.length === 0)
    {
        return null;
    }

    const notices = document.createElement("div");
    notices.className = "crit-notices";

    for (const crit of sideCrits)
    {
        const notice = document.createElement("span");
        notice.className = "crit-notice";
        notice.textContent = describeSideCrit(creature, index, crit);
        notices.appendChild(notice);
    }

    for (const crit of combatNotes)
    {
        notices.appendChild(createCombatNote(creature, index, crit));
    }

    return notices;
}

// Warnings that go under MOVE: crits like Damaged Ear, and crits like Foreign Object that
// also get a button dealing HURT_DAMAGE to HP. Returns null when there are none.
function createCritWarnings(creature, index)
{
    const warningCrits = getActiveCrits(creature, index).filter(crit => crit.hurts || crit.moveWarning);

    if (warningCrits.length === 0)
    {
        return null;
    }

    const warnings = document.createElement("div");
    warnings.className = "crit-warnings";

    for (const crit of warningCrits)
    {
        const warning = document.createElement("div");
        warning.className = "crit-warning";

        const text = document.createElement("span");
        text.textContent = `⚠ ${crit.warningLabel || describeSideCrit(creature, index, crit)}`;
        warning.appendChild(text);
        warnings.appendChild(warning);

        if (!crit.hurts)
        {
            continue;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "crit-hurt-btn";
        button.textContent = `-${HURT_DAMAGE} HP`;
        button.title = `Deal ${HURT_DAMAGE} damage straight to HP`;
        button.disabled = creature.hp[index] === null;
        button.addEventListener("click", () =>
        {
            creature.hp[index] = Math.max(0, creature.hp[index] - HURT_DAMAGE);
            render();
        });

        warning.appendChild(button);
    }

    return warnings;
}

// The status effects dropdown under each individual.
// onChange runs when something here changes the individual's numbers (e.g. ignoring a wound).
// Returns { element, refresh } so HP changes can update which conditions are active.
function createStatusPanel(creature, index, onChange)
{
    const status = creature.status[index];

    const panel = document.createElement("details");
    panel.className = "status-panel";
    panel.open = status.open;
    panel.addEventListener("toggle", () => status.open = panel.open);

    const summary = document.createElement("summary");
    summary.className = "status-summary";

    const body = document.createElement("div");
    body.className = "status-body";

    const refreshers = [];

    // Vehicles don't get wounded, they just lose SDP
    let deathSaves = null;

    if (!creature.isVehicle)
    {
        const serious = createWoundRow(creature, index, "serious", "Seriously Wounded", onChange);
        const mortal = createWoundRow(creature, index, "mortal", "Mortally Wounded", onChange);
        deathSaves = createDeathSaves(creature, index);

        body.append(serious.row, mortal.row, deathSaves.element);
        refreshers.push(serious.refresh, mortal.refresh);
    }

    // On Fire: pick a level, and the burn happens when their turn ends
    const fireRow = document.createElement("div");
    fireRow.className = "status-row status-fire";

    const fireLabel = document.createElement("label");
    fireLabel.className = "status-name";

    const fireName = document.createElement("span");
    fireName.textContent = "On Fire";

    const fireSelect = document.createElement("select");
    fireSelect.className = "status-select";

    for (const [value, level] of Object.entries(FIRE_LEVELS))
    {
        const choice = document.createElement("option");
        choice.value = value;
        choice.textContent = level.damage > 0 ? `${level.label} (-${level.damage} HP)` : level.label;
        fireSelect.appendChild(choice);
    }

    fireSelect.value = status.fire;
    fireSelect.addEventListener("change", () =>
    {
        status.fire = fireSelect.value;
        refresh();
    });

    fireLabel.append(fireName, fireSelect);

    const fireDetail = document.createElement("span");
    fireDetail.className = "status-detail";
    fireDetail.textContent = "Burns when their turn ends";

    fireRow.append(fireLabel, fireDetail);
    body.appendChild(fireRow);

    panel.append(summary, body);

    // The summary lists what's active so you can see it without opening the dropdown
    const refresh = () =>
    {
        refreshers.forEach(fn => fn());

        const active = [];
        const wound = getWoundState(creature, index);

        if (wound !== null)
        {
            const woundName = wound === "mortal" ? "Mortally Wounded" : "Seriously Wounded";
            active.push(isWoundIgnored(creature, index, wound) ? `${woundName} (ignored)` : woundName);
        }

        if (status.fire !== "none")
        {
            active.push(`On Fire (${FIRE_LEVELS[status.fire].label})`);
        }

        if (deathSaves)
        {
            deathSaves.element.hidden = wound !== "mortal";
            deathSaves.penalty.textContent = `Penalty: ${getDeathSavePenalty(creature, index)}`;
        }

        fireRow.classList.toggle("active", status.fire !== "none");
        panel.classList.toggle("has-status", active.length > 0);
        panel.classList.toggle("mortal", wound === "mortal");
        summary.textContent = active.length > 0 ? active.join(", ") : "Status: none";
    };

    refresh();
    return { element: panel, refresh };
}

// Damage goes through stopping power first: SP soaks that much, and only the rest hits HP/SDP.
// Headshots double whatever gets through the head SP (triple with Cracked Skull).
// Anything that gets through ablates the SP it hit (by 1, or 2 with Armor Piercing); a hit that
// doesn't get through just plinks and leaves the armor alone. Rubber rounds never ablate and
// can't drop a target below 1 HP. Applies to the selected individuals, or the only one there is.
function applyDamage(creature, damage)
{
    const options = creature.damageOptions;
    const single = creature.hp.length === 1;
    const headshot = !creature.isVehicle && options.location === "head";
    const spValues = headshot ? creature.spHead : creature.spBody;
    const results = [];

    creature.hp.forEach((hp, index) =>
    {
        if (!single && !creature.selected[index])
        {
            return;
        }

        const sp = spValues[index] === null ? 0 : spValues[index];
        let through = damage - sp;

        if (through <= 0)
        {
            results.push({ plinked: true, sp: sp });
            return;
        }

        const multiplier = headshot ? getHeadshotMultiplier(creature, index) : 1;
        through *= multiplier;

        let newHp = hp - through;

        if (options.rubber)
        {
            newHp = Math.max(Math.min(hp, 1), newHp);
        }

        creature.hp[index] = Math.max(0, newHp);

        if (!options.rubber && spValues[index] !== null)
        {
            spValues[index] = Math.max(0, sp - (options.armorPiercing ? 2 : 1));
        }

        results.push({ plinked: false, taken: hp - creature.hp[index], sp: sp, newSp: spValues[index], multiplier: multiplier });
    });

    if (single)
    {
        const result = results[0];
        const spText = result.newSp === undefined || result.newSp === null || result.newSp === result.sp
            ? ""
            : ` SP ${result.sp} → ${result.newSp}.`;

        creature.damageNote = result.plinked
            ? `Plink! ${damage} didn't get through SP ${result.sp}.`
            : `Took ${result.taken} damage${headshot ? ` (headshot x${result.multiplier})` : ""}.${spText}`;
    }
    else
    {
        const plinked = results.filter(r => r.plinked).length;
        const hit = results.length - plinked;

        // Show the multiplier when everyone hit shares it; a mixed group just says "headshot"
        const multipliers = new Set(results.filter(r => !r.plinked).map(r => r.multiplier));
        const headshotText = !headshot || hit === 0
            ? ""
            : (multipliers.size === 1 ? ` (headshot x${[...multipliers][0]})` : " (headshot)");

        creature.damageNote = plinked > 0
            ? `${hit} took damage${headshotText}, ${plinked} plinked.`
            : `${hit} took damage${headshotText}.`;
    }

    creature.selected.fill(false);
    render();
}

function createDamageOption(labelText, checked, onChange)
{
    const option = document.createElement("label");
    option.className = "initiative-check damage-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => onChange(checkbox.checked));

    option.append(checkbox, ` ${labelText}`);
    return option;
}

function renderDamageRow(creature)
{
    const options = creature.damageOptions;

    const row = document.createElement("div");
    row.className = "damage-row";

    const input = document.createElement("input");
    input.type = "number";
    input.min = 0;
    input.className = "damage-input";
    input.placeholder = "Damage";
    input.setAttribute("aria-label", `Damage to ${creature.name}`);

    row.appendChild(input);

    // Vehicles only have one SP, so there's no hit location to pick
    if (!creature.isVehicle)
    {
        const location = document.createElement("select");
        location.className = "damage-location";
        location.setAttribute("aria-label", "Hit location");

        for (const [value, text] of [["body", "Body"], ["head", "Head"]])
        {
            const choice = document.createElement("option");
            choice.value = value;
            choice.textContent = text;
            location.appendChild(choice);
        }

        location.value = options.location;
        location.addEventListener("change", () => options.location = location.value);
        row.appendChild(location);
    }

    // Armor Piercing and Rubber pull in opposite directions, so only one can be on
    const armorPiercing = createDamageOption("Armor Piercing", options.armorPiercing, checked =>
    {
        options.armorPiercing = checked;

        if (checked)
        {
            options.rubber = false;
            rubber.querySelector("input").checked = false;
        }
    });

    const rubber = createDamageOption("Rubber", options.rubber, checked =>
    {
        options.rubber = checked;

        if (checked)
        {
            options.armorPiercing = false;
            armorPiercing.querySelector("input").checked = false;
        }
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = "damage-btn";
    button.textContent = creature.hp.length > 1 ? "Apply Damage to Selected" : "Apply Damage";

    // Shows the result of the last hit (plinks, damage taken, ablation) once, then clears it
    const hint = document.createElement("span");
    hint.className = "damage-hint";
    hint.textContent = creature.damageNote || "";
    creature.damageNote = "";

    const apply = () =>
    {
        const damage = parseInt(input.value);

        if (isNaN(damage) || damage <= 0)
        {
            input.focus();
            return;
        }

        if (creature.hp.length > 1 && !creature.selected.includes(true))
        {
            hint.textContent = "Tick the ones that got hit first.";
            return;
        }

        applyDamage(creature, damage);
    };

    button.addEventListener("click", apply);
    input.addEventListener("keydown", event =>
    {
        if (event.key === "Enter")
        {
            apply();
        }
    });

    row.append(armorPiercing, rubber, button, hint);
    return row;
}

function renderCreatureCard(creature, isCurrent)
{
    const card = document.createElement("div");
    card.className = "creature";
    card.classList.toggle("player", creature.isPlayer);
    card.classList.toggle("boss", creature.isBoss);
    card.classList.toggle("vehicle", creature.isVehicle);
    card.classList.toggle("current-turn", isCurrent);

    const header = document.createElement("div");
    header.className = "creature-header";

    const name = document.createElement("h3");
    name.className = "creature-name";
    name.textContent = creature.name;

    if (creature.isPlayer)
    {
        name.appendChild(createTag("PC", ""));
    }

    if (creature.isBoss)
    {
        name.appendChild(createTag("BOSS", "boss-tag"));
    }

    if (creature.isVehicle)
    {
        name.appendChild(createTag("VEHICLE", "vehicle-tag"));
    }

    if (creature.hp.length > 1)
    {
        const count = document.createElement("span");
        count.className = "creature-count";
        count.textContent = `x${creature.hp.length}`;
        name.appendChild(count);
    }

    header.append(createInitiativeInput(creature, "initiative"), name);

    if (isCurrent)
    {
        header.appendChild(createNextButton());
    }

    header.appendChild(createRemoveButton(creature.id));
    card.appendChild(header);

    const hpList = document.createElement("div");
    hpList.className = "hp-list";

    creature.hp.forEach((hp, index) =>
    {
        const box = document.createElement("div");
        box.className = "hp-box";

        if (creature.hp.length > 1)
        {
            // In a group, each individual can be picked as a damage target
            const select = document.createElement("label");
            select.className = "hp-box-select";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = creature.selected[index];
            checkbox.addEventListener("change", () =>
            {
                creature.selected[index] = checkbox.checked;
                box.classList.toggle("selected", checkbox.checked);
            });

            const label = document.createElement("span");
            label.className = "hp-box-name";
            label.textContent = `${creature.name} ${index + 1}`;

            box.classList.toggle("selected", creature.selected[index]);
            select.append(checkbox, label);
            box.appendChild(select);
        }

        // Everything in this box that depends on HP or wound state refreshes together
        const refreshers = [];
        const refresh = () => refreshers.forEach(fn => fn());

        box.append(createHpField(creature, index, box, refresh), ...createSpFields(creature, index));

        const notices = createCritNotices(creature, index);

        if (notices)
        {
            box.appendChild(notices);
        }

        if (creature.quickInfo)
        {
            const quickInfo = createQuickInfoFields(creature, index);
            box.append(...quickInfo.elements);
            refreshers.push(quickInfo.refresh);
        }

        const warnings = createCritWarnings(creature, index);

        if (warnings)
        {
            box.appendChild(warnings);
        }

        if (creature.canDodge)
        {
            box.appendChild(createDodgeToggle(creature, index));
        }

        if (creature.identifiers)
        {
            const identifier = document.createElement("input");
            identifier.type = "text";
            identifier.className = "hp-box-identifier";
            identifier.placeholder = "Identifier";
            identifier.value = creature.identifiers[index];
            identifier.setAttribute("aria-label", `Identifier for ${creature.name} ${index + 1}`);

            // Save edits back so they survive re-renders
            identifier.addEventListener("input", () =>
            {
                creature.identifiers[index] = identifier.value;
            });

            box.appendChild(identifier);
        }

        box.appendChild(createDeathSavePenaltyField(creature, index, refresh));

        const statusPanel = createStatusPanel(creature, index, refresh);
        box.append(
            statusPanel.element,
            createCritsPanel(creature, index, "Body Crits", BODY_CRITS, "open"),
            createCritsPanel(creature, index, "Head Crits", HEAD_CRITS, "headOpen")
        );
        refreshers.push(statusPanel.refresh);

        hpList.appendChild(box);
    });

    card.appendChild(hpList);

    if (!creature.isPlayer)
    {
        card.appendChild(renderDamageRow(creature));
    }

    return card;
}

function renderPlayerGroupCard(players, isCurrent)
{
    const card = document.createElement("div");
    card.className = "creature player player-group";
    card.classList.toggle("current-turn", isCurrent);

    const header = document.createElement("div");
    header.className = "creature-header";

    const name = document.createElement("h3");
    name.className = "creature-name";
    name.textContent = "Player Group";

    const count = document.createElement("span");
    count.className = "creature-count";
    count.textContent = `${players.length} players`;
    name.appendChild(count);

    header.append(createInitiativeBadge(players[0].initiative), name);

    if (isCurrent)
    {
        header.appendChild(createNextButton());
    }

    const members = document.createElement("ul");
    members.className = "player-group-members";

    for (const player of players)
    {
        const member = document.createElement("li");
        member.className = "player-group-member";

        const memberInitiative = createInitiativeInput(player, "player-group-initiative");

        const memberName = document.createElement("span");
        memberName.className = "player-group-name";
        memberName.textContent = player.name;

        // Players have no Combat/Evasion here, so only the status dropdown reacts to HP changes
        let statusPanel = null;
        const refresh = () => statusPanel.refresh();

        member.append(
            memberInitiative,
            memberName,
            createHpField(player, 0, member, refresh),
            ...createSpFields(player, 0),
            createDeathSavePenaltyField(player, 0, refresh)
        );

        member.appendChild(createRemoveButton(player.id));

        const notices = createCritNotices(player, 0);
        const warnings = createCritWarnings(player, 0);

        if (notices)
        {
            member.appendChild(notices);
        }

        if (warnings)
        {
            member.appendChild(warnings);
        }

        statusPanel = createStatusPanel(player, 0, refresh);
        member.append(
            statusPanel.element,
            createCritsPanel(player, 0, "Body Crits", BODY_CRITS, "open"),
            createCritsPanel(player, 0, "Head Crits", HEAD_CRITS, "headOpen")
        );
        members.appendChild(member);
    }

    card.append(header, members);
    return card;
}

function render()
{
    sortCreatures();

    list.innerHTML = "";
    renderCombatBar();

    if (creatures.length === 0)
    {
        const empty = document.createElement("p");
        empty.className = "initiative-empty";
        empty.textContent = "No creatures yet. Add one above to start the encounter.";
        list.appendChild(empty);
        return;
    }

    for (const turn of getTurns())
    {
        const isCurrent = turn.some(c => c.id === currentId);

        const card = turn.length > 1
            ? renderPlayerGroupCard(turn, isCurrent)
            : renderCreatureCard(turn[0], isCurrent);

        list.appendChild(card);
    }
}

updateTypeFields();
render();
