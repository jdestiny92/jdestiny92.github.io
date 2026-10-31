/* ==========================================================================
   ENGINE.JS — Core Deterministic Auto-Battler Rulebook (v16) with Undo
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
const SLOT_UNLOCK_COSTS = [3, 4, 5, 6, 7]; 
const SELL_REFUND = { 1: 1, 2: 3, 3: 9 };
let uidCounter = 1;

const Engine = {
  state: null,
  history: [], // Stack for undo functionality

  createNewGame(botDifficulty = 'easy') {
    const deck = [];
    const classes = Object.keys(UNIT_STATS);
    classes.forEach(cls => { for (let i = 0; i < 8; i++) deck.push(cls); });
    this.shuffleArray(deck);
    this.history = [];

    this.state = {
      round: 1,
      phase: 'MARKET', // Phases: MARKET, PREPARATION, COMBAT, GAMEOVER
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
      side, gold: 6, losses: 0, unlockedSlots: 1, bench: [],
      board: { front: [null, null, null], back: [null, null, null] }
    };
  },

  // SNAPSHOT & UNDO LOGIC
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
    const base = UNIT_STATS[cls].stars[1];
    return { id: 'u_' + (uidCounter++), cls, star: 1, element: this.rollElement(), role: UNIT_STATS[cls].role, baseAp: base.ap, baseHp: base.hp };
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

  // Actions
  buyUnit(pState, marketIndex) {
    const unit = this.state.market[marketIndex];
    if (!unit || pState.gold < 3 || pState.bench.length >= 8) return { ok: false };
    pState.gold -= 3;
    pState.bench.push(unit);
    this.state.market.splice(marketIndex, 1);
    this.refillMarket();
    return { ok: true, unit };
  },
  buySlot(pState) {
    if (pState.unlockedSlots >= 6) return { ok: false };
    const cost = SLOT_UNLOCK_COSTS[pState.unlockedSlots - 1];
    if (pState.gold < cost) return { ok: false };
    pState.gold -= cost;
    pState.unlockedSlots += 1;
    return { ok: true, unlockedSlots: pState.unlockedSlots };
  },
  rerollMarket(pState) {
    if (pState.gold < 2) return { ok: false };
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

  // Combat Engine
  simulateBattle() {
    const log = [];
    const createCombatBoard = (pState, side) => {
      const synergies = this.computeSynergies(pState);
      const units = [];
      ['front', 'back'].forEach(row => {
        for (let col = 0; col < 3; col++) {
          const u = pState.board[row][col];
          if (u) {
            const eff = this.getEffectiveUnitStats(pState, u, row);
            units.push({ ...u, side, row, col, ap: eff.ap, maxHp: eff.hp, hp: eff.hp, alive: true, stunned: false, attacksMade: 0, dodgedFirst: false });
          }
        }
      });
      return { side, units, synergies, healerReviveUsed: false, waterReviveUsed: false };
    };
    const pBoard = createCombatBoard(this.state.player, 'player');
    const bBoard = createCombatBoard(this.state.bot, 'bot');
    const getAlive = (board) => board.units.filter(u => u.alive && u.hp > 0);
    const snapshotBoards = () => ({
      player: pBoard.units.map(u => ({...u})), bot: bBoard.units.map(u => ({...u}))
    });

    log.push({ type: 'START', text: `Round ${this.state.round} Battle Begins!`, snapshot: snapshotBoards() });

    const executeSimultaneousWave = (waveLabel, filterFn) => {
      const pAttackers = getAlive(pBoard).filter(u => filterFn(u, pBoard));
      const bAttackers = getAlive(bBoard).filter(u => filterFn(u, bBoard));
      if (!pAttackers.length && !bAttackers.length) return;
      const pendingHits = [];

      const queueAttacks = (attackers, atkBoard, defBoard) => {
        attackers.forEach(atk => {
          if (atk.stunned) { atk.stunned = false; return; }
          const enemies = getAlive(defBoard);
          if (!enemies.length) return;
          let target = null;
          if (atk.cls === 'Assassin') {
            target = [...enemies].sort((a,b)=>a.hp-b.hp)[0];
          } else {
            const prefRow = (atk.cls==='Archer' && (atkBoard.synergies.classCounts.Archer||0)>=3) ? 'back' : 'front';
            const secRow = prefRow==='back' ? 'front' : 'back';
            target = enemies.find(e=>e.row===prefRow && e.col===atk.col) || enemies.filter(e=>e.row===prefRow).sort((a,b)=>a.col-b.col)[0] || enemies.find(e=>e.row===secRow && e.col===atk.col) || enemies.filter(e=>e.row===secRow).sort((a,b)=>a.col-b.col)[0];
          }
          if (target) {
            let rawDmg = atk.ap, isCrit = false;
            if (atk.cls==='Assassin' && (atkBoard.synergies.classCounts.Assassin||0)>=3 && atk.attacksMade===0) { rawDmg*=2; isCrit=true; }
            atk.attacksMade++;
            pendingHits.push({atk, atkBoard, target, defBoard, rawDmg, isCrit});
          }
        });
      };

      queueAttacks(pAttackers, pBoard, bBoard);
      queueAttacks(bAttackers, bBoard, pBoard);

      const waveEvents = [];
      pendingHits.forEach(hit => {
        const { atk, atkBoard, target, defBoard, rawDmg, isCrit } = hit;
        if (target.element==='Air' && (defBoard.synergies.elementCounts.Air||0)>=6 && !target.dodgedFirst) {
          target.dodgedFirst = true; waveEvents.push({ atkSide:atk.side, targetSide:target.side, dmg:0, dodged:true }); return;
        }
        let red = 0;
        if (target.cls==='Tank' && (defBoard.synergies.classCounts.Tank||0)>=2) red+=1;
        if ((defBoard.synergies.elementCounts.Earth||0)>=6 || (target.element==='Earth' && (defBoard.synergies.elementCounts.Earth||0)>=4)) red+=1;
        if (atk.element==='Fire' && (atkBoard.synergies.elementCounts.Fire||0)>=6) red = Math.max(0, red-1);
        
        const finalDmg = Math.max(1, rawDmg - red);
        target.hp -= finalDmg;
        if (atk.element==='Shadow' && (atkBoard.synergies.elementCounts.Shadow||0)>=2) target.ap = Math.max(1, target.ap-1);
        
        waveEvents.push({ atkSide:atk.side, targetSide:target.side, dmg:finalDmg, isCrit });
      });

      log.push({ type: 'WAVE', waveLabel, events: waveEvents, snapshot: snapshotBoards() });

      const processDeaths = (board) => {
        board.units.forEach(u => {
          if (u.alive && u.hp<=0) {
            if (((board.synergies.classCounts.Healer||0)>=3 && !board.healerReviveUsed && u.cls!=='Healer') || ((board.synergies.elementCounts.Water||0)>=6 && !board.waterReviveUsed)) {
              if (u.cls!=='Healer' && (board.synergies.classCounts.Healer||0)>=3) board.healerReviveUsed=true; else board.waterReviveUsed=true;
              u.hp = Math.ceil(u.maxHp/2); log.push({ type: 'REVIVE', snapshot: snapshotBoards() });
            } else { u.hp=0; u.alive=false; }
          }
        });
      };
      processDeaths(pBoard); processDeaths(bBoard);
    };

    let step = 1;
    while (getAlive(pBoard).length>0 && getAlive(bBoard).length>0 && step<=15) {
      if (step===1) executeSimultaneousWave('🌪️ Air Pre-Strike', (u) => u.element==='Air');
      if (!getAlive(pBoard).length || !getAlive(bBoard).length) break;
      executeSimultaneousWave(`⚔️ Clash Step ${step}`, () => true);
      step++;
    }

    const pRemaining = getAlive(pBoard).length, bRemaining = getAlive(bBoard).length;
    let outcome = (pRemaining > 0 && bRemaining === 0) ? 'PLAYER_WIN' : (bRemaining > 0 && pRemaining === 0) ? 'BOT_WIN' : 'TIE';
    log.push({ type: 'END', outcome, snapshot: snapshotBoards() });
    return { outcome, log };
  },

  resolveRoundOutcome(outcome) {
    this.state.player.gold += 3; this.state.bot.gold += 3;
    if (outcome === 'PLAYER_WIN') { this.state.player.gold += 2; this.state.bot.losses += 1; }
    else if (outcome === 'BOT_WIN') { this.state.bot.gold += 2; this.state.player.losses += 1; }

    if (this.state.player.losses >= 6 || this.state.bot.losses >= 6) this.state.phase = 'GAMEOVER';
    else { this.state.round += 1; this.state.phase = 'MARKET'; this.history = []; this.refillMarket(); }
  }
};
