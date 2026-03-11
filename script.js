/* ===================================================
   47都道府県パズルめぐり - script.js
   =================================================== */

// ===== GAME DATA =====
const STAGES = [
  {
    id: 'hokkaido',
    name: '北海道',
    number: 1,
    region: '北海道地方',
    targetScore: 2000,
    icons: ['🦀', '🐄', '🌽', '🧀', '🦊', '❄️'],
    iconNames: ['カニ', '牛', 'トウモロコシ', 'チーズ', 'キツネ', '雪'],
    description: '日本最大の都道府県で、広大な大地と豊かな自然が広がります。',
    trivia: '北海道は日本最大の都道府県！\n広すぎて「ほっかいどうしよう」って迷うかも！？'
  },
  {
    id: 'aomori',
    name: '青森',
    number: 2,
    region: '東北地方',
    targetScore: 2500,
    icons: ['🍎', '🐟', '🕯️', '⛄', '🍶', '🌊'],
    iconNames: ['りんご', 'マグロ', 'ねぶた', '雪だるま', '日本酒', '海'],
    description: 'りんごの生産量日本一！ねぶた祭りが有名な東北の玄関口。',
    trivia: '青森はりんごの名産地！\nりんごが好きすぎて「あおもり食べちゃう」かも！？'
  },
  {
    id: 'miyagi',
    name: '宮城',
    number: 3,
    region: '東北地方',
    targetScore: 3000,
    icons: ['🦪', '🐄', '🍚', '🏯', '🌸', '🐻'],
    iconNames: ['カキ', '牛タン', '笹かまぼこ', '仙台城', '花', '熊'],
    description: '仙台牛タンやカキが有名な宮城県。伊達政宗公ゆかりの地。',
    trivia: '宮城は牛タンの聖地！\nおいしすぎて「もう宮城（みやぎ）ない！」ってなるよ！？'
  },
  {
    id: 'tokyo',
    name: '東京',
    number: 4,
    region: '関東地方',
    targetScore: 3500,
    icons: ['🗼', '🚇', '🍣', '🏙️', '🌸', '🎌'],
    iconNames: ['東京タワー', '電車', 'すし', '都市', '花', '日本の旗'],
    description: '日本の首都！世界有数の都市で、グルメもエンタメも最高。',
    trivia: '東京はなんでもある街！\nお店が多すぎて「東（とう）に行くか西に行くか」迷っちゃう！？'
  },
  {
    id: 'osaka',
    name: '大阪',
    number: 5,
    region: '近畿地方',
    targetScore: 4000,
    icons: ['🦑', '🍜', '🏯', '😄', '🎪', '🍡'],
    iconNames: ['たこやき', 'うどん', '大阪城', '笑い', 'お笑い', '団子'],
    description: '食いだおれの街、大阪。たこやきやお好み焼きが絶品！',
    trivia: '大阪は食いだおれの街！\nおいしすぎて「おおさか」ず食べちゃう！？'
  }
  // 後から47都道府県すべてここに追加できます
];

// ===== GAME CONFIG =====
const COLS = 6;
const ROWS = 8;
const MATCH_MIN = 3;

// ===== STATE =====
let state = {
  currentStageIndex: 0,
  board: [],          // [row][col] = iconIndex (0-5)
  score: 0,
  maxCombo: 0,
  currentCombo: 0,
  selected: null,     // {row, col}
  isAnimating: false,
  dragStart: null,
  savedProgress: {}
};

