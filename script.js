/* =====================================================
   北海道パズル — script.js  (キャンディクラッシュ系・連鎖対応版)

   処理フロー:
   操作 → スワップ → マッチ判定 → 消去アニメ
        → 重力落下 → 補充 → 再マッチ判定
        → …（マッチ無くなるまで繰り返し）

   仕様:
   - 初期盤面でもマッチがあれば自動解消
   - 連鎖(コンボ)が発生する
   - 空白マスが残らない
   ===================================================== */

/* ── 定数 ── */
const COLS   = 6;
const ROWS   = 6;
const TARGET = 2000;
const PIECES = ['❄️','🦀','🐄','🧀','🌽','🦊'];

/*
  画像差し替えポイント:
  PIECES を画像パスの配列に変え、setTileContent() 内の
  コメントを外すだけで PNG に切り替え可能。
*/

const SCORE_TABLE = { 3: 100, 4: 200, 5: 500 };

/* アニメーション時間 (ms) */
const T_EXPLODE = 300;
const T_FALL    = 280;
const T_SPAWN   = 280;

/* ── 状態 ── */
let board      = [];
let score      = 0;
let busy       = false;
let selected   = null;   // {row, col} | null
let comboCount = 0;

/* ── DOM ── */
const boardEl    = document.getElementById('board');
const scoreEl    = document.getElementById('score-display');
const targetEl   = document.getElementById('target-display');
const progFill   = document.getElementById('prog-fill');
const progPct    = document.getElementById('prog-pct');
const flashEl    = document.getElementById('flash');
const overlay    = document.getElementById('overlay');
const modalScore = document.getElementById('modal-score');

targetEl.textContent = TARGET.toLocaleString();

/* =====================================================
   初期化
   ===================================================== */
async function init() {
  score      = 0;
  comboCount = 0;
  selected   = null;
  busy       = true;

  board = generateBoard();
  renderAll();
  updateHUD();
  hideOverlay();
  showFlash('');

  /* 仕様: 開始直後もマッチがあれば自動解消 */
  await runCascade();

  busy = false;
}

/* =====================================================
   ボード生成（初期マッチをなるべく作らない）
   ===================================================== */
function generateBoard() {
  const b = Array.from({length: ROWS}, () => new Array(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const forbidden = new Set();
      if (c >= 2 && b[r][c-1] === b[r][c-2]) forbidden.add(b[r][c-1]);
      if (r >= 2 && b[r-1][c] === b[r-2][c]) forbidden.add(b[r-1][c]);
      const pool = PIECES.map((_,i) => i).filter(i => !forbidden.has(i));
      b[r][c] = pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return b;
}

/* =====================================================
   描画
   ===================================================== */
function renderAll() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      boardEl.appendChild(makeTileEl(r, c));
    }
  }
}

function makeTileEl(r, c) {
  const el = document.createElement('div');
  el.className   = 'tile';
  el.dataset.row = r;
  el.dataset.col = c;
  applyType(el, board[r][c]);
  attachInput(el, r, c);
  return el;
}

function applyType(el, type) {
  el.dataset.type = type;
  setTileContent(el, type);
}

function setTileContent(el, type) {
  /*
    画像差し替えポイント:
    if (PIECES[type]?.endsWith('.png')) {
      el.innerHTML = `<img src="${PIECES[type]}" alt="${type}"
        style="width:78%;height:78%;object-fit:contain;pointer-events:none;">`;
      return;
    }
  */
  el.textContent = PIECES[type] ?? '';
}

function getTileEl(r, c) {
  return boardEl.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
}

/* =====================================================
   HUD
   ===================================================== */
function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  const pct = Math.min(100, Math.round(score / TARGET * 100));
  progFill.style.width = pct + '%';
  progPct.textContent  = `${score.toLocaleString()} / ${TARGET.toLocaleString()}`;
}

/* =====================================================
   入力（クリック選択 & タッチスワイプ）
   ===================================================== */
let touchStart = null;

function attachInput(el, r, c) {
  /* PC クリック */
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    if (busy) return;
    onSelect(r, c);
  });

  /* スマホ スワイプ */
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    if (busy) return;
    const t = e.touches[0];
    touchStart = {r, c, x: t.clientX, y: t.clientY};
  }, {passive: false});

  el.addEventListener('touchend', e => {
    if (!touchStart || busy) { touchStart = null; return; }
    e.preventDefault();
    const t  = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const {r: or, c: oc} = touchStart;
    touchStart = null;

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      onSelect(or, oc);
      return;
    }
    let nr = or, nc = oc;
    if (Math.abs(dx) >= Math.abs(dy)) {
      nc = oc + (dx > 0 ? 1 : -1);
    } else {
      nr = or + (dy > 0 ? 1 : -1);
    }
    if (!inBounds(nr, nc)) return;
    clearSel();
    doSwap(or, oc, nr, nc);
  }, {passive: false});
}

