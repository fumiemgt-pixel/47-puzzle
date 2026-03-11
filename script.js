/* =====================================================
   北海道パズル — script.js
   仕様:
   ① プレイヤーの操作でマッチした場合のみ消去
   ② 初期盤面はマッチ発生しない配置で生成
   ③ 自動コンボ禁止（落下後に揃っても消さない）
   ④ 1手につき消去は1回だけ
   ⑤ マッチしない移動は元の位置に戻す
   ⑥ 重力あり（消えたら上から落下・補充）
   ===================================================== */

/* ── 定数 ── */
const COLS        = 6;
const ROWS        = 6;
const TARGET      = 2000;
const SCORE_TABLE = { 3: 100, 4: 200, 5: 500 };   // マッチ数→スコア
const PIECES      = ['❄️','🦀','🐄','🧀','🌽','🦊'];

/*
  後で画像に差し替える際はここを変えるだけ:
  const PIECES = [
    'images/hokkaido/01.png',
    'images/hokkaido/02.png',
    ...
  ];
  renderTile() の中でも img/emoji を切り替えられるようにしてあります。
*/

/* ── 状態 ── */
let board    = [];     // board[row][col] = 0-5 のタイプ番号
let score    = 0;
let busy     = false;  // アニメーション中フラグ
let selected = null;   // {row, col} または null

/* ── DOM参照 ── */
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
function init() {
  score    = 0;
  selected = null;
  busy     = false;
  board    = generateBoard();
  renderAll();
  updateHUD();
  hideOverlay();
  showFlash('');
}

/* ── ボード生成：初期マッチなし ── */
function generateBoard() {
  const b = Array.from({length: ROWS}, () => new Array(COLS).fill(0));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // 使えるタイプ一覧から、すでに左2つ・上2つと同じになるタイプを除外
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
      boardEl.appendChild(createTileEl(r, c));
    }
  }
}

function createTileEl(r, c) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.row  = r;
  el.dataset.col  = c;
  el.dataset.type = board[r][c];
  setTileContent(el, board[r][c]);
  attachTileEvents(el, r, c);
  return el;
}

function setTileContent(el, type) {
  /*
    画像差し替えポイント:
    if (PIECES[type].endsWith('.png')) {
      el.innerHTML = `<img src="${PIECES[type]}" alt="piece${type}" style="width:75%;height:75%;object-fit:contain;">`;
    } else {
      el.textContent = PIECES[type];
    }
  */
  el.textContent = PIECES[type];
  el.dataset.type = type;
}