// ===== LOCAL STORAGE =====
function loadProgress() {
  try {
    const raw = localStorage.getItem('puzzle47_progress');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveProgress(progress) {
  try {
    localStorage.setItem('puzzle47_progress', JSON.stringify(progress));
  } catch {}
}

function isStageCleared(stageId) {
  return !!state.savedProgress[stageId];
}

function isStageAvailable(index) {
  if (index === 0) return true;
  const prevStage = STAGES[index - 1];
  return isStageCleared(prevStage.id);
}

function clearStage(stageId, score, combo) {
  state.savedProgress[stageId] = { score, combo, clearedAt: Date.now() };
  saveProgress(state.savedProgress);
}

function getClearedCount() {
  return Object.keys(state.savedProgress).length;
}

// ===== INIT =====
function init() {
  state.savedProgress = loadProgress();
  setupEventListeners();
  showScreen('title');
}

// ===== SCREEN MANAGEMENT =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');

  if (name === 'stage') renderStageSelect();
  if (name === 'zukan') renderZukan();
}

// ===== TITLE SCREEN =====
function setupTitleButtons() {
  document.getElementById('btn-start').addEventListener('click', () => {
    state.currentStageIndex = 0;
    showScreen('stage');
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    showScreen('stage');
  });
  document.getElementById('btn-zukan').addEventListener('click', () => {
    showScreen('zukan');
  });
}

// ===== STAGE SELECTION =====
function renderStageSelect() {
  const clearedCount = getClearedCount();
  document.getElementById('stage-progress').textContent = `${clearedCount} / 47 制覇`;

  const list = document.getElementById('stage-list');
  list.innerHTML = '';

  STAGES.forEach((stage, index) => {
    const cleared = isStageCleared(stage.id);
    const available = isStageAvailable(index);
    const card = document.createElement('div');
    card.className = `stage-card ${cleared ? 'cleared' : available ? 'available' : 'locked'}`;

    const statusIcon = cleared ? '✅' : available ? '⭐' : '🔒';

    card.innerHTML = `
      <div class="stage-number">${stage.number}</div>
      <div class="stage-info">
        <div class="stage-name">${stage.name}</div>
        <div class="stage-region">${stage.region}</div>
        <div class="stage-score-goal">目標スコア: ${stage.targetScore.toLocaleString()}</div>
      </div>
      <div class="stage-status">${statusIcon}</div>
    `;

    if (!cleared && !available) {
      // locked
    } else {
      card.addEventListener('click', () => startGame(index));
    }

    list.appendChild(card);
  });
}

// ===== GAME LOGIC =====
function startGame(stageIndex) {
  state.currentStageIndex = stageIndex;
  state.score = 0;
  state.maxCombo = 0;
  state.currentCombo = 0;
  state.selected = null;
  state.isAnimating = false;

  const stage = STAGES[stageIndex];
  document.getElementById('game-prefecture-name').textContent = stage.name;
  document.getElementById('game-target').textContent = stage.targetScore.toLocaleString();
  updateScoreDisplay();

  state.board = createBoard(stage.icons.length);
  renderBoard();
  showScreen('game');
}

function createBoard(iconCount) {
  const board = [];
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      board[r][c] = randomIcon(iconCount);
    }
  }
  // Remove initial matches
  removeInitialMatches(board, iconCount);
  return board;
}

function randomIcon(iconCount) {
  return Math.floor(Math.random() * iconCount);
}

function removeInitialMatches(board, iconCount) {
  let changed = true;
  let safety = 0;
  while (changed && safety < 100) {
    changed = false;
    safety++;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isPartOfMatch(board, r, c)) {
          board[r][c] = randomIcon(iconCount);
          changed = true;
        }
      }
    }
  }
}

function isPartOfMatch(board, r, c) {
  const v = board[r][c];
  // Horizontal
  if (c >= 2 && board[r][c-1] === v && board[r][c-2] === v) return true;
  if (c >= 1 && c < COLS-1 && board[r][c-1] === v && board[r][c+1] === v) return true;
  if (c < COLS-2 && board[r][c+1] === v && board[r][c+2] === v) return true;
  // Vertical
  if (r >= 2 && board[r-1][c] === v && board[r-2][c] === v) return true;
  if (r >= 1 && r < ROWS-1 && board[r-1][c] === v && board[r+1][c] === v) return true;
  if (r < ROWS-2 && board[r+1][c] === v && board[r+2][c] === v) return true;
  return false;
}

// ===== BOARD RENDERING =====
function renderBoard() {
  const stage = STAGES[state.currentStageIndex];
  const boardEl = document.getElementById('game-board');
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateRows = `repeat(${ROWS}, 1fr)`;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = createCellElement(r, c);
      boardEl.appendChild(cell);
    }
  }
  updateScoreDisplay();
}

