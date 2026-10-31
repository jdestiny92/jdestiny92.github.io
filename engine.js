/* ==========================================================================
   ENGINE.JS — Core Deterministic Auto-Battler Rulebook (v16)
   ========================================================================== */

const UNIT_STATS = {
  Warrior:  { role: 'Melee',  icon: '⚔️', stars: { 1: { ap: 2, hp: 3 }, 2: { ap: 3, hp: 4 }, 3: { ap: 5, hp: 7 } } },
  Tank:     { role: 'Melee',  icon: '🛡️', stars: { 1: { ap: 1, hp: 5 }, 2: { ap: 2, hp: 6 }, 3: { ap: 4, hp: 10 } } },
  Archer:   { role: 'Ranged', icon: '🏹', stars: { 1: { ap: 3, hp: 2 }, 2: { ap: 4, hp: 3 }, 3: { ap: 7, hp: 5 } } },
  Mage:     { role: 'Ranged', icon: '🔮', stars: { 1: { ap: 2, hp: 2 }, 2: { ap: 3, hp: 3 }, 3: { ap: 6, hp: 4 } } },
  Healer:   { role: 'Ranged', icon: '✨', stars: { 1: { ap: 1, hp: 3 }, 2: { ap: 2, hp: 4 }, 3: { ap: 3, hp: 7 } } },
  Assassin: { role: 'Agile',  icon: '🗡️', stars: { 1: { ap: 4, hp: 1 }, 2: { ap: 5, hp: 2 }, 3: { ap: 8, hp: 4 } } }
};

const ELEMENTS = ['Fire', 'Water', 'Earth', 'Air', 'Light', 'Shadow'];

const ELEMENT_ICONS = {
  Fire: '🔥', Water: '💧', Earth: '🪨', Air: '🌪️', Light: '☀️', Shadow: '🌑'
};

const CLASS_SYNERGY_DESC = {
  Warrior:  { 2: '+1 HP', 3: '+1 AP' },
  Archer:   { 2: 'May target front row', 3: 'May target back row directly' },
  Mage:     { 2: '+1 AP', 3: 'Splash 1 dmg to adjacent enemy' },
  Healer:   { 2: 'Heal +1 HP', 3: 'Revive 1 non-healer per fight' },
  Tank:     { 2: '-1 damage taken', 3: 'Adjacent row units -1 damage taken' },
  Assassin: { 2: 'Target lowest HP enemy', 3: 'First attack deals 2x damage' }
};

const ELEMENT_SYNERGY_DESC = {
  Fire:   { 2: '+1 AP', 4: 'Splash 1 dmg', 6: 'Ignore 1 damage reduction' },
  Water:  { 2: 'Heal lowest ally +1 end of step', 4: 'Heal self +1 after taking dmg', 6: 'Revive 1 unit per fight' },
  Earth:  { 2: '+1 HP', 4: '-1 damage taken', 6: 'All allies -1 damage taken' },
  Air:    { 2: '+1 AP', 4: 'First Strike (Pre-Strike phase)', 6: 'Dodge first attack received' },
  Light:  { 2: 'All allies +1 AP', 4: 'All allies +1 HP', 6: 'All allies +1 AP' },
  Shadow: { 2: 'Hit enemy -1 AP (min 1)', 4: 'On kill, +1 AP', 6: '50% chance to stun target' }
};

const SLOT_UNLOCK_COSTS = [3, 4, 5, 6, 7]; // Unlocks slots 2, 3, 4, 5, 6
const SELL_REFUND = { 1: 1, 2: 3, 3: 9 };

let uidCounter = 1;

