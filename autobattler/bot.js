/* ==========================================================================
   BOT.JS — Heuristic AI Opponent (Easy & Medium Difficulty)
   ========================================================================== */

const BotAI = {
  targetClass: null,
  targetElement: null,

  initBotPersonality(difficulty) {
    const classes = Object.keys(UNIT_STATS);
    this.targetClass = classes[Math.floor(Math.random() * classes.length)];
    this.targetElement = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  },

  executeTurn() {
    const state = Engine.state;
    const bot = state.bot;
    const diff = state.botDifficulty;

    if (!this.targetClass) {
      this.initBotPersonality(diff);
    }

    if (diff === 'easy') {
      this.runEasyBot(bot);
    } else {
      this.runMediumBot(bot);
    }

    // Ensure optimal board placement after shopping/fusing
    this.arrangeBotBoard(bot, diff);
  },

  runEasyBot(bot) {
    // 1. Unlock a slot if we have plenty of gold and our board is full
    const currentUnits = Engine.getAllOwnedUnits(bot).length;
    if (bot.unlockedSlots < 6) {
      const slotCost = SLOT_UNLOCK_COSTS[bot.unlockedSlots - 1];
      if (bot.gold >= slotCost + 3 || (currentUnits >= bot.unlockedSlots && bot.gold >= slotCost)) {
        Engine.buySlot(bot);
      }
    }

    // 2. Buy random units from the market if gold >= 3 and room on bench
    let safety = 0;
    while (bot.gold >= 3 && bot.bench.length < 8 && safety < 5) {
      safety++;
      if (Engine.state.market.length === 0) break;
      const randIdx = Math.floor(Math.random() * Engine.state.market.length);
      const res = Engine.buyUnit(bot, randIdx);
      if (!res.ok) break;

      // Easy bot only fuses if it stumbles into a duplicate (50% chance to notice)
      if (Math.random() < 0.5) {
        this.tryAllFusions(bot);
      }
    }
  },

  runMediumBot(bot) {
    // 1. Check if we should unlock a board slot
    // Medium bot balances board size vs unit quality
    if (bot.unlockedSlots < 6) {
      const slotCost = SLOT_UNLOCK_COSTS[bot.unlockedSlots - 1];
      const totalUnits = Engine.getAllOwnedUnits(bot).length;
      if ((totalUnits >= bot.unlockedSlots && bot.gold >= slotCost) || bot.gold >= slotCost + 6) {
        Engine.buySlot(bot);
      }
    }

    // 2. Evaluate Market cards by heuristic score (duplicates > preferred synergy > high stats)
    let shoppingLoops = 0;
    while (bot.gold >= 3 && bot.bench.length < 8 && shoppingLoops < 8) {
      shoppingLoops++;
      const scored = this.scoreMarketCards(bot);
      if (scored.length === 0) break;

      const best = scored[0];
      // Buy if score is decent or if our board isn't full yet
      const boardCount = Engine.getBoardCount(bot);
      if (best.score >= 2 || boardCount < bot.unlockedSlots) {
        Engine.buyUnit(bot, best.index);
        this.tryAllFusions(bot);
      } else if (bot.gold >= 6) {
        // Reroll market if we have > 6 Gold and nothing fits our build
        Engine.rerollMarket(bot);
      } else {
        break;
      }
    }

    // Final fusion sweep
    this.tryAllFusions(bot);
  },

  scoreMarketCards(bot) {
    const owned = Engine.getAllOwnedUnits(bot);
    return Engine.state.market.map((card, index) => {
      let score = 1;
      // Duplicate check (huge priority for fusion)
      const sameClassStar1 = owned.filter(o => o.unit.cls === card.cls && o.unit.star === 1).length;
      const sameClassStar2 = owned.filter(o => o.unit.cls === card.cls && o.unit.star === 2).length;
      if (sameClassStar1 >= 1) score += 5;
      if (sameClassStar2 >= 1) score += 3;

      // Synergy preference
      if (card.cls === this.targetClass) score += 3;
      if (card.element === this.targetElement) score += 2;

      // Existing board synergy check
      const hasClassOnBoard = owned.some(o => o.zone === 'board' && o.unit.cls === card.cls);
      const hasElOnBoard = owned.some(o => o.zone === 'board' && o.unit.element === card.element);
      if (hasClassOnBoard) score += 2;
      if (hasElOnBoard) score += 1.5;

      return { index, card, score };
    }).sort((a, b) => b.score - a.score);
  },

  tryAllFusions(bot) {
    let fused = true;
    while (fused) {
      const candidates = Engine.getFusionCandidates(bot);
      if (candidates.length === 0) {
        fused = false;
      } else {
        const c = candidates[0];
        // Pick element that matches targetElement if available, else first unit's element
        const preferred = c.items.find(i => i.unit.element === this.targetElement);
        const chosenElement = preferred ? preferred.unit.element : c.items[0].unit.element;
        Engine.executeFusion(bot, c.cls, c.star, chosenElement);
      }
    }
  },

  arrangeBotBoard(bot, difficulty) {
    // Gather all owned units (board + bench) and pick the strongest N units for unlockedSlots
    const allUnits = [];
    ['front', 'back'].forEach(r => {
      for (let col = 0; col < 3; col++) {
        if (bot.board[r][col]) {
          allUnits.push(bot.board[r][col]);
          bot.board[r][col] = null;
        }
      }
    });
    while (bot.bench.length > 0) {
      allUnits.push(bot.bench.pop());
    }

    // Sort units by Star level first, then synergy match, then total stats
    allUnits.sort((a, b) => {
      if (b.star !== a.star) return b.star - a.star;
      if (difficulty === 'medium') {
        const aSyn = (a.cls === this.targetClass ? 2 : 0) + (a.element === this.targetElement ? 1 : 0);
        const bSyn = (b.cls === this.targetClass ? 2 : 0) + (b.element === this.targetElement ? 1 : 0);
        if (bSyn !== aSyn) return bSyn - aSyn;
      }
      return (b.baseAp + b.baseHp) - (a.baseAp + a.baseHp);
    });

    const toBoard = allUnits.slice(0, bot.unlockedSlots);
    const toBench = allUnits.slice(bot.unlockedSlots, bot.unlockedSlots + 8);
    bot.bench = toBench;

    // Place Melee in Front Row (cols 0,1,2), Ranged in Back Row (cols 0,1,2), Agile in any open slot
    const melee = toBoard.filter(u => u.role === 'Melee');
    const ranged = toBoard.filter(u => u.role === 'Ranged');
    const agile = toBoard.filter(u => u.role === 'Agile');

    const placeInRow = (unit, preferredRow) => {
      const fallbackRow = preferredRow === 'front' ? 'back' : 'front';
      for (let c = 0; c < 3; c++) {
        if (!bot.board[preferredRow][c]) {
          bot.board[preferredRow][c] = unit;
          return;
        }
      }
      for (let c = 0; c < 3; c++) {
        if (!bot.board[fallbackRow][c]) {
          bot.board[fallbackRow][c] = unit;
          return;
        }
      }
    };

    melee.forEach(u => placeInRow(u, 'front'));
    ranged.forEach(u => placeInRow(u, 'back'));
    agile.forEach(u => {
      // Assassins can go anywhere without penalty
      const frontCount = bot.board.front.filter(Boolean).length;
      placeInRow(u, frontCount === 0 ? 'front' : 'back');
    });
  }
};
