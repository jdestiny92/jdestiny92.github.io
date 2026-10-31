/* ==========================================================================
   ENGINE.JS — Core Deterministic Auto-Battler Rulebook (v16) with Undo & Full Animations
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
const ELEMENT_ICONS = { Fire: '🔥', Water: '💧', Earth: '🪨', Air: '🌪️', Light: '☀️', Shadow: '🌑' };

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

const SLOT_UNLOCK_COSTS = [3, 4, 5, 6, 7]; 
const SELL_REFUND = { 1: 1, 2: 3, 3: 9 };
let uidCounter = 1;

const Engine = {
  state: null,
  history: [],

  createNewGame(botDifficulty = 'easy') {
    const deck = [];
    const classes = Object.keys(UNIT_STATS);
    classes.forEach(cls => { for (let i = 0; i < 8; i++) deck.push(cls); });
    this.shuffleArray(deck);
    this.history = [];

    this.state = {
      round: 1,
      phase: 'MARKET', // MARKET | PREPARATION | COMBAT | END | GAMEOVER
      botDifficulty,
      deck,
      discardPile: [],
      market: [],
      lastOutcome: null,
      player: this.createPlayerState('player'),
      bot: this.createPlayerState('bot')
    };

    this.refillMarket();
    return this.state;
  },

  createPlayerState(side) {
    return {
      side, gold: 6, losses: 0, unlockedSlots: 1, bench: [],
      board: { front: [null, null, null], back: [null, null, null] }
    };
  },

  saveSnapshot() {
    if (this.history.length > 20) this.history.shift();
    this.history.push(JSON.stringify(this.state));
  },

  undo() {
    if (this.history.length === 0) return false;
    this.state = JSON.parse(this.history.pop());
    return true;
  },

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  },

  rollElement() { return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)]; },

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
    return { id: 'u_' + (uidCounter++), cls, star, element, role: UNIT_STATS[cls].role, baseAp: base.ap, baseHp: base.hp };
  },

  refillMarket() {
    while (this.state.market.length < 5) {
      const card = this.drawCardFromDeck();
      if (!card) break;
      this.state.market.push(card);
    }
  },

  getBoardCount(pState) {
    let count = 0;
    ['front', 'back'].forEach(r => pState.board[r].forEach(u => { if (u) count++; }));
    return count;
  },

  getBoardUnits(pState) {
    const list = [];
    ['front', 'back'].forEach(row => pState.board[row].forEach((u, col) => { if (u) list.push({ unit: u, row, col }); }));
    return list;
  },

  buyUnit(pState, marketIndex) {
    const unit = this.state.market[marketIndex];
    if (!unit) return { ok: false, msg: 'Empty slot' };
    if (pState.gold < 3) return { ok: false, msg: 'Need 3 Gold' };
    if (pState.bench.length >= 8) return { ok: false, msg: 'Bench full (8/8)' };
    pState.gold -= 3;
    pState.bench.push(unit);
    this.state.market.splice(marketIndex, 1);
    this.refillMarket();
    return { ok: true, unit };
  },

  buySlot(pState) {
    if (pState.unlockedSlots >= 6) return { ok: false, msg: 'Max 6 slots unlocked' };
    const cost = SLOT_UNLOCK_COSTS[pState.unlockedSlots - 1];
    if (pState.gold < cost) return { ok: false, msg: `Need ${cost} Gold` };
    pState.gold -= cost;
    pState.unlockedSlots += 1;
    return { ok: true, unlockedSlots: pState.unlockedSlots, cost };
  },

  rerollMarket(pState) {
    if (pState.gold < 2) return { ok: false, msg: 'Need 2 Gold' };
    pState.gold -= 2;
    this.state.market.forEach(u => { if (u) this.state.deck.push(u.cls); });
    this.state.market = [];
    this.shuffleArray(this.state.deck);
    this.refillMarket();
    return { ok: true };
  },

  sellUnit(pState, location) {
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
    this.state.discardPile.push(unit.cls);
    return { ok: true, refund, unit };
  },

  getAllOwnedUnits(pState) {
    const owned = [];
    pState.bench.forEach((u, idx) => owned.push({ unit: u, zone: 'bench', index: idx }));
    ['front', 'back'].forEach(row => pState.board[row].forEach((u, col) => { if (u) owned.push({ unit: u, zone: 'board', row, col }); }));
    return owned;
  },

  getFusionCandidates(pState) {
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
        candidates.push({ cls, star, needed, items: groups[key].slice(0, needed) });
      }
    });
    return candidates;
  },

  executeFusion(pState, cls, star, chosenElement) {
    const match = this.getFusionCandidates(pState).find(c => c.cls === cls && c.star === star);
    if (!match) return { ok: false };
    const targetItem = match.items[0];
    const idsToRemove = new Set(match.items.map(i => i.unit.id));
    pState.bench = pState.bench.filter(u => !idsToRemove.has(u.id));
    ['front', 'back'].forEach(row => {
      for (let col = 0; col < 3; col++) {
        if (pState.board[row][col] && idsToRemove.has(pState.board[row][col].id)) pState.board[row][col] = null;
      }
    });
    const newUnit = this.createUnitInstance(cls, star + 1, chosenElement);
    if (targetItem.zone === 'board') pState.board[targetItem.row][targetItem.col] = newUnit;
    else pState.bench.push(newUnit);
    return { ok: true, newUnit };
  },

  computeSynergies(pState) {
    const boardItems = this.getBoardUnits(pState);
    const classCounts = {}, elementCounts = {};
    boardItems.forEach(({ unit }) => {
      classCounts[unit.cls] = (classCounts[unit.cls] || 0) + 1;
      elementCounts[unit.element] = (elementCounts[unit.element] || 0) + 1;
    });
    return { classCounts, elementCounts };
  },

  getEffectiveUnitStats(pState, unit, row) {
    const { classCounts, elementCounts } = this.computeSynergies(pState);
    let ap = unit.baseAp, hp = unit.baseHp, penaltyText = '';
    if (unit.role === 'Melee' && row === 'back') { hp = Math.max(1, hp - 1); penaltyText = '-1 HP (Back Row)'; }
    else if (unit.role === 'Ranged' && row === 'front') { ap = Math.max(0, ap - 1); penaltyText = '-1 AP (Front Row)'; }

    if (unit.cls === 'Warrior') {
      if ((classCounts.Warrior || 0) >= 2) hp += 1;
      if ((classCounts.Warrior || 0) >= 3) ap += 1;
    }
    if (unit.cls === 'Mage' && (classCounts.Mage || 0) >= 2) ap += 1;
    if (unit.element === 'Fire' && (elementCounts.Fire || 0) >= 2) ap += 1;
    if (unit.element === 'Earth' && (elementCounts.Earth || 0) >= 2) hp += 1;
    if (unit.element === 'Air' && (elementCounts.Air || 0) >= 2) ap += 1;
    if ((elementCounts.Light || 0) >= 2) ap += 1;
    if ((elementCounts.Light || 0) >= 4) hp += 1;
    if ((elementCounts.Light || 0) >= 6) ap += 1;
    return { ap, hp, penaltyText };
  },

  // ==========================================================================
  // FULL DETERMINISTIC SIMULTANEOUS COMBAT SIMULATOR (WITH ALL ANIMATION DATA)
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
              ...u, side, row, col,
              ap: eff.ap, maxHp: eff.hp, hp: eff.hp,
              alive: true, stunned: false, attacksMade: 0, dodgedFirst: false
            });
          }
        }
      });
      return { side, units, synergies, healerReviveUsed: false, waterReviveUsed: false };
    };

    const pBoard = createCombatBoard(this.state.player, 'player', pSynergies);
    const bBoard = createCombatBoard(this.state.bot, 'bot', bSynergies);

    const snapshotBoards = () => ({
      player: pBoard.units.map(u => ({ ...u })),
      bot: bBoard.units.map(u => ({ ...u }))
    });

    log.push({ type: 'START', text: `Round ${this.state.round} Battle Begins!`, snapshot: snapshotBoards() });

    const getAlive = (board) => board.units.filter(u => u.alive && u.hp > 0);

    const findTarget = (attacker, attackerBoard, defenderBoard) => {
      const enemies = getAlive(defenderBoard);
      if (enemies.length === 0) return null;
      const classCounts = attackerBoard.synergies.classCounts;

      if (attacker.cls === 'Assassin') {
        return [...enemies].sort((a, b) => a.hp - b.hp || (a.row === 'front' ? -1 : 1) || a.col - b.col)[0];
      }

      const preferBackRow = (attacker.cls === 'Archer' && (classCounts.Archer || 0) >= 3);
      const primaryRow = preferBackRow ? 'back' : 'front';
      const secondaryRow = preferBackRow ? 'front' : 'back';

      let direct = enemies.find(e => e.row === primaryRow && e.col === attacker.col);
      if (direct) return direct;

      const sameRow = enemies.filter(e => e.row === primaryRow).sort((a, b) => a.col - b.col);
      if (sameRow.length > 0) return sameRow[0];

      let directSec = enemies.find(e => e.row === secondaryRow && e.col === attacker.col);
      if (directSec) return directSec;

      const otherRow = enemies.filter(e => e.row === secondaryRow).sort((a, b) => a.col - b.col);
      return otherRow[0] || null;
    };

    const getDamageReduction = (target, defenderBoard, attacker, attackerBoard) => {
      let red = 0;
      const cCounts = defenderBoard.synergies.classCounts;
      const eCounts = defenderBoard.synergies.elementCounts;

      if (target.cls === 'Tank' && (cCounts.Tank || 0) >= 2) red += 1;
      if ((cCounts.Tank || 0) >= 3) {
        const adjTank = getAlive(defenderBoard).some(u => u.cls === 'Tank' && u.row === target.row && Math.abs(u.col - target.col) === 1);
        if (adjTank) red += 1;
      }
      if ((eCounts.Earth || 0) >= 6 || (target.element === 'Earth' && (eCounts.Earth || 0) >= 4)) red += 1;
      if (attacker.element === 'Fire' && (attackerBoard.synergies.elementCounts.Fire || 0) >= 6) red = Math.max(0, red - 1);
      return red;
    };

    const executeSimultaneousWave = (waveLabel, filterFn) => {
      const pAttackers = getAlive(pBoard).filter(u => filterFn(u, pBoard));
      const bAttackers = getAlive(bBoard).filter(u => filterFn(u, bBoard));
      if (pAttackers.length === 0 && bAttackers.length === 0) return;

      const pendingHits = [];
      const queueAttacks = (attackers, atkBoard, defBoard) => {
        attackers.forEach(atk => {
          if (atk.stunned) { atk.stunned = false; return; }
          const target = findTarget(atk, atkBoard, defBoard);
          if (!target) return;

          let rawDmg = atk.ap, isCrit = false;
          if (atk.cls === 'Assassin' && (atkBoard.synergies.classCounts.Assassin || 0) >= 3 && atk.attacksMade === 0) {
            rawDmg *= 2; isCrit = true;
          }
          atk.attacksMade += 1;
          pendingHits.push({ atk, atkBoard, target, defBoard, rawDmg, isCrit });
        });
      };

      queueAttacks(pAttackers, pBoard, bBoard);
      queueAttacks(bAttackers, bBoard, pBoard);
      if (pendingHits.length === 0) return;

      const waveEvents = [];
      pendingHits.forEach(hit => {
        const { atk, atkBoard, target, defBoard, rawDmg, isCrit } = hit;

        if (target.element === 'Air' && (defBoard.synergies.elementCounts.Air || 0) >= 6 && !target.dodgedFirst) {
          target.dodgedFirst = true;
          waveEvents.push({
            atkSide: atk.side, atkRow: atk.row, atkCol: atk.col,
            targetSide: target.side, targetRow: target.row, targetCol: target.col,
            dmg: 0, dodged: true
          });
          return;
        }

        const red = getDamageReduction(target, defBoard, atk, atkBoard);
        const finalDmg = Math.max(1, rawDmg - red);
        target.hp -= finalDmg;

        if (atk.element === 'Shadow' && (atkBoard.synergies.elementCounts.Shadow || 0) >= 2) {
          target.ap = Math.max(1, target.ap - 1);
        }
        if (atk.element === 'Shadow' && (atkBoard.synergies.elementCounts.Shadow || 0) >= 6 && Math.random() < 0.5) {
          target.stunned = true;
        }

        const hasMageSplash = atk.cls === 'Mage' && (atkBoard.synergies.classCounts.Mage || 0) >= 3;
        const hasFireSplash = atk.element === 'Fire' && (atkBoard.synergies.elementCounts.Fire || 0) >= 4;
        const splashTargets = [];
        if (hasMageSplash || hasFireSplash) {
          const adj = getAlive(defBoard).filter(e => e.row === target.row && Math.abs(e.col - target.col) === 1);
          if (adj.length > 0) {
            adj[0].hp -= 1;
            splashTargets.push({ side: adj[0].side, row: adj[0].row, col: adj[0].col });
          }
        }

        if (target.hp > 0 && target.element === 'Water' && (defBoard.synergies.elementCounts.Water || 0) >= 4) {
          target.hp = Math.min(target.maxHp, target.hp + 1);
        }

        waveEvents.push({
          atkSide: atk.side, atkRow: atk.row, atkCol: atk.col,
          targetSide: target.side, targetRow: target.row, targetCol: target.col,
          dmg: finalDmg, isCrit, splashTargets
        });
      });

      log.push({ type: 'WAVE', waveLabel, events: waveEvents, snapshot: snapshotBoards() });

      const processDeaths = (board, oppHits) => {
        board.units.forEach(u => {
          if (u.alive && u.hp <= 0) {
            const hasHealerRevive = (board.synergies.classCounts.Healer || 0) >= 3 && !board.healerReviveUsed && u.cls !== 'Healer';
            const hasWaterRevive = (board.synergies.elementCounts.Water || 0) >= 6 && !board.waterReviveUsed;

            if (hasHealerRevive || hasWaterRevive) {
              if (hasHealerRevive) board.healerReviveUsed = true;
              else board.waterReviveUsed = true;
              u.hp = Math.ceil(u.maxHp / 2);
              log.push({ type: 'REVIVE', side: u.side, row: u.row, col: u.col, snapshot: snapshotBoards() });
            } else {
              u.hp = 0; u.alive = false;
              const killerHit = oppHits.find(h => h.target === u);
              if (killerHit && killerHit.atk.alive && killerHit.atk.element === 'Shadow' && (killerHit.atkBoard.synergies.elementCounts.Shadow || 0) >= 4) {
                killerHit.atk.ap += 1;
              }
              log.push({ type: 'DEATH', side: u.side, row: u.row, col: u.col, snapshot: snapshotBoards() });
            }
          }
        });
      };

      processDeaths(pBoard, pendingHits.filter(h => h.target.side === 'player'));
      processDeaths(bBoard, pendingHits.filter(h => h.target.side === 'bot'));
    };

    let step = 1;
    while (getAlive(pBoard).length > 0 && getAlive(bBoard).length > 0 && step <= 15) {
      if (step === 1) {
        const isAir = (u) => u.element === 'Air';
        if (getAlive(pBoard).some(isAir) || getAlive(bBoard).some(isAir)) {
          executeSimultaneousWave('🌪️ Air Pre-Strike', isAir);
        }
      }
      if (getAlive(pBoard).length === 0 || getAlive(bBoard).length === 0) break;

      executeSimultaneousWave(`⚔️ Clash Step ${step}`, () => true);
      if (getAlive(pBoard).length === 0 || getAlive(bBoard).length === 0) break;

      // End-of-Step Healing
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
            healEvents.push({ side: ally.side, row: ally.row, col: ally.col, amount });
          }
        });

        if ((board.synergies.elementCounts.Water || 0) >= 2) {
          const damaged = alive.filter(u => u.hp < u.maxHp).sort((a, b) => a.hp - b.hp);
          if (damaged.length > 0) {
            const ally = damaged[0];
            ally.hp = Math.min(ally.maxHp, ally.hp + 1);
            healEvents.push({ side: ally.side, row: ally.row, col: ally.col, amount: 1 });
          }
        }
      };

      processHeals(pBoard);
      processHeals(bBoard);
      if (healEvents.length > 0) {
        log.push({ type: 'HEAL', events: healEvents, snapshot: snapshotBoards() });
      }
      step += 1;
    }

    const pRemaining = getAlive(pBoard).length;
    const bRemaining = getAlive(bBoard).length;
    let outcome = (pRemaining > 0 && bRemaining === 0) ? 'PLAYER_WIN' : (bRemaining > 0 && pRemaining === 0) ? 'BOT_WIN' : 'TIE';

    log.push({ type: 'END', outcome, pRemaining, bRemaining, snapshot: snapshotBoards() });
    return { outcome, log, pRemaining, bRemaining };
  },

  // Step 1: Apply gold & loss tokens at the end of Combat and enter END phase
  applyBattleOutcome(outcome, pRemaining, bRemaining) {
    let playerGoldEarned = 3;
    let botGoldEarned = 3;

    if (outcome === 'PLAYER_WIN') {
      playerGoldEarned += 2;
      this.state.bot.losses += 1;
    } else if (outcome === 'BOT_WIN') {
      botGoldEarned += 2;
      this.state.player.losses += 1;
    }

    this.state.player.gold += playerGoldEarned;
    this.state.bot.gold += botGoldEarned;

    this.state.lastOutcome = {
      outcome,
      pRemaining,
      bRemaining,
      playerGoldEarned,
      botGoldEarned
    };

    if (this.state.player.losses >= 6 || this.state.bot.losses >= 6) {
      this.state.phase = 'GAMEOVER';
    } else {
      this.state.phase = 'END';
    }
    return this.state.lastOutcome;
  },

  // Step 2: Called when user clicks "Next Market Phase" on the End Phase modal
  advanceToNextMarketRound() {
    this.state.round += 1;
    this.state.phase = 'MARKET';
    this.history = [];
    this.refillMarket();
  }
};