const Engine = {
  state: null,

  createNewGame(botDifficulty = 'easy') {
    const deck = [];
    const classes = Object.keys(UNIT_STATS);
    // 2 Players: 8 copies of each Class (48 total)
    classes.forEach(cls => {
      for (let i = 0; i < 8; i++) {
        deck.push(cls);
      }
    });
    this.shuffleArray(deck);

    this.state = {
      round: 1,
      phase: 'MARKET', // MARKET | COMBAT | GAMEOVER
      botDifficulty,
      deck,
      discardPile: [],
      market: [],
      player: this.createPlayerState('player'),
      bot: this.createPlayerState('bot')
    };

    this.refillMarket();
    return this.state;
  },

  createPlayerState(side) {
    return {
      side,
      gold: 6,
      losses: 0,
      unlockedSlots: 1,
      bench: [], // array of up to 8 unit objects
      board: {
        front: [null, null, null],
        back: [null, null, null]
      }
    };
  },

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  rollElement() {
    return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  },

  drawCardFromDeck() {
    if (this.state.deck.length === 0) {
      if (this.state.discardPile.length === 0) return null;
      this.state.deck = [...this.state.discardPile];
      this.state.discardPile = [];
      this.shuffleArray(this.state.deck);
    }
    const cls = this.state.deck.pop();
    return this.createUnitInstance(cls, 1, this.rollElement());
  },

  createUnitInstance(cls, star, element) {
    const base = UNIT_STATS[cls].stars[star];
    return {
      id: 'u_' + (uidCounter++),
      cls,
      star,
      element,
      role: UNIT_STATS[cls].role,
      baseAp: base.ap,
      baseHp: base.hp
    };
  },

  refillMarket() {
    while (this.state.market.length < 5) {
      const card = this.drawCardFromDeck();
      if (!card) break;
      this.state.market.push(card);
    }
  },

  // Count how many units are currently placed on a participant's board
  getBoardCount(pState) {
    let count = 0;
    ['front', 'back'].forEach(r => {
      pState.board[r].forEach(u => { if (u) count++; });
    });
    return count;
  },

  getBoardUnits(pState) {
    const list = [];
    ['front', 'back'].forEach(row => {
      pState.board[row].forEach((u, col) => {
        if (u) list.push({ unit: u, row, col });
      });
    });
    return list;
  },

  // Market Actions
  buyUnit(pState, marketIndex) {
    const unit = this.state.market[marketIndex];
    if (!unit) return { ok: false, msg: 'Empty market slot' };
    if (pState.gold < 3) return { ok: false, msg: 'Need 3 Gold to buy a unit' };
    if (pState.bench.length >= 8) return { ok: false, msg: 'Bench is full (max 8)' };

    pState.gold -= 3;
    pState.bench.push(unit);
    this.state.market.splice(marketIndex, 1);
    this.refillMarket();
    return { ok: true, unit };
  },

  buySlot(pState) {
    if (pState.unlockedSlots >= 6) return { ok: false, msg: 'Max 6 slots already unlocked' };
    const cost = SLOT_UNLOCK_COSTS[pState.unlockedSlots - 1];
    if (pState.gold < cost) return { ok: false, msg: `Need ${cost} Gold to unlock slot` };

    pState.gold -= cost;
    pState.unlockedSlots += 1;
    return { ok: true, unlockedSlots: pState.unlockedSlots };
  },

  rerollMarket(pState) {
    if (pState.gold < 2) return { ok: false, msg: 'Need 2 Gold to reroll market' };
    pState.gold -= 2;
    // Shuffle the 5 Market cards back into the deck, then draw 5 new ones
    this.state.market.forEach(u => {
      if (u) this.state.deck.push(u.cls);
    });
    this.state.market = [];
    this.shuffleArray(this.state.deck);
    this.refillMarket();
    return { ok: true };
  },

  sellUnit(pState, location) {
    // Rulebook allows selling from Bench (or we auto-bench then sell)
    let unit = null;
    if (location.zone === 'bench') {
      unit = pState.bench[location.index];
      if (!unit) return { ok: false };
      pState.bench.splice(location.index, 1);
    } else if (location.zone === 'board') {
      unit = pState.board[location.row][location.col];
      if (!unit) return { ok: false };
      pState.board[location.row][location.col] = null;
    }
    const refund = SELL_REFUND[unit.star] || 1;
    pState.gold += refund;

    // Return class card to face-down discard pile
    this.state.discardPile.push(unit.cls);
    return { ok: true, refund, unit };
  },

  // Find all owned units (Bench + Board) for fusion detection
  getAllOwnedUnits(pState) {
    const owned = [];
    pState.bench.forEach((u, idx) => {
      owned.push({ unit: u, zone: 'bench', index: idx });
    });
    ['front', 'back'].forEach(row => {
      pState.board[row].forEach((u, col) => {
        if (u) owned.push({ unit: u, zone: 'board', row, col });
      });
    });
    return owned;
  },

  getFusionCandidates(pState) {
    // 2x 1★ same Class => 1x 2★
    // 3x 2★ same Class => 1x 3★
    const owned = this.getAllOwnedUnits(pState);
    const groups = {};
    owned.forEach(item => {
      const key = `${item.unit.cls}_${item.unit.star}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const candidates = [];
    Object.keys(groups).forEach(key => {
      const [cls, starStr] = key.split('_');
      const star = parseInt(starStr, 10);
      const needed = star === 1 ? 2 : (star === 2 ? 3 : 99);
      if (groups[key].length >= needed) {
        candidates.push({
          cls,
          star,
          needed,
          items: groups[key].slice(0, needed)
        });
      }
    });
    return candidates;
  },

  executeFusion(pState, cls, star, chosenElement) {
    const candidates = this.getFusionCandidates(pState);
    const match = candidates.find(c => c.cls === cls && c.star === star);
    if (!match) return { ok: false, msg: 'Not enough matching units to fuse' };

    const targetItem = match.items[0]; // Keep position of first unit if on board
    const idsToRemove = new Set(match.items.map(i => i.unit.id));

    // Remove from bench
    pState.bench = pState.bench.filter(u => !idsToRemove.has(u.id));
    // Remove from board
    let placedOnBoard = false;
    ['front', 'back'].forEach(row => {
      for (let col = 0; col < 3; col++) {
        const u = pState.board[row][col];
        if (u && idsToRemove.has(u.id)) {
          pState.board[row][col] = null;
        }
      }
    });

    const newUnit = this.createUnitInstance(cls, star + 1, chosenElement);
    if (targetItem.zone === 'board') {
      pState.board[targetItem.row][targetItem.col] = newUnit;
      placedOnBoard = true;
    } else {
      pState.bench.push(newUnit);
    }

    // Note: Per rulebook, fusion material cards are permanently removed from the game (do not go to discard)
    return { ok: true, newUnit, placedOnBoard };
  },

  // Compute active synergies & effective stats for a player's board
  computeSynergies(pState) {
    const boardItems = this.getBoardUnits(pState);
    const classCounts = {};
    const elementCounts = {};

    boardItems.forEach(({ unit }) => {
      classCounts[unit.cls] = (classCounts[unit.cls] || 0) + 1;
      elementCounts[unit.element] = (elementCounts[unit.element] || 0) + 1;
    });

    return { classCounts, elementCounts };
  },

  // Calculate effective combat stats for a single unit on the board (including row penalties & synergies)
  getEffectiveUnitStats(pState, unit, row) {
    const { classCounts, elementCounts } = this.computeSynergies(pState);
    let ap = unit.baseAp;
    let hp = unit.baseHp;
    let penaltyText = '';

    // 1. Row placement penalty
    if (unit.role === 'Melee' && row === 'back') {
      hp = Math.max(1, hp - 1);
      penaltyText = '-1 HP (Back Row)';
    } else if (unit.role === 'Ranged' && row === 'front') {
      ap = Math.max(0, ap - 1);
      penaltyText = '-1 AP (Front Row)';
    }

    // 2. Class synergies
    if (unit.cls === 'Warrior') {
      if ((classCounts.Warrior || 0) >= 2) hp += 1;
      if ((classCounts.Warrior || 0) >= 3) ap += 1;
    }
    if (unit.cls === 'Mage' && (classCounts.Mage || 0) >= 2) {
      ap += 1;
    }

    // 3. Element synergies (Individual & Team-wide)
    if (unit.element === 'Fire' && (elementCounts.Fire || 0) >= 2) ap += 1;
    if (unit.element === 'Earth' && (elementCounts.Earth || 0) >= 2) hp += 1;
    if (unit.element === 'Air' && (elementCounts.Air || 0) >= 2) ap += 1;

    // Light buffs ALL allies on board
    if ((elementCounts.Light || 0) >= 2) ap += 1;
    if ((elementCounts.Light || 0) >= 4) hp += 1;
    if ((elementCounts.Light || 0) >= 6) ap += 1;

    return { ap, hp, penaltyText };
  },

  // ==========================================================================
  // DETERMINISTIC SIMULTANEOUS COMBAT SIMULATOR
  // ==========================================================================
  simulateBattle() {
    const log = [];
    const pSynergies = this.computeSynergies(this.state.player);
    const bSynergies = this.computeSynergies(this.state.bot);

    const createCombatBoard = (pState, side, synergies) => {
      const units = [];
      ['front', 'back'].forEach(row => {
        for (let col = 0; col < 3; col++) {
          const u = pState.board[row][col];
          if (u) {
            const eff = this.getEffectiveUnitStats(pState, u, row);
            units.push({
              ...u,
              side,
              row,
              col,
              ap: eff.ap,
              maxHp: eff.hp,
              hp: eff.hp,
              alive: true,
              stunned: false,
              attacksMade: 0,
              dodgedFirst: false
            });
          }
        }
      });
      return {
        side,
        units,
        synergies,
        healerReviveUsed: false,
        waterReviveUsed: false
      };
    };

    const pBoard = createCombatBoard(this.state.player, 'player', pSynergies);
    const bBoard = createCombatBoard(this.state.bot, 'bot', bSynergies);

    log.push({
      type: 'START',
      text: `Round ${this.state.round} Battle Begins!`,
      snapshot: this.snapshotBoards(pBoard, bBoard)
    });

    const getAlive = (board) => board.units.filter(u => u.alive && u.hp > 0);

    // Helper: Find target for attacker on defenderBoard
    const findTarget = (attacker, attackerBoard, defenderBoard) => {
      const enemies = getAlive(defenderBoard);
      if (enemies.length === 0) return null;

      const classCounts = attackerBoard.synergies.classCounts;

      // Assassin exception: Target lowest HP enemy
      if (attacker.cls === 'Assassin') {
        const sorted = [...enemies].sort((a, b) => a.hp - b.hp || (a.row === 'front' ? -1 : 1) || a.col - b.col);
        return sorted[0];
      }

      // Archer (3) exception: May target back row directly if available
      const preferBackRow = (attacker.cls === 'Archer' && (classCounts.Archer || 0) >= 3);
      const primaryRow = preferBackRow ? 'back' : 'front';
      const secondaryRow = preferBackRow ? 'front' : 'back';

      // Step 1: Enemy directly across in primaryRow
      let direct = enemies.find(e => e.row === primaryRow && e.col === attacker.col);
      if (direct) return direct;

      // Step 2: Leftmost enemy in primaryRow
      const sameRowEnemies = enemies.filter(e => e.row === primaryRow).sort((a, b) => a.col - b.col);
      if (sameRowEnemies.length > 0) return sameRowEnemies[0];

      // Step 3: Enemy directly across in secondaryRow, else leftmost in secondaryRow
      let directSec = enemies.find(e => e.row === secondaryRow && e.col === attacker.col);
      if (directSec) return directSec;

      const otherRowEnemies = enemies.filter(e => e.row === secondaryRow).sort((a, b) => a.col - b.col);
      return otherRowEnemies[0] || null;
    };

    // Helper: Calculate damage reduction on target
    const getDamageReduction = (target, defenderBoard, attacker, attackerBoard) => {
      let red = 0;
      const cCounts = defenderBoard.synergies.classCounts;
      const eCounts = defenderBoard.synergies.elementCounts;

      // Tank (2): -1 dmg taken
      if (target.cls === 'Tank' && (cCounts.Tank || 0) >= 2) red += 1;

      // Tank (3): Adjacent unit in same row gets -1 dmg taken
      if ((cCounts.Tank || 0) >= 3) {
        const adjTank = getAlive(defenderBoard).some(u =>
          u.cls === 'Tank' && u.row === target.row && Math.abs(u.col - target.col) === 1
        );
        if (adjTank) red += 1;
      }

      // Earth (4): Earth units -1 dmg taken; Earth (6): All units -1 dmg taken
      if ((eCounts.Earth || 0) >= 6) {
        red += 1;
      } else if (target.element === 'Earth' && (eCounts.Earth || 0) >= 4) {
        red += 1;
      }

      // Fire (6): Ignore 1 point of damage reduction
      if (attacker.element === 'Fire' && (attackerBoard.synergies.elementCounts.Fire || 0) >= 6) {
        red = Math.max(0, red - 1);
      }

      return red;
    };

    // Execute a wave of simultaneous attacks from a subset of units
    const executeSimultaneousWave = (waveLabel, filterFn) => {
      const pAttackers = getAlive(pBoard).filter(u => filterFn(u, pBoard));
      const bAttackers = getAlive(bBoard).filter(u => filterFn(u, bBoard));

      if (pAttackers.length === 0 && bAttackers.length === 0) return;

      const pendingHits = [];
      const stunStatus = [];

      const queueAttacks = (attackers, atkBoard, defBoard) => {
        attackers.forEach(atk => {
          if (atk.stunned) {
            atk.stunned = false;
            stunStatus.push({ unit: atk });
            return;
          }
          const target = findTarget(atk, atkBoard, defBoard);
          if (!target) return;

          let rawDmg = atk.ap;
          let isCrit = false;
          // Assassin (3): First attack double damage
          if (atk.cls === 'Assassin' && (atkBoard.synergies.classCounts.Assassin || 0) >= 3 && atk.attacksMade === 0) {
            rawDmg *= 2;
            isCrit = true;
          }
          atk.attacksMade += 1;

          pendingHits.push({
            atk,
            atkBoard,
            target,
            defBoard,
            rawDmg,
            isCrit
          });
        });
      };

      queueAttacks(pAttackers, pBoard, bBoard);
      queueAttacks(bAttackers, bBoard, pBoard);

      stunStatus.forEach(s => {
        log.push({
          type: 'STUN_SKIP',
          side: s.unit.side,
          unitId: s.unit.id,
          row: s.unit.row,
          col: s.unit.col,
          text: `${s.unit.side === 'player' ? 'Your' : 'Bot'} ${s.unit.cls} is stunned and skips attack!`,
          snapshot: this.snapshotBoards(pBoard, bBoard)
        });
      });

      if (pendingHits.length === 0) return;

      // Apply all hits simultaneously
      const waveEvents = [];
      pendingHits.forEach(hit => {
        const { atk, atkBoard, target, defBoard, rawDmg, isCrit } = hit;

        // Air (6): Dodge first attack
        if (target.element === 'Air' && (defBoard.synergies.elementCounts.Air || 0) >= 6 && !target.dodgedFirst) {
          target.dodgedFirst = true;
          waveEvents.push({
            atkSide: atk.side,
            atkRow: atk.row,
            atkCol: atk.col,
            targetSide: target.side,
            targetRow: target.row,
            targetCol: target.col,
            dmg: 0,
            dodged: true,
            text: `${target.side === 'player' ? 'Your' : 'Bot'} ${target.cls} dodged ${atk.cls}'s attack! (Air 6)`
          });
          return;
        }

        const red = getDamageReduction(target, defBoard, atk, atkBoard);
        const finalDmg = Math.max(1, rawDmg - red);
        target.hp -= finalDmg;

        // Shadow (2): Enemy hit loses 1 AP (min 1)
        if (atk.element === 'Shadow' && (atkBoard.synergies.elementCounts.Shadow || 0) >= 2) {
          target.ap = Math.max(1, target.ap - 1);
        }

        // Shadow (6): 50% chance to stun
        let stunnedTarget = false;
        if (atk.element === 'Shadow' && (atkBoard.synergies.elementCounts.Shadow || 0) >= 6) {
          if (Math.random() < 0.5) {
            target.stunned = true;
            stunnedTarget = true;
          }
        }

        // Splash damage: Mage (3) or Fire (4)
        const hasMageSplash = atk.cls === 'Mage' && (atkBoard.synergies.classCounts.Mage || 0) >= 3;
        const hasFireSplash = atk.element === 'Fire' && (atkBoard.synergies.elementCounts.Fire || 0) >= 4;
        const splashTargets = [];
        if (hasMageSplash || hasFireSplash) {
          const adj = getAlive(defBoard).filter(e => e.row === target.row && Math.abs(e.col - target.col) === 1);
          if (adj.length > 0) {
            adj[0].hp -= 1;
            splashTargets.push({ row: adj[0].row, col: adj[0].col, side: adj[0].side, cls: adj[0].cls });
          }
        }

        // Water (4): Heal self +1 after taking damage (if still > 0 HP)
        let waterSelfHeal = false;
        if (target.hp > 0 && target.element === 'Water' && (defBoard.synergies.elementCounts.Water || 0) >= 4) {
          target.hp = Math.min(target.maxHp, target.hp + 1);
          waterSelfHeal = true;
        }

        waveEvents.push({
          atkSide: atk.side,
          atkRow: atk.row,
          atkCol: atk.col,
          atkCls: atk.cls,
          targetSide: target.side,
          targetRow: target.row,
          targetCol: target.col,
          targetCls: target.cls,
          dmg: finalDmg,
          isCrit,
          stunnedTarget,
          splashTargets,
          waterSelfHeal,
          text: `${atk.side === 'player' ? 'Your' : 'Bot'} ${atk.cls} hits ${target.cls} for ${finalDmg} DMG${isCrit ? ' (2x CRIT!)' : ''}${splashTargets.length ? ' +1 Splash' : ''}`
        });
      });

      log.push({
        type: 'WAVE',
        waveLabel,
        events: waveEvents,
        snapshot: this.snapshotBoards(pBoard, bBoard)
      });

      // Check deaths & Revives (Healer 3 / Water 6) & Shadow (4) On-Kill +1 AP
      const processDeaths = (board, oppHits) => {
        board.units.forEach(u => {
          if (u.alive && u.hp <= 0) {
            // Check Healer (3) revive (non-healer)
            const hasHealerRevive = (board.synergies.classCounts.Healer || 0) >= 3 && !board.healerReviveUsed && u.cls !== 'Healer';
            const hasWaterRevive = (board.synergies.elementCounts.Water || 0) >= 6 && !board.waterReviveUsed;

            if (hasHealerRevive || hasWaterRevive) {
              if (hasHealerRevive) board.healerReviveUsed = true;
              else board.waterReviveUsed = true;
              u.hp = Math.ceil(u.maxHp / 2);
              log.push({
                type: 'REVIVE',
                side: u.side,
                row: u.row,
                col: u.col,
                text: `✨ ${u.side === 'player' ? 'Your' : 'Bot'} ${u.cls} was REVIVED with ${u.hp} HP!`,
                snapshot: this.snapshotBoards(pBoard, bBoard)
              });
            } else {
              u.hp = 0;
              u.alive = false;
              // Credit killer if Shadow (4)
              const killerHit = oppHits.find(h => h.target === u);
              if (killerHit && killerHit.atk.alive && killerHit.atk.element === 'Shadow' && (killerHit.atkBoard.synergies.elementCounts.Shadow || 0) >= 4) {
                killerHit.atk.ap += 1;
              }
              log.push({
                type: 'DEATH',
                side: u.side,
                row: u.row,
                col: u.col,
                text: `💀 ${u.side === 'player' ? 'Your' : 'Bot'} ${u.cls} was destroyed!`,
                snapshot: this.snapshotBoards(pBoard, bBoard)
              });
            }
          }
        });
      };

      processDeaths(pBoard, pendingHits.filter(h => h.target.side === 'player'));
      processDeaths(bBoard, pendingHits.filter(h => h.target.side === 'bot'));
    };

    // Main Combat Loop (max 15 steps to prevent infinite healer loops)
    let step = 1;
    while (getAlive(pBoard).length > 0 && getAlive(bBoard).length > 0 && step <= 15) {
      // 1. Air Pre-Strike on Step 1 (Air units if Air >= 4, or any Air unit per rule 3 Air Pre-Strike)
      if (step === 1) {
        const isAirPreStrike = (u, board) => u.element === 'Air';
        if (getAlive(pBoard).some(u => isAirPreStrike(u, pBoard)) || getAlive(bBoard).some(u => isAirPreStrike(u, bBoard))) {
          executeSimultaneousWave('🌪️ Air Pre-Strike', isAirPreStrike);
        }
      }

      if (getAlive(pBoard).length === 0 || getAlive(bBoard).length === 0) break;

      // 2. Standard Simultaneous Attack Wave
      executeSimultaneousWave(`⚔️ Clash Step ${step}`, () => true);

      if (getAlive(pBoard).length === 0 || getAlive(bBoard).length === 0) break;

      // 3. End-of-Step Healing (Healers + Water 2 Synergy)
      const healEvents = [];
      const processHeals = (board) => {
        const alive = getAlive(board);
        if (alive.length === 0) return;
        const healers = alive.filter(u => u.cls === 'Healer');
        const bonusHeal = (board.synergies.classCounts.Healer || 0) >= 2 ? 1 : 0;

        healers.forEach(h => {
          const damaged = alive.filter(u => u.hp < u.maxHp).sort((a, b) => a.hp - b.hp);
          if (damaged.length > 0) {
            const ally = damaged[0];
            const amount = h.ap + bonusHeal;
            ally.hp = Math.min(ally.maxHp, ally.hp + amount);
            healEvents.push({
              side: ally.side,
              row: ally.row,
              col: ally.col,
              amount,
              text: `✨ ${h.side === 'player' ? 'Your' : 'Bot'} Healer restores +${amount} HP to ${ally.cls}`
            });
          }
        });

        // Water (2): Heal lowest ally +1
        if ((board.synergies.elementCounts.Water || 0) >= 2) {
          const damaged = alive.filter(u => u.hp < u.maxHp).sort((a, b) => a.hp - b.hp);
          if (damaged.length > 0) {
            const ally = damaged[0];
            ally.hp = Math.min(ally.maxHp, ally.hp + 1);
            healEvents.push({
              side: ally.side,
              row: ally.row,
              col: ally.col,
              amount: 1,
              text: `💧 Water Synergy heals ${ally.cls} for +1 HP`
            });
          }
        }
      };

      processHeals(pBoard);
      processHeals(bBoard);

      if (healEvents.length > 0) {
        log.push({
          type: 'HEAL',
          events: healEvents,
          snapshot: this.snapshotBoards(pBoard, bBoard)
        });
      }

      step += 1;
    }

    // Determine Battle Result per v16 Rulebook
    const pRemaining = getAlive(pBoard).length;
    const bRemaining = getAlive(bBoard).length;
    let outcome = 'TIE'; // 'PLAYER_WIN' | 'BOT_WIN' | 'TIE'

    if (pRemaining > 0 && bRemaining === 0) {
      outcome = 'PLAYER_WIN';
    } else if (bRemaining > 0 && pRemaining === 0) {
      outcome = 'BOT_WIN';
    } else {
      outcome = 'TIE';
    }

    log.push({
      type: 'END',
      outcome,
      pRemaining,
      bRemaining,
      snapshot: this.snapshotBoards(pBoard, bBoard)
    });

    return { outcome, log, pRemaining, bRemaining };
  },

  snapshotBoards(pBoard, bBoard) {
    const mapUnit = (u) => ({
      id: u.id,
      cls: u.cls,
      star: u.star,
      element: u.element,
      row: u.row,
      col: u.col,
      ap: u.ap,
      hp: u.hp,
      maxHp: u.maxHp,
      alive: u.alive,
      stunned: u.stunned
    });
    return {
      player: pBoard.units.map(mapUnit),
      bot: bBoard.units.map(mapUnit)
    };
  },

  // Apply end-of-round economy and loss tokens per v16 Rulebook
  resolveRoundOutcome(outcome) {
    // Base income: All players +3 Gold, Winner +2 bonus Gold
    this.state.player.gold += 3;
    this.state.bot.gold += 3;

    if (outcome === 'PLAYER_WIN') {
      this.state.player.gold += 2;
      this.state.bot.losses += 1;
    } else if (outcome === 'BOT_WIN') {
      this.state.bot.gold += 2;
      this.state.player.losses += 1;
    }
    // Tie = No Loss Tokens, no bonus gold

    // Check end-of-round elimination (6 Loss Tokens)
    if (this.state.player.losses >= 6 || this.state.bot.losses >= 6) {
      this.state.phase = 'GAMEOVER';
    } else {
      this.state.round += 1;
      this.state.phase = 'MARKET';
      this.refillMarket();
    }
  }
};