function createCellElement(r, c) {
  const stage = STAGES[state.currentStageIndex];
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.row = r;
  cell.dataset.col = c;
  cell.textContent = stage.icons[state.board[r][c]];

  cell.addEventListener('click', () => onCellClick(r, c));
  cell.addEventListener('mousedown', (e) => onDragStart(e, r, c));
  cell.addEventListener('touchstart', (e) => onTouchStart(e, r, c), { passive: true });

  return cell;
}

function getCellElement(r, c) {
  return document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
}

function updateCellDisplay(r, c) {
  const stage = STAGES[state.currentStageIndex];
  const cell = getCellElement(r, c);
  if (cell) {
    cell.textContent = stage.icons[state.board[r][c]];
    cell.className = 'cell';
  }
}

// ===== INTERACTION =====
function onCellClick(r, c) {
  if (state.isAnimating) return;

  if (!state.selected) {
    state.selected = { row: r, col: c };
    const cell = getCellElement(r, c);
    if (cell) cell.classList.add('selected');
  } else {
    const { row: sr, col: sc } = state.selected;
    const prevCell = getCellElement(sr, sc);
    if (prevCell) prevCell.classList.remove('selected');

    if (sr === r && sc === c) {
      state.selected = null;
      return;
    }

    if (isAdjacent(sr, sc, r, c)) {
      trySwap(sr, sc, r, c);
    } else {
      state.selected = { row: r, col: c };
      const cell = getCellElement(r, c);
      if (cell) cell.classList.add('selected');
    }
  }
}

function isAdjacent(r1, c1, r2, c2) {
  return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
}

// ===== DRAG / SWIPE =====
function onDragStart(e, r, c) {
  if (e.button !== 0) return;
  state.dragStart = { row: r, col: c, x: e.clientX, y: e.clientY };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e) {}

function onDragEnd(e) {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  if (!state.dragStart) return;
  const { row: r, col: c, x, y } = state.dragStart;
  const dx = e.clientX - x;
  const dy = e.clientY - y;
  state.dragStart = null;
  if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return;
  const [nr, nc] = getSwipeTarget(r, c, dx, dy);
  if (nr !== r || nc !== c) trySwap(r, c, nr, nc);
}

function onTouchStart(e, r, c) {
  if (state.isAnimating) return;
  const touch = e.touches[0];
  state.dragStart = { row: r, col: c, x: touch.clientX, y: touch.clientY };
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd);
}

function onTouchMove(e) {}

function onTouchEnd(e) {
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend', onTouchEnd);
  if (!state.dragStart) return;
  const touch = e.changedTouches[0];
  const { row: r, col: c, x, y } = state.dragStart;
  const dx = touch.clientX - x;
  const dy = touch.clientY - y;
  state.dragStart = null;
  if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
    onCellClick(r, c);
    return;
  }
  const [nr, nc] = getSwipeTarget(r, c, dx, dy);
  if (nr !== r || nc !== c) trySwap(r, c, nr, nc);
}

function getSwipeTarget(r, c, dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) {
    const nc = dx > 0 ? c + 1 : c - 1;
    return [r, Math.max(0, Math.min(COLS - 1, nc))];
  } else {
    const nr = dy > 0 ? r + 1 : r - 1;
    return [Math.max(0, Math.min(ROWS - 1, nr)), c];
  }
}

// ===== SWAP & MATCH =====
function trySwap(r1, c1, r2, c2) {
  if (state.isAnimating) return;
  state.selected = null;

  // Do swap
  const tmp = state.board[r1][c1];
  state.board[r1][c1] = state.board[r2][c2];
  state.board[r2][c2] = tmp;

  const matches = findMatches();
  if (matches.size === 0) {
    // Swap back
    const tmp2 = state.board[r1][c1];
    state.board[r1][c1] = state.board[r2][c2];
    state.board[r2][c2] = tmp2;
    // Shake animation
    [getCellElement(r1, c1), getCellElement(r2, c2)].forEach(el => {
      if (el) {
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = 'shake 0.3s ease';
      }
    });
    return;
  }

  updateCellDisplay(r1, c1);
  updateCellDisplay(r2, c2);
  state.currentCombo = 0;
  state.isAnimating = true;
  processMatches();
}

