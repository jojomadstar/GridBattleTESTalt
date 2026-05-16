const ROWS = 4;
const COLS = 8;
const PLAYER_MAX_HP = 500;
const ENEMY_MAX_HP = 200;
const ENEMY_MAX_GUARD = 200;
const MAX_HAND = 8;

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
  turnText: document.getElementById("turnText"),
  energyText: document.getElementById("energyText"),
  moveText: document.getElementById("moveText"),
  battleLog: document.getElementById("battleLog"),
  restartBtn: document.getElementById("restartBtn"),
  redrawBtn: document.getElementById("redrawBtn"),
  overlay: document.getElementById("resultOverlay"),
  resultTitle: document.getElementById("resultTitle"),
  overlayRestartBtn: document.getElementById("overlayRestartBtn"),
};

const moveGlyphs = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

const shapePatterns = {
  line2H: [3, 4],
  lineV: [1, 4, 7],
  cross: [1, 3, 4, 5, 7],
  row: [3, 4, 5],
  lineH: [3, 4, 5],
  x: [0, 2, 4, 6, 8],
};

const cardBases = [
  {
    id: "cangsong",
    name: "華山劍法：蒼松迎客",
    cost: 1,
    damage: 20,
    guardDamage: 10,
    shape: "line2H",
    desc: "造成20點傷害，10點破韌。攻擊前方第四、第五格。",
    getCells: (pos) => [[pos.r, pos.c + 4], [pos.r, pos.c + 5]],
  },
  {
    id: "youfeng",
    name: "華山劍法：有鳳來儀",
    cost: 2,
    damage: 10,
    guardDamage: 20,
    shape: "cross",
    desc: "造成10點傷害，20點破韌。攻擊前方三至五格與第四格上下。",
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
    name: "華山劍法：白虹貫日",
    cost: 3,
    damage: 30,
    guardDamage: 30,
    shape: "row",
    desc: "造成30點傷害，30點破韌。攻擊角色目前橫排整排。",
    getCells: (pos) => Array.from({ length: COLS }, (_, c) => [pos.r, c]),
  },
];

const state = {
  turn: 1,
  energy: 3,
  move: 1,
  playerHp: PLAYER_MAX_HP,
  enemyHp: ENEMY_MAX_HP,
  enemyGuard: ENEMY_MAX_GUARD,
  player: { r: 1, c: 1 },
  enemy: { r: 1, c: 5 },
  deck: [],
  discard: [],
  hand: [],
  enemyAttack: [],
  selectedCardId: null,
  drag: null,
  dragPreview: { mode: null, cells: [] },
  stunnedThisTurn: false,
  gameOver: false,
  firstTurn: true,
};