function getTileEl(r, c) {
  return boardEl.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`);
}

function refreshTileEl(r, c) {
  const el = getTileEl(r, c);
  if (!el) return;
  setTileContent(el, board[r][c]);
}

/* =====================================================
   HUD更新
   ===================================================== */
function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  const pct = Math.min(100, Math.round(score / TARGET * 100));
  progFill.style.width = pct + '%';
  progPct.textContent  = `${score.toLocaleString()} / ${TARGET.toLocaleString()}`;
}

/* =====================================================
   タッチ / クリック操作
   ===================================================== */
/* スワイプ検出用 */
let touchOrigin = null; // {r, c, x, y}

function attachTileEvents(el, r, c) {
  /* PC: クリックで選択→隣接選択でスワップ */
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    onSelect(r, c);
  });

  /* スマホ: タッチスワイプ */
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.touches[0];
    touchOrigin = {r, c, x: t.clientX, y: t.clientY};
  }, {passive: false});

  el.addEventListener('touchend', e => {
    if (!touchOrigin) return;
    e.preventDefault();
    const t   = e.changedTouches[0];
    const dx  = t.clientX - touchOrigin.x;
    const dy  = t.clientY - touchOrigin.y;
    const {r: or, c: oc} = touchOrigin;
    touchOrigin = null;

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      /* ほぼ静止 → クリック扱い */
      onSelect(or, oc);
      return;
    }
    /* スワイプ方向を決定 */
    let nr = or, nc = oc;
    if (Math.abs(dx) > Math.abs(dy)) {
      nc = oc + (dx > 0 ? 1 : -1);
    } else {
      nr = or + (dy > 0 ? 1 : -1);
    }
    if (!inBounds(nr, nc)) return;
    clearSelected();
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

  /* 同じタイルを再タップ → 選択解除 */
  if (sr === r && sc === c) {
    clearSelected();
    return;
  }

  /* 隣接していれば入れ替え試行 */
  if (isAdjacent(sr, sc, r, c)) {
    clearSelected();
    doSwap(sr, sc, r, c);
  } else {
    /* 選択先を変更 */
    clearSelected();
    selected = {row: r, col: c};
    getTileEl(r, c)?.classList.add('selected');
  }
}

function clearSelected() {
  if (selected) {
    getTileEl(selected.row, selected.col)?.classList.remove('selected');
    selected = null;
  }
}

function isAdjacent(r1, c1, r2, c2) {
  return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

/* =====================================================
   スワップ処理（仕様①④⑤）
   ===================================================== */
async function doSwap(r1, c1, r2, c2) {
  if (busy) return;
  busy = true;
  showFlash('');

  /* 1) ボードデータを入れ替え */
  swapBoard(r1, c1, r2, c2);

  /* 2) マッチ判定（プレイヤー操作後の1回のみ） */
  const matched = findAllMatches();

  if (matched.size === 0) {
    /* マッチなし → 元に戻す（仕様⑤） */
    swapBoard(r1, c1, r2, c2);
    /* DOM更新 */
    refreshTileEl(r1, c1);
    refreshTileEl(r2, c2);
    /* 視覚フィードバック */
    animateBounceBack(r1, c1);
    animateBounceBack(r2, c2);
    showFlash('そこには並ばないよ…');
    busy = false;
    return;
  }

  /* 3) DOM入れ替え反映 */
  refreshTileEl(r1, c1);
  refreshTileEl(r2, c2);

  /* 4) マッチ消去→落下→補充（1回のみ：仕様③④） */
  await resolveOnce(matched);

  busy = false;
  checkWin();
}

function swapBoard(r1, c1, r2, c2) {
  const tmp = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
}

/* =====================================================
   マッチ判定
   ===================================================== */
function findAllMatches() {
  const cells = new Set();

  /* 横 */
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && board[r][c] === board[r][c-1]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = c - run; k < c; k++) cells.add(`${r},${k}`);
        }
        run = 1;
      }
    }
  }

  /* 縦 */
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && board[r][c] === board[r-1][c]) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = r - run; k < r; k++) cells.add(`${k},${c}`);
        }
        run = 1;
      }
    }
  }

  return cells;   // Set<"r,c">
}

/* マッチしたセルのうち最大の連続数を列・行ごとに返す（スコア計算用） */
function calcMatchScore(matched) {
  /* 各マッチグループの長さを調べる（横・縦それぞれ） */
  const runLengths = [];

  /* 横 */
  for (let r = 0; r < ROWS; r++) {
    let run = 0;
    for (let c = 0; c < COLS; c++) {
      if (matched.has(`${r},${c}`)) {
        run++;
      } else {
        if (run >= 3) runLengths.push(run);
        run = 0;
      }
    }
    if (run >= 3) runLengths.push(run);
  }

  /* 縦 */
  for (let c = 0; c < COLS; c++) {
    let run = 0;
    for (let r = 0; r < ROWS; r++) {
      if (matched.has(`${r},${c}`)) {
        run++;
      } else {
        if (run >= 3) runLengths.push(run);
        run = 0;
      }
    }
    if (run >= 3) runLengths.push(run);
  }

  /* スコア合算（T字・L字は重複カウントを避けるため matched.size を基準にしない） */
  return runLengths.reduce((sum, len) => {
    const key = Math.min(len, 5);
    return sum + (SCORE_TABLE[key] || SCORE_TABLE[5]);
  }, 0);
}

/* =====================================================
   消去 → 落下 → 補充（1サイクルのみ：仕様③④）
   ===================================================== */
async function resolveOnce(matched) {
  /* ── スコア加算 ── */
  const gained = calcMatchScore(matched);
  score += gained;
  updateHUD();
  spawnScorePop(gained, matched);
  if (gained >= 500) showFlash('🔥 ビッグマッチ！ +' + gained);
  else if (gained >= 200) showFlash('✨ ナイス！ +' + gained);
  else showFlash('+' + gained);

  /* ── 消去アニメーション ── */
  matched.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    getTileEl(r, c)?.classList.add('exploding');
  });
  await wait(340);

  /* ── ボードデータから消去（-1でマーク） ── */
  matched.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    board[r][c] = -1;
  });

  /* ── 重力：各列を下詰めにする（仕様⑥） ── */
  for (let c = 0; c < COLS; c++) {
    /* 下から上に向かって非空セルを詰める */
    const stack = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== -1) stack.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = stack.shift() !== undefined ? stack[0] : -1;
    }
    /* 上から改めて正しく詰める */
    const filled = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] !== -1) filled.push(board[r][c]);
    }
    const emptyCount = ROWS - filled.length;
    for (let r = 0; r < ROWS; r++) {
      board[r][c] = r < emptyCount ? -1 : filled[r - emptyCount];
    }
  }

  /* ── 新しいピースを補充 ── */
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === -1) {
        board[r][c] = Math.floor(Math.random() * PIECES.length);
      }
    }
  }

  /* ── DOM全再描画（落下・補充アニメ付き） ── */
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = createTileEl(r, c);
      if (matched.has(`${r},${c}`)) {
        /* もともと空欄だった場所 = 補充ピース */
        el.classList.add('spawning');
      } else {
        el.classList.add('dropping');
      }
      boardEl.appendChild(el);
    }
  }

  await wait(320);

  /* ── アニメーションクラス除去 ── */
  boardEl.querySelectorAll('.tile').forEach(el => {
    el.classList.remove('exploding', 'dropping', 'spawning');
  });
}

/* =====================================================
   ユーティリティ
   ===================================================== */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function animateBounceBack(r, c) {
  const el = getTileEl(r, c);
  if (!el) return;
  el.classList.remove('bounce-back');
  void el.offsetWidth; /* reflow */
  el.classList.add('bounce-back');
  el.addEventListener('animationend', () => el.classList.remove('bounce-back'), {once: true});
}

let flashTimer = null;
function showFlash(msg) {
  flashEl.textContent = msg;
  if (flashTimer) clearTimeout(flashTimer);
  if (msg) {
    flashTimer = setTimeout(() => { flashEl.textContent = ''; }, 2000);
  }
}

/* スコアポップアップ */
function spawnScorePop(gained, matched) {
  /* マッチセルの中央あたりにポップアップ */
  const keys = [...matched];
  const mid  = keys[Math.floor(keys.length / 2)];
  const [r, c] = mid.split(',').map(Number);
  const el = getTileEl(r, c);
  if (!el) return;
  const pop = document.createElement('div');
  pop.className = 'score-pop';
  pop.textContent = `+${gained}`;
  el.appendChild(pop);
  pop.addEventListener('animationend', () => pop.remove(), {once: true});
}

/* =====================================================
   クリア判定
   ===================================================== */
function checkWin() {
  if (score >= TARGET) {
    setTimeout(showClear, 200);
  }
}

function showClear() {
  modalScore.textContent = score.toLocaleString();
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

/* =====================================================
   ボタンイベント
   ===================================================== */
document.getElementById('btn-restart').addEventListener('click', () => {
  if (busy) return;
  init();
});

document.getElementById('btn-again').addEventListener('click', () => {
  init();
});

document.getElementById('btn-stages').addEventListener('click', () => {
  /* 47都道府県ステージ一覧への導線（将来拡張用） */
  alert('ステージ一覧は準備中です！\n現在は北海道ステージのみ実装されています。');
});

/* =====================================================
   起動
   ===================================================== */
init();
