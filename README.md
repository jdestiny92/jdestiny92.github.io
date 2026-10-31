# Auto-Battler: Mobile 1v1 (Phases 1–3 Build)

This folder contains the complete, mobile-first web game for your `jdestiny92.github.io` GitHub Pages repository covering:
- **Phase 1:** Core Interface, Vertical Stacked 3x2 Boards, Bench (8 slots), Market Shop (5 cards), Economy, and Rulebook v16 synergies/penalties.
- **Phase 2:** Local Heuristic AI Opponent (`bot.js`) featuring **Easy** and **Medium** difficulties.
- **Phase 3:** Deterministic Simultaneous Combat Engine (`engine.js`) & Cinematic Playback (`ui.js`) with 1x/2x speed controls, Air Pre-Strikes, targeting priority across rows, and floating damage/heal popups.

## Asset Directory Structure
To use your custom `.png` artwork, the `ui.js` script expects the following strict folder structure inside `assets/`. The game maps elements dynamically as: `Fire`, `Water`, `Earth`, `Air`, `Light`, and `Dark` (mapped from Rulebook 'Shadow').

```
assets/
├── Archer/
│   ├── Air/
│   │   ├── Archer_1_star_air.png
│   │   ├── Archer_2_star_air.png
│   │   └── Archer_3_star_air.png
│   ├── Dark/
│   │   ├── Archer_1_star_dark.png
│   │   ├── ...
│   ├── Earth/
│   ├── Fire/
│   ├── Light/
│   └── Water/
├── Assassin/
├── Healer/
├── Mage/
├── Tank/
└── Warrior/
```

If a specific `.png` file is missing, the game will automatically fall back to loading the generic `<class>_<star>.svg` from the root of the `assets/` folder so gameplay doesn't break.

## Deploying to `jdestiny92.github.io`
Upload `index.html`, `style.css`, `engine.js`, `bot.js`, `ui.js`, and the `assets/` folder into a subfolder (e.g., `/autobattler/`) or root of your `jdestiny92.github.io` repository.