// ===== MATCH FINDING =====
function findMatches() {
  const matched = new Set();

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && state.board[r][c] === state.board[r][c - 1]) {
        run++;
      } else {
        if (run >= MATCH_MIN) {
          for (let k = c - run; k < c; k++) matched.add(`${r},${k}`);
        }
        run = 1;
      }
    }
  }

  // Vertical
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && state.board[r][c] === state.board[r - 1][c]) {
        run++;
      } else {
        if (run >= MATCH_MIN) {
          for (let k = r - run; k < r; k++) matched.add(`${k},${c}`);
        }
        run = 1;
      }
    }
  }

  return matched;
}

// ===== PROCESS MATCHES =====
async function processMatches() {
  const matched = findMatches();
  if (matched.size === 0) {
    state.isAnimating = false;
    state.currentCombo = 0;
    hideCombo();
    checkWin();
    return;
  }

  state.currentCombo++;
  if (state.currentCombo > state.maxCombo) state.maxCombo = state.currentCombo;

  // Score
  const baseScore = matched.size * 50;
  const comboBonus = state.currentCombo > 1 ? state.currentCombo * 30 : 0;
  const gained = baseScore + comboBonus;
  state.score += gained;
  updateScoreDisplay();
  showScorePopup(gained, state.currentCombo);
  if (state.currentCombo > 1) showCombo(state.currentCombo);

  // Animate matched cells
  matched.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    const cell = getCellElement(r, c);
    if (cell) cell.classList.add('matched');
  });

  await wait(380);

  // Remove matched
  matched.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    state.board[r][c] = -1;
  });
  renderBoard();

  await wait(80);

  // Drop pieces
  dropPieces();
  renderBoard();
  // Animate fall
  const stage = STAGES[state.currentStageIndex];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = getCellElement(r, c);
      if (cell) cell.classList.add('falling');
    }
  }

  await wait(280);

  // Fill empty
  fillEmpty(stage.icons.length);
  renderBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = getCellElement(r, c);
      if (cell && state.board[r][c] !== undefined) cell.classList.add('new-piece');
    }
  }

  await wait(320);

  // Check chain
  processMatches();
}

function dropPieces() {
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r][c] !== -1) col.push(state.board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      state.board[r][c] = col.shift() !== undefined ? col[col.length - (ROWS - r)] : -1;
    }
    // Rebuild properly
    const valids = [];
    for (let r = 0; r < ROWS; r++) {
      if (state.board[r][c] !== -1) valids.push(state.board[r][c]);
    }
    let vi = 0;
    let empty = ROWS - valids.length;
    for (let r = 0; r < ROWS; r++) {
      if (r < empty) state.board[r][c] = -1;
      else state.board[r][c] = valids[vi++];
    }
  }
}

function fillEmpty(iconCount) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.board[r][c] === -1) {
        state.board[r][c] = randomIcon(iconCount);
      }
    }
  }
}

// ===== UI UPDATES =====
function updateScoreDisplay() {
  const stage = STAGES[state.currentStageIndex];
  document.getElementById('game-score').textContent = state.score.toLocaleString();
  const pct = Math.min(100, (state.score / stage.targetScore) * 100);
  document.getElementById('progress-bar-fill').style.width = pct + '%';
}

function showCombo(combo) {
  const el = document.getElementById('combo-display');
  el.textContent = `${combo} COMBO! 🔥`;
  el.style.display = 'block';
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'comboPop 0.4s ease-out';
}

function hideCombo() {
  const el = document.getElementById('combo-display');
  el.style.display = 'none';
}

function showScorePopup(score, combo) {
  const board = document.getElementById('game-board');
  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = combo > 1 ? `+${score} 🔥×${combo}` : `+${score}`;
  popup.style.left = `${20 + Math.random() * 60}%`;
  popup.style.top = `${30 + Math.random() * 40}%`;
  board.appendChild(popup);
  setTimeout(() => popup.remove(), 900);
}