function onSelect(r, c) {
  if (busy) return;
  if (!selected) {
    selected = {row: r, col: c};
    getTileEl(r, c)?.classList.add('selected');
    return;
  }
  const {row: sr, col: sc} = selected;
  if (sr === r && sc === c) { clearSel(); return; }
  if (isAdj(sr, sc, r, c)) {
    clearSel();
    doSwap(sr, sc, r, c);
  } else {
    clearSel();
    selected = {row: r, col: c};
    getTileEl(r, c)?.classList.add('selected');
  }
}

function clearSel() {
  if (selected) {
    getTileEl(selected.row, selected.col)?.classList.remove('selected');
    selected = null;
  }
}

function isAdj(r1,c1,r2,c2) { return Math.abs(r1-r2)+Math.abs(c1-c2)===1; }
function inBounds(r,c)       { return r>=0 && r<ROWS && c>=0 && c<COLS; }

/* =====================================================
   スワップ
   ===================================================== */
async function doSwap(r1, c1, r2, c2) {
  if (busy) return;
  busy = true;
  showFlash('');
  comboCount = 0;

  swapData(r1, c1, r2, c2);
  const matched = findMatches();

  if (matched.size === 0) {
    /* マッチなし → 元に戻す */
    swapData(r1, c1, r2, c2);
    const e1 = getTileEl(r1, c1);
    const e2 = getTileEl(r2, c2);
    applyType(e1, board[r1][c1]);
    applyType(e2, board[r2][c2]);
    triggerBounce(e1);
    triggerBounce(e2);
    showFlash('そこには並ばないよ…');
    busy = false;
    return;
  }

  /* DOM にスワップを即時反映 */
  applyType(getTileEl(r1, c1), board[r1][c1]);
  applyType(getTileEl(r2, c2), board[r2][c2]);

  /* 連鎖ループ */
  await runCascade();

  busy = false;
  checkWin();
}

function swapData(r1,c1,r2,c2) {
  const t = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = t;
}

/* =====================================================
   連鎖ループ ← キャンディクラッシュ系の中核
   「マッチ → 消去 → 落下 → 補充 → 再マッチ」を繰り返す
   ===================================================== */
async function runCascade() {
  while (true) {
    const matched = findMatches();
    if (matched.size === 0) break;   // マッチなし → 終了

    comboCount++;

    /* スコア加算 */
    const gained = calcScore(matched, comboCount);
    score += gained;
    updateHUD();
    showScoreMessage(gained, comboCount);
    spawnScorePop(gained, matched);

    /* --- STEP 1: 消去アニメーション --- */
    matched.forEach(key => {
      const [r, c] = parseKey(key);
      getTileEl(r, c)?.classList.add('exploding');
    });
    await wait(T_EXPLODE);

    /* --- STEP 2: データを -1（空）にする --- */
    matched.forEach(key => {
      const [r, c] = parseKey(key);
      board[r][c] = -1;
    });

    /* --- STEP 3: 重力落下（各列を下詰め） --- */
    applyGravity();

    /* --- STEP 4: 上端の空きに新しいピースを補充 --- */
    fillBoard();

    /* --- STEP 5: DOM 再構築（落下 + 補充アニメ） --- */
    rebuildDOM(matched);
    await wait(Math.max(T_FALL, T_SPAWN) + 60);

    /* アニメクラスを除去してから次のループへ */
    boardEl.querySelectorAll('.tile').forEach(el => {
      el.classList.remove('exploding', 'dropping', 'spawning');
    });

    await wait(80);   /* 視認のための微小インターバル */
  }
}

/* =====================================================
   マッチ判定
   ===================================================== */
function findMatches() {
  const cells = new Set();

  /* 横 */
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && board[r][c] !== -1 && board[r][c] === board[r][c-1]) {
        run++;
      } else {
        if (run >= 3) for (let k = c-run; k < c; k++) cells.add(`${r},${k}`);
        run = 1;
      }
    }
  }

  /* 縦 */
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && board[r][c] !== -1 && board[r][c] === board[r-1][c]) {
        run++;
      } else {
        if (run >= 3) for (let k = r-run; k < r; k++) cells.add(`${k},${c}`);
        run = 1;
      }
    }
  }

  return cells;
}

/* =====================================================
   重力: 各列を下詰めにする
   例) col = [A, -1, B, -1, C, D]（row0→5）
     →      [-1, -1, A,  B, C, D]
   ===================================================== */
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    /* 下から走査して非空の値を下から詰める */
    const vals = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== -1) vals.push(board[r][c]);
    }
    /* 下から埋め直す */
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = vals.length > 0 ? vals.shift() : -1;
    }
  }
}

/* =====================================================
   補充: board に残った -1 をランダムピースで埋める
   ===================================================== */
function fillBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === -1) {
        board[r][c] = Math.floor(Math.random() * PIECES.length);
      }
    }
  }
}

/* =====================================================
   DOM 再構築（落下 + 補充アニメーション）
   ===================================================== */
function rebuildDOM(matched) {
  /* 列ごとに何個消えたか = 上から何行が補充ピースか */
  const newRows = new Array(COLS).fill(0);
  matched.forEach(key => {
    const [, c] = parseKey(key);
    newRows[c]++;
  });

  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = makeTileEl(r, c);
      /* 列の上端から newRows[c] 行 = 新規補充ピース */
      el.classList.add(r < newRows[c] ? 'spawning' : 'dropping');
      boardEl.appendChild(el);
    }
  }
}

/* =====================================================
   スコア計算
   ===================================================== */
function calcScore(matched, combo) {
  /* ランごとの長さを収集 */
  const runs = [];
  for (let r = 0; r < ROWS; r++) {
    let run = 0;
    for (let c = 0; c < COLS; c++) {
      matched.has(`${r},${c}`) ? run++ : (run >= 3 && runs.push(run), run = 0);
    }
    if (run >= 3) runs.push(run);
  }
  for (let c = 0; c < COLS; c++) {
    let run = 0;
    for (let r = 0; r < ROWS; r++) {
      matched.has(`${r},${c}`) ? run++ : (run >= 3 && runs.push(run), run = 0);
    }
    if (run >= 3) runs.push(run);
  }

  const base = runs.length
    ? runs.reduce((s, len) => s + (SCORE_TABLE[Math.min(len,5)] ?? SCORE_TABLE[5]), 0)
    : matched.size * 100;

  /* 連鎖ボーナス (2連鎖目から 1.5倍、3連鎖→2倍…) */
  const mult = combo >= 2 ? 1 + (combo - 1) * 0.5 : 1;
  return Math.round(base * mult);
}

/* =====================================================
   UI フィードバック
   ===================================================== */
let flashTimer = null;
function showFlash(msg) {
  flashEl.textContent = msg;
  if (flashTimer) clearTimeout(flashTimer);
  if (msg) flashTimer = setTimeout(() => { flashEl.textContent = ''; }, 2200);
}

function showScoreMessage(gained, combo) {
  if      (combo >= 3)    showFlash(`🌟 ${combo} 連鎖！ +${gained}`);
  else if (combo >= 2)    showFlash(`✨ ${combo} 連鎖！ +${gained}`);
  else if (gained >= 500) showFlash(`🔥 ビッグマッチ！ +${gained}`);
  else if (gained >= 200) showFlash(`⭐ ナイス！ +${gained}`);
  else                    showFlash(`+${gained}`);
}

function spawnScorePop(gained, matched) {
  const keys = [...matched];
  const [r, c] = parseKey(keys[Math.floor(keys.length / 2)]);
  const rect  = boardEl.getBoundingClientRect();
  const cellW = rect.width  / COLS;
  const cellH = rect.height / ROWS;

  const pop = document.createElement('div');
  pop.className   = 'score-pop';
  pop.textContent = `+${gained}`;
  pop.style.cssText = `
    position:absolute;
    left:${c * cellW + cellW/2 - 22}px;
    top:${r * cellH + cellH/2 - 12}px;
    pointer-events:none;
    z-index:99;
  `;
  boardEl.style.position = 'relative';
  boardEl.appendChild(pop);
  pop.addEventListener('animationend', () => pop.remove(), {once: true});
}

/* =====================================================
   バウンスバック（無効スワップ）
   ===================================================== */
function triggerBounce(el) {
  if (!el) return;
  el.classList.remove('bounce-back');
  void el.offsetWidth;
  el.classList.add('bounce-back');
  el.addEventListener('animationend', () => el.classList.remove('bounce-back'), {once: true});
}

/* =====================================================
   クリア
   ===================================================== */
function checkWin() {
  if (score >= TARGET) setTimeout(showClear, 250);
}
function showClear() {
  modalScore.textContent = score.toLocaleString();
  overlay.classList.remove('hidden');
}
function hideOverlay() { overlay.classList.add('hidden'); }

/* =====================================================
   ユーティリティ
   ===================================================== */
const wait     = ms => new Promise(r => setTimeout(r, ms));
const parseKey = key => key.split(',').map(Number);

/* =====================================================
   ボタン
   ===================================================== */
document.getElementById('btn-restart').addEventListener('click', () => {
  if (busy) return;
  init();
});
document.getElementById('btn-again').addEventListener('click', () => init());
document.getElementById('btn-stages').addEventListener('click', () => {
  alert('ステージ一覧は準備中です！\n現在は北海道ステージのみ実装されています。');
});

/* =====================================================
   起動
   ===================================================== */
init();
