const ROWS = 4;
const COLS = 8;
const PLAYER_MAX_HP = 500;
const ENEMY_MAX_HP = 200;
const ENEMY_MAX_GUARD = 100;
const MAX_HAND = 8;
const DRAW_INTERVAL = 6000;
const ENEMY_INTERVAL = 2500;
const BOOST_COST = 3;
const TOUCH_TAP_DISTANCE = 10;
const TOUCH_DOUBLE_TAP_DELAY = 320;
const TOUCH_GESTURE_THRESHOLD = 18;
const TOUCH_DISCARD_DISTANCE = 64;

const els = {
  board: document.getElementById("board"),
  unitLayer: document.getElementById("unitLayer"),
  hand: document.getElementById("hand"),
  playerHpText: document.getElementById("playerHpText"),
  playerHpBar: document.getElementById("playerHpBar"),
  enemyHpText: document.getElementById("enemyHpText"),
  enemyHpBar: document.getElementById("enemyHpBar"),
  enemyGuardText: document.getElementById("enemyGuardText"),
  enemyGuardBar: document.getElementById("enemyGuardBar"),
  moveStepsText: document.getElementById("moveStepsText"),
  woundOrbText: document.getElementById("woundOrbText"),
  swiftOrbText: document.getElementById("swiftOrbText"),
  woundOrb: document.getElementById("woundOrb"),
  swiftOrb: document.getElementById("swiftOrb"),
  woundOrbHitbox: document.getElementById("woundOrbHitbox"),
  swiftOrbHitbox: document.getElementById("swiftOrbHitbox"),
  drawProgressBar: document.getElementById("drawProgressBar"),
  drawCountdownText: document.getElementById("drawCountdownText"),
  battleLog: document.getElementById("battleLog"),
  teleportHint: document.getElementById("teleportHint"),
  restartBtn: document.getElementById("restartBtn"),
  redrawBtn: document.getElementById("redrawBtn"),
  overlay: document.getElementById("resultOverlay"),
  resultTitle: document.getElementById("resultTitle"),
  overlayRestartBtn: document.getElementById("overlayRestartBtn"),
};

const moveGlyphs = { up: "↑", down: "↓", left: "←", right: "→" };
const shapePatterns = {
  line2H: [3, 4],
  cross: [1, 3, 4, 5, 7],
  row: [3, 4, 5],
  diagonal3: [0, 4, 8],
  block6: [0, 1, 3, 4, 6, 7],
};

const cardBases = [
  {
    id: "cangsong",
    school: "wound",
    name: "華山劍法：蒼松迎客",
    damage: 20,
    guardDamage: 10,
    shape: "line2H",
    rangeDesc: "攻擊前方第四、第五格。",
    getCells: (pos) => [[pos.r, pos.c + 4], [pos.r, pos.c + 5]],
  },
  {
    id: "youfeng",
    school: "wound",
    name: "華山劍法：有鳳來儀",
    damage: 10,
    guardDamage: 20,
    shape: "cross",
    rangeDesc: "攻擊前方三至五格與第四格上下。",
    getCells: (pos) => [
      [pos.r, pos.c + 3],
      [pos.r, pos.c + 4],
      [pos.r, pos.c + 5],
      [pos.r - 1, pos.c + 4],
      [pos.r + 1, pos.c + 4],
    ],
  },
  {
    id: "baihong",
    school: "wound",
    name: "華山劍法：白虹貫日",
    damage: 30,
    guardDamage: 30,
    shape: "row",
    rangeDesc: "攻擊角色目前橫排整排。",
    getCells: (pos) => Array.from({ length: COLS }, (_, c) => [pos.r, c]),
  },
  {
    id: "kuangfengzhouyu",
    school: "swift",
    name: "狂風快劍：狂風驟雨",
    damage: 10,
    guardDamage: 10,
    shape: "diagonal3",
    linkedMove: true,
    rangeDesc: "攻擊前方斜排三格，施展時同步移動。",
    getCells: (pos) => [[pos.r - 1, pos.c + 3], [pos.r, pos.c + 4], [pos.r + 1, pos.c + 5]],
  },
  {
    id: "fengjuanyuncan",
    school: "swift",
    name: "狂風快劍：風捲雲殘",
    damage: 5,
    guardDamage: 15,
    shape: "block6",
    linkedMove: true,
    rangeDesc: "攻擊前方三列兩欄共六格，施展時同步移動。",
    getCells: (pos) => [
      [pos.r - 1, pos.c + 3],
      [pos.r - 1, pos.c + 4],
      [pos.r, pos.c + 3],
      [pos.r, pos.c + 4],
      [pos.r + 1, pos.c + 3],
      [pos.r + 1, pos.c + 4],
    ],
  },
];