// ===== WIN CHECK =====
function checkWin() {
  const stage = STAGES[state.currentStageIndex];
  if (state.score >= stage.targetScore) {
    clearStage(stage.id, state.score, state.maxCombo);
    setTimeout(() => showClearScreen(), 200);
  }
}

// ===== CLEAR SCREEN =====
function showClearScreen() {
  const stage = STAGES[state.currentStageIndex];
  document.getElementById('clear-title').textContent = `${stage.name}クリア！`;
  document.getElementById('clear-score').textContent = state.score.toLocaleString();
  document.getElementById('clear-combo').textContent = state.maxCombo;
  document.getElementById('trivia-text').textContent = stage.trivia;

  // Icons
  const iconsEl = document.getElementById('clear-icons');
  iconsEl.innerHTML = '';
  stage.icons.forEach(icon => {
    const item = document.createElement('div');
    item.className = 'clear-icon-item';
    item.textContent = icon;
    iconsEl.appendChild(item);
  });

  // Next button
  const nextBtn = document.getElementById('btn-next-stage');
  const nextIndex = state.currentStageIndex + 1;
  if (nextIndex < STAGES.length) {
    nextBtn.style.display = 'flex';
    nextBtn.textContent = `➡️ ${STAGES[nextIndex].name}へ`;
  } else {
    nextBtn.style.display = 'none';
  }

  spawnConfetti();
  showScreen('clear');
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8B94', '#C7CEEA'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-20px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (1.5 + Math.random() * 2) + 's';
    piece.style.animationDelay = (Math.random() * 1.5) + 's';
    container.appendChild(piece);
  }
}

// ===== ZUKAN =====
function renderZukan() {
  const clearedCount = getClearedCount();
  document.getElementById('zukan-progress').textContent = `${clearedCount} / 47`;

  const list = document.getElementById('zukan-list');
  list.innerHTML = '';

  STAGES.forEach(stage => {
    const cleared = isStageCleared(stage.id);
    const card = document.createElement('div');
    card.className = `zukan-card ${cleared ? '' : 'locked-card'}`;

    const iconsHTML = stage.icons.map(icon => `
      <div class="zukan-icon-item">${cleared ? icon : '❓'}</div>
    `).join('');

    card.innerHTML = `
      <div class="zukan-card-header">
        <div class="zukan-pref-name">${stage.name}</div>
        <div class="zukan-pref-number">${stage.number} / 47</div>
      </div>
      <div class="zukan-icons-grid">${iconsHTML}</div>
      ${cleared ? `<div class="zukan-description">${stage.description}</div>` : '<div class="zukan-description">クリアすると図鑑に登録されます！</div>'}
    `;

    list.appendChild(card);
  });
}

// ===== UTILS =====
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  setupTitleButtons();

  // Stage screen
  document.getElementById('btn-stage-back').addEventListener('click', () => showScreen('title'));

  // Game screen
  document.getElementById('btn-game-back').addEventListener('click', () => {
    state.isAnimating = false;
    showScreen('stage');
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    startGame(state.currentStageIndex);
  });
  document.getElementById('btn-to-stage').addEventListener('click', () => {
    state.isAnimating = false;
    showScreen('stage');
  });

  // Clear screen
  document.getElementById('btn-next-stage').addEventListener('click', () => {
    const nextIndex = state.currentStageIndex + 1;
    if (nextIndex < STAGES.length) startGame(nextIndex);
    else showScreen('stage');
  });
  document.getElementById('btn-clear-to-stage').addEventListener('click', () => showScreen('stage'));

  // Zukan screen
  document.getElementById('btn-zukan-back').addEventListener('click', () => showScreen('title'));

  // Prevent context menu on board
  document.getElementById('game-board').addEventListener('contextmenu', e => e.preventDefault());
}

// Add shake animation CSS dynamically
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px) rotate(-3deg); }
  40% { transform: translateX(6px) rotate(3deg); }
  60% { transform: translateX(-4px) rotate(-2deg); }
  80% { transform: translateX(4px) rotate(2deg); }
}
`;
document.head.appendChild(shakeStyle);

// ===== START =====
init();
