# Nick's Homebrew Wiki

A static HTML wiki containing all of Nicholas's homebrew content for **Dungeons & Dragons 5th Edition**, including custom races, subclasses, backgrounds, spells, magic items, and full campaign settings.

## Overview

This wiki serves as a comprehensive reference for custom D&D 5e mechanics and lore. It is a static site with no backend or build process — all content is viewable directly in a browser.

### Content Summary

| Category | Count |
|---|---|
| Campaign Settings | 7 |
| Custom Races | 5 |
| Custom Subraces | 3 |
| Custom Backgrounds | 10 |
| Custom Subclasses | 32 |
| Custom Spells | 103 |
| Magic Items | 20+ |

## Project Structure

```
NicksHomebrewWiki/
├── index.html                  # Redirect to homePage.html
├── homePage.html               # Main navigation hub
├── Global.css                  # Primary stylesheet
├── Atributes.css               # Legacy table styles
├── Settings/                   # Campaign lore documents
│   ├── Sapiria.html
│   ├── Moonstone.html
│   ├── Empire.html
│   └── Grimm.html
├── Races/                      # Custom playable races
├── Subraces/                   # Custom subraces
├── Backgrounds/                # Custom backgrounds
├── Subclasses/                 # Custom subclasses (all 13 D&D classes covered)
├── Extras/
│   ├── Spells/                 # 103 spells with interactive JSON-driven filter
│   ├── Magic Items/            # Organized by rarity (Uncommon → Artifact)
│   ├── Rules/                  # Custom rules (Vehicles, Critical Injuries, Facedowns)
│   ├── Feats.html
│   ├── Armor.html
│   └── StatRoller.html         # Interactive stat roller tool
├── Anora's Refuge/             # Campaign setting
├── Ardonia/                    # Campaign setting
├── The Upside/                 # Campaign setting
└── Images/                     # Character artwork and HeroForge links
```

## Running Locally

This is a pure static site — no installation or build step is required.

**Option 1: Open directly in a browser**
```
Open index.html in any modern web browser.
```

**Option 2: Serve with Python** (recommended for spell filtering, which uses `fetch`)
```bash
python -m http.server 8000
# Then visit http://localhost:8000
```

**Option 3: Serve with Node.js**
```bash
npx http-server
```

## Technology

- **HTML5** — all content pages
- **CSS3** — styling via `Global.css` and `Atributes.css`
- **Vanilla JavaScript** — interactive spell filter (`Extras/Spells/Spells-Json.js`)
- **JSON** — structured spell database (`Extras/Spells/Data/Spells.json`)

No frameworks, no package manager, no build tools.

## Adding Content

Template files are provided for each content type:

| Content Type | Template |
|---|---|
| Race | `Races/RaceFormat.html` |
| Subrace | `Subraces/SubraceFormat.html` |
| Background | `Backgrounds/BackgroundFormat.html` |
| Subclass | `Subclasses/SubclassFormat.html` |
| Spell | `Extras/Spells/Individual Spells/SpellsFormat.html` |

Copy the relevant template, fill in the content, and add a link to the appropriate index page.

## Campaign Settings

| Setting | Description |
|---|---|
| **Sapiria (1702 DR)** | Moonstone era |
| **Sapiria (1710 DR)** | Empire era |
| **Sapiria (1730 DR)** | Grimm era |
| **Anora's Refuge** | Post-apocalyptic setting with unique races |
| **Ardonia** | Home world of the Ardoni race |
| **The Upside** | Setting featuring the Five Families |

> ⚠️ Some campaign setting pages contain **spoilers** for active campaigns.