const state = {
  wound: 0,
  swift: 0,
  moveSteps: 0,
  armedBoost: null,
  playerHp: PLAYER_MAX_HP,
  enemyHp: ENEMY_MAX_HP,
  enemyGuard: ENEMY_MAX_GUARD,
  player: { r: 1, c: 1 },
  enemy: { r: 1, c: 5 },
  deck: [],
  discard: [],
  hand: [],
  enemyAttack: [],
  drag: null,
  dragPreview: { mode: null, cells: [] },
  enemyStunned: false,
  teleportTargeting: false,
  drawElapsed: 0,
  enemyElapsed: 0,
  lastFrameAt: 0,
  gameOver: false,
};

let lastTouchTap = null;
let pendingTouchCard = null;
let boardSwipe = null;

function makeDeck() {
  return cardBases.flatMap((base) =>
    Array.from({ length: 4 }, () => makeCard(base)),
  );
}

function makeCard(base) {
  const moveValue = randomInt(1, 3);
  const mobilityScale = { 1: 0.5, 2: 0.75, 3: 1 }[moveValue];
  const damage = Math.round(base.damage * mobilityScale);
  const guardDamage = Math.round(base.guardDamage * mobilityScale);
  return {
    ...base,
    uid: `${base.id}-${crypto.randomUUID()}`,
    moveValue,
    damage,
    guardDamage,
    desc: `造成${damage}點傷害，${guardDamage}點破韌。${base.rangeDesc}`,
  };
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function sameCell(a, b) {
  return a.r === b.r && a.c === b.c;
}

function uniqueCells(cells) {
  const seen = new Set();
  return cells.filter(([r, c]) => {
    if (!inBounds(r, c)) return false;
    const key = `${r},${c}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resetGame() {
  Object.assign(state, {
    wound: 0,
    swift: 0,
    moveSteps: 0,
    armedBoost: null,
    playerHp: PLAYER_MAX_HP,
    enemyHp: ENEMY_MAX_HP,
    enemyGuard: ENEMY_MAX_GUARD,
    player: { r: 1, c: 1 },
    enemy: { r: 1, c: 5 },
    deck: shuffle(makeDeck()),
    discard: [],
    hand: [],
    enemyAttack: [],
    drag: null,
    dragPreview: { mode: null, cells: [] },
    enemyStunned: false,
    teleportTargeting: false,
    drawElapsed: 0,
    enemyElapsed: 0,
    lastFrameAt: performance.now(),
    gameOver: false,
  });
  els.overlay.classList.add("hidden");
  drawCards(5);
  moveEnemyRandomly(randomInt(1, 3));
  state.enemyAttack = makeEnemyAttack();
  setLog("敵人已預告下一次攻擊。");
  render();
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function drawCards(count) {
  for (let i = 0; i < count && state.hand.length < MAX_HAND; i += 1) {
    if (!state.deck.length) {
      state.deck = shuffle(state.discard);
      state.discard = [];
    }
    const card = state.deck.shift();
    if (card) state.hand.push(card);
  }
}

function redrawHand() {
  if (state.gameOver) return;
  state.discard.push(...state.hand);
  state.hand = [];
  drawCards(5);
  render();
}

function gameLoop(now) {
  const delta = Math.min(100, now - state.lastFrameAt);
  state.lastFrameAt = now;
  if (!state.gameOver) {
    state.drawElapsed += delta;
    state.enemyElapsed += delta;
    if (state.drawElapsed >= DRAW_INTERVAL) {
      state.drawElapsed %= DRAW_INTERVAL;
      if (state.drag) {
        state.drawElapsed = DRAW_INTERVAL - 1;
      } else {
        drawCards(2);
        renderHand();
      }
    }
    if (state.enemyElapsed >= ENEMY_INTERVAL) {
      state.enemyElapsed %= ENEMY_INTERVAL;
      resolveEnemyAction();
    }
    renderTimeline();
    renderEnemyActionBar();
  }
  requestAnimationFrame(gameLoop);
}

function moveEnemyRandomly(steps) {
  for (let i = 0; i < steps; i += 1) {
    const options = [
      { r: state.enemy.r - 1, c: state.enemy.c },
      { r: state.enemy.r + 1, c: state.enemy.c },
      { r: state.enemy.r, c: state.enemy.c - 1 },
      { r: state.enemy.r, c: state.enemy.c + 1 },
    ].filter((p) => inBounds(p.r, p.c) && p.c >= 4);
    if (options.length) state.enemy = options[Math.floor(Math.random() * options.length)];
  }
}

function resolveEnemyAction() {
  let playerWasHit = false;
  if (!state.enemyStunned && state.enemyAttack.some(([r, c]) => r === state.player.r && c === state.player.c)) {
    state.playerHp = Math.max(0, state.playerHp - 40);
    playerWasHit = true;
  }
  state.enemyStunned = false;
  state.enemyGuard = ENEMY_MAX_GUARD;
  moveEnemyRandomly(randomInt(1, 3));
  state.enemyAttack = makeEnemyAttack();
  checkResult();
  render();
  if (playerWasHit) {
    requestAnimationFrame(() => {
      flashCells([[state.player.r, state.player.c]]);
      animateUnit("player", "damaged");
      showDamageNumber(40, false, "player");
    });
  }
}

function makeEnemyAttack() {
  const player = state.player;
  const escapeCells = [
    [player.r, player.c],
    [player.r - 1, player.c],
    [player.r + 1, player.c],
    [player.r, player.c - 1],
    [player.r, player.c + 1],
  ].filter(([r, c]) => inBounds(r, c) && c < 4);
  const plans = [makePlayerAimedPlan(player), makeMobilityTrapPlan(player), makeEscapeCutoffPlan(escapeCells)];
  return uniqueCells(plans[Math.floor(Math.random() * plans.length)].filter(([, c]) => c < 4));
}

function makePlayerAimedPlan(player) {
  const type = ["horizontal", "vertical", "cross", "x"][Math.floor(Math.random() * 4)];
  if (type === "horizontal") return [[player.r - 1, player.c], ...Array.from({ length: 4 }, (_, c) => [player.r, c]), [player.r + 1, player.c]];
  if (type === "vertical") return [[player.r, player.c - 1], ...Array.from({ length: ROWS }, (_, r) => [r, player.c]), [player.r, player.c + 1]];
  if (type === "cross") {
    return [
      [player.r, player.c],
      [player.r - 1, player.c],
      [player.r + 1, player.c],
      [player.r, player.c - 1],
      [player.r, player.c + 1],
      [player.r - 2, player.c],
      [player.r + 2, player.c],
    ];
  }
  return [
    [player.r, player.c],
    [player.r - 1, player.c - 1],
    [player.r - 1, player.c + 1],
    [player.r + 1, player.c - 1],
    [player.r + 1, player.c + 1],
  ];
}

function makeMobilityTrapPlan(player) {
  return [
    [player.r, player.c],
    [player.r - 1, player.c],
    [player.r + 1, player.c],
    [player.r, player.c - 1],
    [player.r, player.c + 1],
  ];
}

function makeEscapeCutoffPlan(escapeCells) {
  const bestRow = Array.from({ length: ROWS }, (_, r) => ({
    r,
    score: escapeCells.filter(([er]) => er === r).length,
  })).sort((a, b) => b.score - a.score)[0].r;
  return [
    ...Array.from({ length: 4 }, (_, c) => [bestRow, c]),
    ...Array.from({ length: 4 }, (_, c) => [bestRow - 1, c]),
  ];
}

function getBaseCardCells(card) {
  return uniqueCells(card.getCells(state.player));
}

function getCardCells(card, boost = null) {
  const base = getBaseCardCells(card);
  if (!boost) return base;
  if (card.shape === "row") {
    return uniqueCells([state.player.r - 1, state.player.r, state.player.r + 1].flatMap((r) => Array.from({ length: COLS }, (_, c) => [r, c])));
  }
  return uniqueCells(base.flatMap(([r, c]) => [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]));
}

function nextPosition(pos, dir) {
  const delta = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
  const next = { r: pos.r + delta[0], c: pos.c + delta[1] };
  return inBounds(next.r, next.c) && next.c < 4 ? next : null;
}

function playCard(card) {
  if (state.gameOver || state.teleportTargeting) return;
  const boost = state.armedBoost;
  const cells = getCardCells(card, boost);
  const hitEnemy = cells.some(([r, c]) => r === state.enemy.r && c === state.enemy.c);
  const multiplier = boost === "wound" ? 2 : boost === "swift" ? 1.5 : 1;
  const stunMultiplier = state.enemyStunned ? 2 : 1;
  const actualDamage = Math.round(card.damage * multiplier * stunMultiplier);
  const actualGuard = Math.round(card.guardDamage * multiplier);
  removeFromHand(card.uid);
  state[card.school] += 1;
  if (hitEnemy) {
    state.enemyHp = Math.max(0, state.enemyHp - actualDamage);
    state.enemyGuard = Math.max(0, state.enemyGuard - actualGuard);
    if (state.enemyGuard === 0) {
      state.enemyStunned = true;
      state.enemyAttack = [];
    }
  }
  const boostedSwiftOnWound = boost === "swift" && card.school === "wound";
  if (card.linkedMove || boostedSwiftOnWound) gainLinkedMove(card);
  if (boost === "swift" && card.school === "swift") {
    state.teleportTargeting = true;
    setLog("點選格子進行跳躍");
  }
  state.armedBoost = null;
  checkResult();
  render();
  requestAnimationFrame(() => {
    flashCells(cells);
    addSlash(cells);
    animateUnit("player", "attacking");
    if (hitEnemy) {
      animateUnit("enemy", "damaged");
      showDamageNumber(actualDamage, Boolean(boost));
    }
  });
}

function gainLinkedMove(card) {
  state.moveSteps += card.moveValue;
  setLog(`獲得 ${card.moveValue} 點移動步數，目前 ${state.moveSteps} 點。`);
}

function sacrificeCardForMove(card) {
  state.moveSteps += card.moveValue;
  removeFromHand(card.uid);
  setLog(`犧牲卡牌，獲得 ${card.moveValue} 點移動步數，目前 ${state.moveSteps} 點。`);
  render();
}

function removeFromHand(uid) {
  const idx = state.hand.findIndex((card) => card.uid === uid);
  if (idx >= 0) {
    const [card] = state.hand.splice(idx, 1);
    state.discard.push(card);
  }
}

function armBoost(type) {
  if (state[type] < BOOST_COST) {
    setLog(`${type === "wound" ? "傷" : "訊"}能量不足，需累積 3 點。`);
    pulseOrb(type, "denied");
    return;
  }
  if (state.armedBoost === type) return;
  state[type] -= BOOST_COST;
  state.armedBoost = type;
  setLog(type === "wound" ? "傷能量已啟動：下一張卡牌會被強化。" : "訊能量已啟動：下一張卡牌會被強化。");
  renderHud();
  renderHand();
  pulseOrb(type, "activate");
}

function pulseOrb(type, className) {
  const orb = type === "wound" ? els.woundOrb : els.swiftOrb;
  orb.classList.remove(className);
  void orb.offsetWidth;
  orb.classList.add(className);
  setTimeout(() => orb.classList.remove(className), 420);
}


function startCardDrag(event, card) {
  if (state.gameOver || state.teleportTargeting || event.button !== 0 || state.drag) return;
  if (event.pointerType === "touch") {
    pendingTouchCard = {
      cardId: card.uid,
      pointerId: event.pointerId,
      node: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
    };
    return;
  }
  beginCardDrag(event, card);
}

function beginCardDrag(event, card, start = null, nodeOverride = null) {
  if (state.gameOver || state.teleportTargeting || state.drag) return;
  event.preventDefault();
  const node = nodeOverride ?? event.currentTarget;
  const rect = node.getBoundingClientRect();
  const pointerId = event.pointerId ?? "mouse";
  state.drag = {
    cardId: card.uid,
    pointerId,
    pointerType: event.pointerType ?? "mouse",
    node,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    startX: start?.startX ?? event.clientX,
    startY: start?.startY ?? event.clientY,
    moved: false,
  };
  if (event.pointerId !== undefined && node.setPointerCapture) {
    node.setPointerCapture(event.pointerId);
  }
  node.classList.add("dragging");
  node.style.width = `${rect.width}px`;
  moveCardDrag(event);
}

function startNativeCardDrag(event, card) {
  if (state.gameOver || state.teleportTargeting) {
    event.preventDefault();
    return;
  }
  if (!state.drag) {
    state.drag = {
      cardId: card.uid,
      pointerId: "native-drag",
      node: event.currentTarget,
      offsetX: 0,
      offsetY: 0,
    };
  }
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.uid);
  event.currentTarget.classList.add("dragging");
}

function moveCardDrag(event) {
  const pointerId = event.pointerId ?? "mouse";
  if (pendingTouchCard && pendingTouchCard.pointerId === pointerId) {
    const dx = event.clientX - pendingTouchCard.startX;
    const dy = event.clientY - pendingTouchCard.startY;
    if (Math.abs(dx) < TOUCH_GESTURE_THRESHOLD && Math.abs(dy) < TOUCH_GESTURE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      pendingTouchCard = null;
      return;
    }
    const card = state.hand.find((item) => item.uid === pendingTouchCard.cardId);
    if (!card) {
      pendingTouchCard = null;
      return;
    }
    const start = pendingTouchCard;
    pendingTouchCard = null;
    beginCardDrag(event, card, start, start.node);
  }
  if (!state.drag || state.drag.pointerId !== pointerId) return;
  if (Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY) > TOUCH_TAP_DISTANCE) {
    state.drag.moved = true;
  }
  state.drag.node.style.left = `${event.clientX - state.drag.offsetX}px`;
  state.drag.node.style.top = `${event.clientY - state.drag.offsetY}px`;
  updateDragPreview(event.clientX, event.clientY);
  renderBoard();
}

function endCardDrag(event) {
  const pointerId = event.pointerId ?? "mouse";
  if (pendingTouchCard && pendingTouchCard.pointerId === pointerId) {
    const card = state.hand.find((item) => item.uid === pendingTouchCard.cardId);
    pendingTouchCard = null;
    if (card) registerTouchTap(card);
    return;
  }
  if (!state.drag || state.drag.pointerId !== pointerId) return;
  const drag = state.drag;
  const card = state.hand.find((item) => item.uid === drag.cardId);
  const mode = getDropMode(event.clientX, event.clientY, drag);
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  if (card && drag.pointerType === "touch" && mode === "cancel" && !drag.moved) {
    registerTouchTap(card);
    render();
  } else if (card && mode === "discard") sacrificeCardForMove(card);
  else if (card && mode === "cast") playCard(card);
  else render();
}

function registerTouchTap(card) {
  const now = performance.now();
  if (lastTouchTap && lastTouchTap.cardId === card.uid && now - lastTouchTap.at <= TOUCH_DOUBLE_TAP_DELAY) {
    lastTouchTap = null;
    sacrificeCardForMove(card);
    return;
  }
  lastTouchTap = { cardId: card.uid, at: now };
}

function cancelCardDrag() {
  pendingTouchCard = null;
  boardSwipe = null;
  if (!state.drag) return;
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  render();
}

function updateNativeDragPreview(event) {
  if (!state.drag) return;
  event.preventDefault();
  updateDragPreview(event.clientX, event.clientY);
  renderBoard();
}

function endNativeCardDrag(event) {
  if (!state.drag) return;
  event.preventDefault();
  const card = state.hand.find((item) => item.uid === state.drag.cardId);
  const mode = getDropMode(event.clientX, event.clientY);
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  if (card && mode === "cast") playCard(card);
  else render();
}

function getDropMode(clientX, clientY, drag = null) {
  const handRect = els.hand.getBoundingClientRect();
  if (drag?.pointerType === "touch" && clientY - drag.startY >= TOUCH_DISCARD_DISTANCE) return "discard";
  if (clientX >= handRect.left && clientX <= handRect.right && clientY >= handRect.top && clientY <= handRect.bottom) return "cancel";
  return "cast";
}

function updateDragPreview(clientX, clientY) {
  const card = state.drag ? state.hand.find((item) => item.uid === state.drag.cardId) : null;
  if (!card) return;
  const mode = getDropMode(clientX, clientY, state.drag);
  state.dragPreview = { mode, cells: mode === "cast" ? getCardCells(card, state.armedBoost) : [] };
}

function render() {
  renderHud();
  renderBoard();
  renderHand();
  requestAnimationFrame(renderUnits);
}

function renderHud() {
  els.playerHpText.textContent = `${state.playerHp} / ${PLAYER_MAX_HP}`;
  els.playerHpBar.style.width = `${(state.playerHp / PLAYER_MAX_HP) * 100}%`;
  els.enemyHpText.textContent = `${state.enemyHp} / ${ENEMY_MAX_HP}`;
  els.enemyHpBar.style.width = `${(state.enemyHp / ENEMY_MAX_HP) * 100}%`;
  els.enemyGuardText.textContent = `${state.enemyGuard} / ${ENEMY_MAX_GUARD}`;
  els.enemyGuardBar.style.width = `${(state.enemyGuard / ENEMY_MAX_GUARD) * 100}%`;
  els.moveStepsText.textContent = state.moveSteps;
  els.woundOrbText.textContent = state.wound;
  els.swiftOrbText.textContent = state.swift;
  els.woundOrb.classList.toggle("ready", state.wound >= BOOST_COST);
  els.swiftOrb.classList.toggle("ready", state.swift >= BOOST_COST);
  els.woundOrb.classList.toggle("armed", state.armedBoost === "wound");
  els.swiftOrb.classList.toggle("armed", state.armedBoost === "swift");
}

function renderTimeline() {
  const ratio = state.drawElapsed / DRAW_INTERVAL;
  els.drawProgressBar.style.width = `${ratio * 100}%`;
  els.drawCountdownText.textContent = `${((DRAW_INTERVAL - state.drawElapsed) / 1000).toFixed(1)}s`;
}

function renderBoard() {
  const attackPreview = state.dragPreview.mode === "cast" ? state.dragPreview.cells : [];
  const movePreview = [];
  const attackSet = new Set(state.enemyAttack.map(([r, c]) => `${r},${c}`));
  const previewSet = new Set(attackPreview.map(([r, c]) => `${r},${c}`));
  const moveSet = new Set(movePreview.map(([r, c]) => `${r},${c}`));
  els.board.innerHTML = "";
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const cell = document.createElement("div");
      cell.className = `cell ${c >= 4 ? "enemy-side" : "player-side"}`;
      cell.dataset.cell = `${r},${c}`;
      if (attackSet.has(`${r},${c}`)) cell.classList.add("attack-preview");
      if (previewSet.has(`${r},${c}`)) cell.classList.add("card-preview");
      if (moveSet.has(`${r},${c}`)) cell.classList.add("move-preview");
      if (state.teleportTargeting && c < 4) cell.classList.add("teleport-target");
      cell.addEventListener("click", () => handleCellClick(r, c));
      els.board.appendChild(cell);
    }
  }
  els.board.addEventListener("pointerdown", startBoardSwipe);
  requestAnimationFrame(renderUnits);
}

function handleCellClick(r, c) {
  if (!state.teleportTargeting || c >= 4) return;
  state.player = { r, c };
  state.teleportTargeting = false;
  setLog("已瞬移。");
  render();
}

function startBoardSwipe(event) {
  if (event.pointerType !== "touch" || state.drag || pendingTouchCard || state.teleportTargeting) return;
  boardSwipe = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
}

function endBoardSwipe(event) {
  if (!boardSwipe || boardSwipe.pointerId !== event.pointerId || state.drag || state.teleportTargeting) return;
  const dx = event.clientX - boardSwipe.startX;
  const dy = event.clientY - boardSwipe.startY;
  boardSwipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < TOUCH_GESTURE_THRESHOLD) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  movePlayer(dir);
}

function renderUnits() {
  els.unitLayer.innerHTML = "";
  placeUnit("player", state.player);
  placeUnit("enemy", state.enemy);
}

function placeUnit(type, pos) {
  const cell = els.board.querySelector(`[data-cell="${pos.r},${pos.c}"]`);
  if (!cell) return;
  const arenaRect = els.unitLayer.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const unit = makeUnit(type);
  unit.style.left = `${cellRect.left - arenaRect.left + cellRect.width / 2}px`;
  unit.style.top = `${cellRect.top - arenaRect.top + cellRect.height / 2}px`;
  els.unitLayer.appendChild(unit);
}

function makeUnit(type) {
  const unit = document.createElement("div");
  unit.className = `unit ${type}`;
  unit.dataset.unit = type;
  const base = document.createElement("span");
  base.className = "base";
  unit.appendChild(base);
  if (type === "enemy") {
    const actionBar = document.createElement("span");
    actionBar.className = "enemy-action-bar";
    actionBar.innerHTML = "<i></i>";
    unit.appendChild(actionBar);
  }
  return unit;
}

function renderHand() {
  els.hand.innerHTML = "";
  state.hand.forEach((card) => {
    const node = document.createElement("article");
    node.className = `card ${card.school}-card ${card.linkedMove ? "linked-move" : ""} ${state.armedBoost ? "boost-ready" : ""}`;
    node.setAttribute("draggable", "true");
    node.innerHTML = `
      <div class="school-badge">${card.school === "wound" ? "傷" : "訊"}</div>
      <div class="move-badge">${card.moveValue}</div>
      ${card.linkedMove ? '<div class="link-badge">=</div>' : ""}
      <span class="card-title">${card.name}</span>
      <div class="card-art"></div>
      <div class="card-desc">${card.desc}${shapeIcon(card.shape)}</div>
    `;
    node.addEventListener("pointerdown", (event) => startCardDrag(event, card));
    node.addEventListener("pointermove", moveCardDrag);
    node.addEventListener("pointerup", endCardDrag);
    node.addEventListener("pointercancel", cancelCardDrag);
    node.addEventListener("mousedown", (event) => startCardDrag(event, card));
    node.addEventListener("dragstart", (event) => startNativeCardDrag(event, card));
    node.addEventListener("dragend", cancelCardDrag);
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      sacrificeCardForMove(card);
    });
    node.addEventListener("dblclick", (event) => {
      event.preventDefault();
      sacrificeCardForMove(card);
    });
    els.hand.appendChild(node);
  });
}

function shapeIcon(shape) {
  const on = new Set(shapePatterns[shape]);
  return `<span class="shape-icon">${Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? "on" : ""}"></i>`).join("")}</span>`;
}

function flashCells(cells) {
  cells.forEach(([r, c]) => {
    const cell = els.board.querySelector(`[data-cell="${r},${c}"]`);
    if (!cell) return;
    cell.classList.remove("hit-flash");
    void cell.offsetWidth;
    cell.classList.add("hit-flash");
  });
}

function addSlash(cells) {
  cells.forEach(([r, c]) => {
    const cell = els.board.querySelector(`[data-cell="${r},${c}"]`);
    if (!cell) return;
    const slash = document.createElement("div");
    slash.className = "slash-effect";
    cell.appendChild(slash);
    setTimeout(() => slash.remove(), 460);
  });
}

function animateUnit(type, className) {
  const unit = els.unitLayer.querySelector(`[data-unit="${type}"]`);
  if (!unit) return;
  unit.classList.remove(className);
  void unit.offsetWidth;
  unit.classList.add(className);
}

function showDamageNumber(amount, boosted, target = "enemy") {
  const unit = els.unitLayer.querySelector(`[data-unit="${target}"]`);
  if (!unit) return;
  const text = document.createElement("span");
  text.className = `damage-number ${boosted ? "boosted" : ""}`;
  text.textContent = amount;
  text.style.left = unit.style.left;
  text.style.top = unit.style.top;
  els.unitLayer.appendChild(text);
  setTimeout(() => text.remove(), 1100);
}

function setLog(message) {
  els.teleportHint.textContent = message || "";
}

function renderEnemyActionBar() {
  const fill = els.unitLayer.querySelector(".enemy .enemy-action-bar i");
  if (!fill) return;
  fill.style.width = `${Math.min(1, state.enemyElapsed / ENEMY_INTERVAL) * 100}%`;
}

function movePlayer(dir) {
  if (state.moveSteps <= 0 || state.teleportTargeting) return;
  const next = nextPosition(state.player, dir);
  if (!next) return;
  state.player = next;
  state.moveSteps -= 1;
  render();
}

function checkResult() {
  if (state.enemyHp <= 0) {
    state.gameOver = true;
    els.resultTitle.textContent = "勝利";
    els.overlay.classList.remove("hidden");
  } else if (state.playerHp <= 0) {
    state.gameOver = true;
    els.resultTitle.textContent = "戰敗";
    els.overlay.classList.remove("hidden");
  }
}

document.addEventListener("pointermove", moveCardDrag);
document.addEventListener("pointerup", endCardDrag);
document.addEventListener("pointercancel", cancelCardDrag);
document.addEventListener("pointerup", endBoardSwipe);
document.addEventListener("mousemove", moveCardDrag);
document.addEventListener("mouseup", endCardDrag);
document.addEventListener("dragover", updateNativeDragPreview);
document.addEventListener("drop", endNativeCardDrag);
window.addEventListener("blur", cancelCardDrag);
window.addEventListener("resize", () => requestAnimationFrame(renderUnits));
function bindOrbHitbox(hitbox, orb, type) {
  hitbox.addEventListener("mouseenter", () => orb.classList.add("hovered"));
  hitbox.addEventListener("mouseleave", () => orb.classList.remove("hovered"));
  hitbox.addEventListener("click", () => armBoost(type));
}

bindOrbHitbox(els.woundOrbHitbox, els.woundOrb, "wound");
bindOrbHitbox(els.swiftOrbHitbox, els.swiftOrb, "swift");
document.addEventListener("keydown", (event) => {
  const dir = { w: "up", a: "left", s: "down", d: "right" }[event.key.toLowerCase()];
  if (!dir) return;
  movePlayer(dir);
});
els.restartBtn.addEventListener("click", resetGame);
els.overlayRestartBtn.addEventListener("click", resetGame);
els.redrawBtn.addEventListener("click", redrawHand);

resetGame();
requestAnimationFrame(gameLoop);