function makeDeck() {
  const dirs = ["up", "down", "left", "right"];
  return cardBases.flatMap((base) =>
    dirs.map((dir) => ({
      ...base,
      uid: `${base.id}-${dir}-${crypto.randomUUID()}`,
      moveDir: dir,
    })),
  );
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

function resetGame() {
  Object.assign(state, {
    turn: 1,
    energy: 3,
    move: 1,
    playerHp: PLAYER_MAX_HP,
    enemyHp: ENEMY_MAX_HP,
    enemyGuard: ENEMY_MAX_GUARD,
    player: { r: 1, c: 1 },
    enemy: { r: 1, c: 5 },
    deck: shuffle(makeDeck()),
    discard: [],
    hand: [],
    enemyAttack: [],
    selectedCardId: null,
    drag: null,
    dragPreview: { mode: null, cells: [] },
    stunnedThisTurn: false,
    gameOver: false,
    firstTurn: true,
  });
  els.overlay.classList.add("hidden");
  startTurn(true);
}

function startTurn(isOpening = false) {
  if (state.gameOver) return;
  state.energy = 3;
  state.move = 1;
  state.stunnedThisTurn = false;
  state.selectedCardId = null;
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  moveEnemyRandomly(3);
  state.enemyAttack = makeEnemyAttack();
  drawCards(isOpening ? 5 : 2);
  state.firstTurn = false;
  log(isOpening ? "起手抽五張。敵人已預告攻擊範圍。" : "新回合開始：敵人移動並標示攻擊範圍，你抽兩張牌。");
  render();
}

function moveEnemyRandomly(steps) {
  for (let i = 0; i < steps; i += 1) {
    const options = [
      { r: state.enemy.r - 1, c: state.enemy.c },
      { r: state.enemy.r + 1, c: state.enemy.c },
      { r: state.enemy.r, c: state.enemy.c - 1 },
      { r: state.enemy.r, c: state.enemy.c + 1 },
    ].filter((p) => inBounds(p.r, p.c) && p.c >= 4 && !sameCell(p, state.player));
    if (options.length) {
      state.enemy = options[Math.floor(Math.random() * options.length)];
    }
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

  const plans = [
    makePlayerAimedPlan(player),
    makeMobilityTrapPlan(player),
    makeEscapeCutoffPlan(escapeCells),
  ].filter(Boolean);

  const weightedPlans = [plans[0], plans[0], plans[1], plans[2]].filter(Boolean);
  const chosen = weightedPlans[Math.floor(Math.random() * weightedPlans.length)];
  return uniqueCells(chosen.filter(([r, c]) => inBounds(r, c) && c < 4));
}

function makePlayerAimedPlan(player) {
  const type = ["horizontal", "vertical", "cross", "x"][Math.floor(Math.random() * 4)];
  const cells = [];
  if (type === "horizontal") {
    for (let c = 0; c < 4; c += 1) cells.push([player.r, c]);
    cells.push([player.r - 1, player.c], [player.r + 1, player.c]);
  }
  if (type === "vertical") {
    for (let r = 0; r < ROWS; r += 1) cells.push([r, player.c]);
    cells.push([player.r, player.c - 1], [player.r, player.c + 1]);
  }
  if (type === "cross") {
    cells.push(
      [player.r, player.c],
      [player.r - 1, player.c],
      [player.r + 1, player.c],
      [player.r, player.c - 1],
      [player.r, player.c + 1],
      [player.r - 2, player.c],
      [player.r + 2, player.c],
      [player.r, player.c - 2],
      [player.r, player.c + 2],
    );
  }
  if (type === "x") {
    cells.push(
      [player.r, player.c],
      [player.r - 1, player.c - 1],
      [player.r - 1, player.c + 1],
      [player.r + 1, player.c - 1],
      [player.r + 1, player.c + 1],
      [player.r - 2, player.c - 2],
      [player.r - 2, player.c + 2],
      [player.r + 2, player.c - 2],
      [player.r + 2, player.c + 2],
    );
  }
  return uniqueCells(cells);
}

function makeMobilityTrapPlan(player) {
  const cells = [];
  const horizontalRoom = player.c > 0 && player.c < 3;
  if (horizontalRoom && Math.random() < 0.55) {
    cells.push(
      [player.r, player.c - 1],
      [player.r, player.c],
      [player.r, player.c + 1],
      [player.r - 1, player.c],
      [player.r + 1, player.c],
    );
  } else {
    cells.push(
      [player.r - 1, player.c],
      [player.r, player.c],
      [player.r + 1, player.c],
      [player.r, player.c - 1],
      [player.r, player.c + 1],
    );
  }
  return uniqueCells(cells);
}

function makeEscapeCutoffPlan(escapeCells) {
  if (!escapeCells.length) return null;
  const scoredRows = Array.from({ length: ROWS }, (_, r) => ({
    r,
    score: escapeCells.filter(([er]) => er === r).length,
  })).sort((a, b) => b.score - a.score);
  const scoredCols = Array.from({ length: 4 }, (_, c) => ({
    c,
    score: escapeCells.filter(([, ec]) => ec === c).length,
  })).sort((a, b) => b.score - a.score);

  if (scoredRows[0].score >= scoredCols[0].score) {
    const row = scoredRows[0].r;
    return [
      ...Array.from({ length: 4 }, (_, c) => [row, c]),
      ...Array.from({ length: 4 }, (_, c) => [row - 1, c]),
      ...Array.from({ length: 4 }, (_, c) => [row + 1, c]),
    ];
  }
  const col = scoredCols[0].c;
  return [
    ...Array.from({ length: ROWS }, (_, r) => [r, col]),
    ...Array.from({ length: ROWS }, (_, r) => [r, col - 1]),
    ...Array.from({ length: ROWS }, (_, r) => [r, col + 1]),
  ];
}

function uniqueCells(cells) {
  const seen = new Set();
  return cells.filter(([r, c]) => {
    const key = `${r},${c}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  state.selectedCardId = null;
  log("測試重抽：棄掉目前手牌並抽五張。");
  render();
}

function getSelectedCard() {
  return state.hand.find((card) => card.uid === state.selectedCardId);
}

function getCardCells(card) {
  return uniqueCells(card.getCells(state.player).filter(([r, c]) => inBounds(r, c)));
}

function getMoveCells(card) {
  const next = nextPosition(state.player, card.moveDir);
  return next && !sameCell(next, state.enemy) ? [[next.r, next.c]] : [];
}

function playCard(card) {
  if (state.gameOver) return;
  if (state.energy < card.cost) {
    log("體力不足，這張牌目前無法施展。");
    render();
    return;
  }
  state.energy -= card.cost;
  const cells = getCardCells(card);
  const hitEnemy = cells.some(([r, c]) => r === state.enemy.r && c === state.enemy.c);
  removeFromHand(card.uid);
  if (hitEnemy) {
    state.enemyHp = Math.max(0, state.enemyHp - card.damage);
    state.enemyGuard = Math.max(0, state.enemyGuard - card.guardDamage);
    if (state.enemyGuard === 0) {
      state.stunnedThisTurn = true;
      state.enemyAttack = [];
      log(`${card.name} 命中！敵人堅韌被擊破，本回合昏厥，預告攻擊取消。`);
    } else {
      log(`${card.name} 命中！造成 ${card.damage} 傷害與 ${card.guardDamage} 破韌。`);
    }
  } else {
    log(`${card.name} 揮空，劍氣掠過棋盤。`);
  }
  state.selectedCardId = null;
  checkResult();
  render();
  window.requestAnimationFrame(() => {
    flashCells(cells);
    animateUnit("player", "attacking");
    addSlash(cells);
    if (hitEnemy) animateUnit("enemy", "damaged");
  });
}

function removeFromHand(uid) {
  const idx = state.hand.findIndex((card) => card.uid === uid);
  if (idx >= 0) {
    const [card] = state.hand.splice(idx, 1);
    state.discard.push(card);
  }
}

function discardCard(uid) {
  if (state.gameOver) return;
  const card = state.hand.find((item) => item.uid === uid);
  removeFromHand(uid);
  if (state.selectedCardId === uid) state.selectedCardId = null;
  log(`棄掉 ${card.name}。`);
  render();
}

function useCardAsMove(card) {
  if (state.gameOver) return;
  const next = nextPosition(state.player, card.moveDir);
  if (!next || sameCell(next, state.enemy)) {
    log("這張移動牌的方向被擋住了。");
    render();
    return;
  }
  state.player = next;
  removeFromHand(card.uid);
  state.selectedCardId = null;
  log(`以卡牌身法向${dirText(card.moveDir)}移動一格。`);
  render();
}

function startCardDrag(event, card) {
  if (state.gameOver || event.button !== 0 || state.drag) return;
  event.preventDefault();
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  const pointerId = event.pointerId ?? "mouse";
  state.drag = {
    cardId: card.uid,
    pointerId,
    node,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  state.selectedCardId = null;
  if (event.pointerId !== undefined && node.setPointerCapture) {
    node.setPointerCapture(event.pointerId);
  }
  node.classList.add("dragging");
  node.style.width = `${rect.width}px`;
  node.style.left = `${event.clientX - state.drag.offsetX}px`;
  node.style.top = `${event.clientY - state.drag.offsetY}px`;
  updateDragPreview(event.clientX, event.clientY);
  renderBoard();
}

function startNativeCardDrag(event, card) {
  if (state.gameOver) {
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
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.uid);
  updateDragPreview(event.clientX, event.clientY);
  renderBoard();
}

function moveCardDrag(event) {
  const pointerId = event.pointerId ?? "mouse";
  if (!state.drag || state.drag.pointerId !== pointerId) return;
  const node = state.drag.node;
  node.style.left = `${event.clientX - state.drag.offsetX}px`;
  node.style.top = `${event.clientY - state.drag.offsetY}px`;
  updateDragPreview(event.clientX, event.clientY);
  renderBoard();
}

function endCardDrag(event) {
  const pointerId = event.pointerId ?? "mouse";
  if (!state.drag || state.drag.pointerId !== pointerId) return;
  const card = state.hand.find((item) => item.uid === state.drag.cardId);
  const mode = getDropMode(event.clientX, event.clientY);
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  if (card && mode === "attack") {
    playCard(card);
    return;
  }
  if (card && mode === "move") {
    useCardAsMove(card);
    return;
  }
  render();
}

function endNativeCardDrag(event) {
  if (!state.drag) return;
  event.preventDefault();
  const card = state.hand.find((item) => item.uid === state.drag.cardId);
  const mode = getDropMode(event.clientX, event.clientY);
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  if (card && mode === "attack") {
    playCard(card);
    return;
  }
  if (card && mode === "move") {
    useCardAsMove(card);
    return;
  }
  log("取消使用卡牌。");
  render();
}

function updateNativeDragPreview(event) {
  if (!state.drag) return;
  event.preventDefault();
  updateDragPreview(event.clientX, event.clientY);
  renderBoard();
}

function cancelCardDrag(message = "取消使用卡牌。") {
  if (!state.drag) return false;
  state.drag = null;
  state.dragPreview = { mode: null, cells: [] };
  log(message);
  render();
  return true;
}

function getDropMode(clientX, clientY) {
  const handRect = els.hand.getBoundingClientRect();
  if (
    clientX >= handRect.left &&
    clientX <= handRect.right &&
    clientY >= handRect.top &&
    clientY <= handRect.bottom
  ) {
    return "cancel";
  }
  const boardRect = els.board.getBoundingClientRect();
  const midpoint = boardRect.left + boardRect.width / 2;
  return clientX >= midpoint ? "attack" : "move";
}

function updateDragPreview(clientX, clientY) {
  const card = state.drag ? state.hand.find((item) => item.uid === state.drag.cardId) : null;
  if (!card) {
    state.dragPreview = { mode: null, cells: [] };
    return;
  }
  const mode = getDropMode(clientX, clientY);
  state.dragPreview = {
    mode,
    cells: mode === "attack" ? getCardCells(card) : mode === "move" ? getMoveCells(card) : [],
  };
}

function dirText(dir) {
  return { up: "上", down: "下", left: "左", right: "右" }[dir];
}

function nextPosition(pos, dir) {
  const delta = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
  }[dir];
  const next = { r: pos.r + delta[0], c: pos.c + delta[1] };
  return inBounds(next.r, next.c) && next.c < 4 ? next : null;
}

function freeMove(dir) {
  if (state.gameOver || state.move <= 0) return;
  cancelCardDrag("移動時取消卡牌拖曳。");
  const next = nextPosition(state.player, dir);
  if (!next) return;
  state.player = next;
  state.move -= 1;
  log(`移動到新的格位。`);
  render();
}

function endTurn() {
  if (state.gameOver) return;
  cancelCardDrag("結束回合，取消卡牌拖曳。");
  if (!state.stunnedThisTurn && state.enemyAttack.some(([r, c]) => r === state.player.r && c === state.player.c)) {
    state.playerHp = Math.max(0, state.playerHp - 40);
    animateUnit("player", "damaged");
    flashCells([[state.player.r, state.player.c]]);
    log("敵方攻擊命中，你受到40點傷害。");
  } else if (state.stunnedThisTurn) {
    log("敵人昏厥，回合結束時無法攻擊。");
  } else {
    log("你避開了敵方預告攻擊。");
  }
  checkResult();
  if (!state.gameOver) {
    state.turn += 1;
    state.enemyGuard = ENEMY_MAX_GUARD;
    window.setTimeout(() => startTurn(false), 460);
  }
  render();
}

function checkResult() {
  if (state.enemyHp <= 0) {
    state.gameOver = true;
    els.resultTitle.textContent = "勝利";
    els.overlay.classList.remove("hidden");
  }
  if (state.playerHp <= 0) {
    state.gameOver = true;
    els.resultTitle.textContent = "戰敗";
    els.overlay.classList.remove("hidden");
  }
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
  els.turnText.textContent = state.turn;
  els.energyText.textContent = state.energy;
  els.moveText.textContent = state.move;
}

function renderBoard() {
  const selected = getSelectedCard();
  const selectedPreview = selected ? getCardCells(selected) : [];
  const attackPreview = state.dragPreview.mode === "attack" ? state.dragPreview.cells : selectedPreview;
  const movePreview = state.dragPreview.mode === "move" ? state.dragPreview.cells : [];
  const previewSet = new Set(attackPreview.map(([r, c]) => `${r},${c}`));
  const movePreviewSet = new Set(movePreview.map(([r, c]) => `${r},${c}`));
  const attackSet = new Set(state.enemyAttack.map(([r, c]) => `${r},${c}`));
  els.board.innerHTML = "";
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const cell = document.createElement("div");
      cell.className = `cell ${c >= 4 ? "enemy-side" : "player-side"}`;
      cell.dataset.cell = `${r},${c}`;
      if (attackSet.has(`${r},${c}`)) cell.classList.add("attack-preview");
      if (previewSet.has(`${r},${c}`)) cell.classList.add("card-preview");
      if (movePreviewSet.has(`${r},${c}`)) cell.classList.add("move-preview");
      els.board.appendChild(cell);
    }
  }
  requestAnimationFrame(renderUnits);
}

function renderUnits() {
  if (!els.unitLayer) return;
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
  if (type === "enemy" && state.stunnedThisTurn) {
    unit.classList.add("stunned");
    const mark = document.createElement("span");
    mark.className = "stun-mark";
    mark.textContent = "昏";
    unit.appendChild(mark);
  }
  return unit;
}

function renderHand() {
  els.hand.innerHTML = "";
  state.hand.forEach((card) => {
    const node = document.createElement("article");
    node.className = [
      "card",
      state.selectedCardId === card.uid ? "selected" : "",
      state.energy < card.cost ? "unaffordable" : "",
      state.drag?.cardId === card.uid ? "dragging" : "",
    ].join(" ");
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", `${card.name}，拖到右半場施展，拖到左半場移動`);
    node.setAttribute("draggable", "true");
    node.innerHTML = `
      <div class="cost-badge">${card.cost}</div>
      <div class="move-badge" title="拖到玩家半場時向${dirText(card.moveDir)}移動">${moveGlyphs[card.moveDir]}</div>
      <span class="card-title">${card.name}</span>
      <div class="card-art"></div>
      <div class="card-desc">
        ${card.desc}
        ${shapeIcon(card.shape)}
      </div>
    `;
    node.addEventListener("pointerdown", (event) => startCardDrag(event, card));
    node.addEventListener("pointermove", moveCardDrag);
    node.addEventListener("pointerup", endCardDrag);
    node.addEventListener("pointercancel", endCardDrag);
    node.addEventListener("mousedown", (event) => startCardDrag(event, card));
    node.addEventListener("dragstart", (event) => startNativeCardDrag(event, card));
    node.addEventListener("dragend", () => cancelCardDrag("取消使用卡牌。"));
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      discardCard(card.uid);
    });
    els.hand.appendChild(node);
  });
}

function shapeIcon(shape) {
  const on = new Set(shapePatterns[shape] || shapePatterns.cross);
  const cells = Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? "on" : ""}"></i>`).join("");
  return `<span class="shape-icon" aria-label="${shape}">${cells}</span>`;
}

function flashCells(cells) {
  cells.forEach(([r, c]) => {
    const cell = els.board.querySelector(`[data-cell="${r},${c}"]`);
    if (cell) {
      cell.classList.remove("hit-flash");
      void cell.offsetWidth;
      cell.classList.add("hit-flash");
    }
  });
}

function animateUnit(type, className) {
  const unit = els.unitLayer.querySelector(`[data-unit="${type}"]`);
  if (!unit) return;
  unit.classList.remove(className);
  void unit.offsetWidth;
  unit.classList.add(className);
}

function addSlash(cells) {
  cells.forEach(([r, c]) => {
    const cell = els.board.querySelector(`[data-cell="${r},${c}"]`);
    if (!cell) return;
    const slash = document.createElement("div");
    slash.className = "slash-effect";
    cell.appendChild(slash);
    window.setTimeout(() => slash.remove(), 460);
  });
}

function log(message) {
  els.battleLog.textContent = message;
}

document.addEventListener("keydown", (event) => {
  const keyMap = { w: "up", a: "left", s: "down", d: "right" };
  const key = event.key.toLowerCase();
  if (keyMap[key]) {
    event.preventDefault();
    freeMove(keyMap[key]);
  }
  if (event.code === "Space") {
    event.preventDefault();
    endTurn();
  }
});
document.addEventListener("mousemove", moveCardDrag);
document.addEventListener("mouseup", endCardDrag);
document.addEventListener("dragover", updateNativeDragPreview);
document.addEventListener("drop", endNativeCardDrag);
window.addEventListener("resize", () => requestAnimationFrame(renderUnits));

els.restartBtn.addEventListener("click", resetGame);
els.overlayRestartBtn.addEventListener("click", resetGame);
els.redrawBtn.addEventListener("click", redrawHand);

resetGame();
