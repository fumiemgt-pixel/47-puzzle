/* ============================================================
   北海道パズル — script.js
   役割ごとに関数を分けた、読みやすい設計

   主要関数一覧:
     initGame()          — ゲーム初期化
     generateBoard()     — 盤面生成（初期マッチなし）
     renderBoard()       — 全タイルをDOM再描画

     onTileSelect()      — タイル選択ハンドラ
     doSwap()            — 2タイルを入れ替え試行

     resolveChain()      — 連鎖ループ（マッチ→消去→落下→補充→繰り返し）
     findMatches()       — 盤面全体のマッチセルを返す
     removeMatches()     — マッチセルにアニメを付けてデータ削除
     expandBombBlast()   — 爆弾の爆発範囲を追加
     activateRainbow()   — レインボー発動（同種全消し）
     applyGravity()      — 各列を下詰め
     fillBoard()         — 空セルに新ピース補充

     createSpecialPiece()— 4/5マッチ時に特殊ピースを生成
     calcScore()         — スコア計算（連鎖倍率あり）

     makeTileEl()        — タイルDOM要素を生成
     applyTileToEl()     — セルデータをDOM要素に反映
     getTileEl()         — 指定位置のDOMを取得
     rebuildDOM()        — 落下・補充後にDOMを全再構築

     updateHUD()         — スコア・進捗バー更新
     showFlash()         — フラッシュメッセージ表示
     showCombo()         — コンボ表示
     showScorePop()      — スコアポップアップ表示
     showClearModal()    — クリアモーダル表示
   ============================================================ */

'use strict';

/* ============================================================
   1. 定数・設定
   ============================================================ */

/** グリッドサイズ */
const COLS = 6;
const ROWS = 6;

/** 目標スコア */
const TARGET_SCORE = 2000;

/**
 * 北海道ピース定義
 * 画像に差し替える場合は imageSrc に PNG パスを指定する
 *   例: { emoji: '❄️', imageSrc: 'images/hokkaido/1.png', label: '雪' }
 * imageSrc が存在する場合は img タグでレンダリングされる
 */
const PIECES = [
  { emoji: '❄️', imageSrc: null, label: '雪'         },
  { emoji: '🦀', imageSrc: null, label: 'カニ'       },
  { emoji: '🐄', imageSrc: null, label: '牛'         },
  { emoji: '🧀', imageSrc: null, label: 'チーズ'     },
  { emoji: '🌽', imageSrc: null, label: 'とうもろこし'},
  { emoji: '🦊', imageSrc: null, label: 'キタキツネ' },
];

/** 特殊ピース識別子 */
const SPECIAL = { BOMB: 'BOMB', RAINBOW: 'RAINBOW' };

/** スコアテーブル（マッチ数→基本スコア） */
const SCORE_TABLE = { 3: 100, 4: 200, 5: 500 };

/** アニメーション時間 (ms) */
const ANIM = {
  POP:   300,  // 消去
  DROP:  270,  // 落下
  SPAWN: 270,  // 補充
  WAIT:  80,   // 連鎖間インターバル
};

/* ============================================================
   2. ゲーム状態
   ============================================================ */

/** セル: { type: 0-5 | 'BOMB' | 'RAINBOW' } */
let board      = [];   // board[row][col] = cell | null
let score      = 0;
let busy       = false;
let selected   = null; // { row, col } | null
let comboCount = 0;

/* ============================================================
   3. DOM 参照
   ============================================================ */
const boardEl      = document.getElementById('js-board');
const scoreEl      = document.getElementById('js-score');
const progBarEl    = document.getElementById('js-prog-bar');
const progLabelEl  = document.getElementById('js-prog-label');
const comboEl      = document.getElementById('js-combo');
const flashEl      = document.getElementById('js-flash');
const overlayEl    = document.getElementById('js-overlay');
const modalScoreEl = document.getElementById('js-modal-score');

/* ============================================================
   4. 初期化
   ============================================================ */

/**
 * initGame()
 * ゲーム全体をリセットしてスタート
 */
async function initGame() {
  score      = 0;
  comboCount = 0;
  selected   = null;
  busy       = true;

  board = generateBoard();
  renderBoard();
  updateHUD();
  hideModal();
  hideCombo();
  hideFlash();

  // 開始直後のマッチを自動解消
  await resolveChain();

  busy = false;
}

/* ============================================================
   5. 盤面生成
   ============================================================ */

/**
 * generateBoard()
 * 6×6 のセルを生成する
 * 左2マス・上2マスと同じにならないようにして
 * 初期マッチをなるべく防ぐ
 * （残ったマッチは initGame の resolveChain で解消する）
 */
function generateBoard() {
  const b = [];
  for (let r = 0; r < ROWS; r++) {
    b[r] = [];
    for (let c = 0; c < COLS; c++) {
      const forbidden = new Set();
      if (c >= 2 && b[r][c-1].type === b[r][c-2].type) {
        forbidden.add(b[r][c-1].type);
      }
      if (r >= 2 && b[r-1][c].type === b[r-2][c].type) {
        forbidden.add(b[r-1][c].type);
      }
      const pool = PIECES.map((_, i) => i).filter(i => !forbidden.has(i));
      b[r][c] = { type: pool[Math.floor(Math.random() * pool.length)] };
    }
  }
  return b;
}

/**
 * randomNormalType()
 * 通常ピースの番号をランダムに返す
 */
function randomNormalType() {
  return Math.floor(Math.random() * PIECES.length);
}

/* ============================================================
   6. 描画
   ============================================================ */

/**
 * renderBoard()
 * board 配列の状態を元に盤面全体を再描画する
 */
function renderBoard() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = makeTileEl(r, c);
      boardEl.appendChild(el);
    }
  }
}

/**
 * makeTileEl(row, col)
 * 指定位置のタイルDOM要素を新規作成してイベントを設定する
 */
function makeTileEl(row, col) {
  const el = document.createElement('div');
  el.className   = 'tile';
  el.dataset.row = row;
  el.dataset.col = col;
  el.setAttribute('role', 'gridcell');
  applyTileToEl(el, board[row][col]);
  attachTileEvents(el, row, col);
  return el;
}

/**
 * applyTileToEl(el, cell)
 * セルデータをDOM要素の見た目に反映する
 * ─ cell.type が数値 → 通常ピース（emoji or 画像）
 * ─ cell.type が BOMB → 爆弾
 * ─ cell.type が RAINBOW → レインボー
 */
function applyTileToEl(el, cell) {
  // 特殊クラスをリセット
  el.classList.remove('is-bomb', 'is-rainbow');
  el.removeAttribute('data-type');

  if (cell.type === SPECIAL.BOMB) {
    el.classList.add('is-bomb');
    el.dataset.type = 'special';
    setTileContent(el, '💣', null);
    el.setAttribute('aria-label', '爆弾');
    return;
  }

  if (cell.type === SPECIAL.RAINBOW) {
    el.classList.add('is-rainbow');
    el.dataset.type = 'special';
    setTileContent(el, '🌈', null);
    el.setAttribute('aria-label', 'レインボー');
    return;
  }

  // 通常ピース
  const piece = PIECES[cell.type];
  el.dataset.type = cell.type;
  setTileContent(el, piece.emoji, piece.imageSrc);
  el.setAttribute('aria-label', piece.label);
}

/**
 * setTileContent(el, emoji, imageSrc)
 * imageSrc があれば <img> タグ、なければテキスト(emoji)で描画する
 * ─ 画像差し替え時はここだけ変わる
 */
function setTileContent(el, emoji, imageSrc) {
  el.innerHTML = '';
  if (imageSrc) {
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = emoji;
    img.draggable = false;
    el.appendChild(img);
  } else {
    el.textContent = emoji;
  }
}

/**
 * getTileEl(row, col)
 * DOM から指定位置のタイル要素を取得する
 */
function getTileEl(row, col) {
  return boardEl.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
}

/* ============================================================
   7. 入力処理（クリック / タップ / スワイプ）
   ============================================================ */

let touchOrigin = null; // { row, col, x, y }

/**
 * attachTileEvents(el, row, col)
 * タイル要素にクリック・タッチイベントを登録する
 */
function attachTileEvents(el, row, col) {
  // ── PC: クリック選択 ──
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    if (busy) return;
    onTileSelect(row, col);
  });

  // ── スマホ: タッチ開始 ──
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (busy) return;
    const t = e.touches[0];
    touchOrigin = { row, col, x: t.clientX, y: t.clientY };
  }, { passive: false });

  // ── スマホ: タッチ終了 → 方向を判定してスワップ ──
  el.addEventListener('touchend', (e) => {
    if (!touchOrigin || busy) { touchOrigin = null; return; }
    e.preventDefault();

    const t  = e.changedTouches[0];
    const dx = t.clientX - touchOrigin.x;
    const dy = t.clientY - touchOrigin.y;
    const { row: or, col: oc } = touchOrigin;
    touchOrigin = null;

    // 移動量が小さければタップ扱い
    if (Math.abs(dx) < 9 && Math.abs(dy) < 9) {
      onTileSelect(or, oc);
      return;
    }

    // スワイプ方向の隣セルを計算
    let nr = or, nc = oc;
    if (Math.abs(dx) >= Math.abs(dy)) {
      nc = oc + (dx > 0 ? 1 : -1);
    } else {
      nr = or + (dy > 0 ? 1 : -1);
    }

    if (!isInBounds(nr, nc)) return;
    clearSelection();
    doSwap(or, oc, nr, nc);
  }, { passive: false });
}

/**
 * onTileSelect(row, col)
 * タイルをタップ / クリックしたときの選択ロジック
 */
function onTileSelect(row, col) {
  if (busy) return;

  // 未選択 → このタイルを選択
  if (!selected) {
    selected = { row, col };
    getTileEl(row, col)?.classList.add('is-selected');
    return;
  }

  const { row: sr, col: sc } = selected;

  // 同じタイルを再タップ → 選択解除
  if (sr === row && sc === col) {
    clearSelection();
    return;
  }

  // 隣接タイルなら入れ替え試行
  if (isAdjacent(sr, sc, row, col)) {
    clearSelection();
    doSwap(sr, sc, row, col);
    return;
  }

  // 非隣接 → 選択先を切り替え
  clearSelection();
  selected = { row, col };
  getTileEl(row, col)?.classList.add('is-selected');
}

/**
 * clearSelection()
 * 現在の選択状態を解除する
 */
function clearSelection() {
  if (selected) {
    getTileEl(selected.row, selected.col)?.classList.remove('is-selected');
    selected = null;
  }
}

/* ============================================================
   8. スワップ処理
   ============================================================ */

/**
 * doSwap(r1, c1, r2, c2)
 * 2タイルの入れ替えを試みる
 * マッチしなければ元に戻す
 */
async function doSwap(r1, c1, r2, c2) {
  if (busy) return;
  busy = true;
  comboCount = 0;
  hideCombo();
  hideFlash();

  const cellA = board[r1][c1];
  const cellB = board[r2][c2];

  // ── レインボー発動チェック ──
  // レインボーと通常ピースを入れ替えた場合、即発動
  if (cellA.type === SPECIAL.RAINBOW && isNormalType(cellB.type)) {
    swapBoardData(r1, c1, r2, c2);
    applyTileToEl(getTileEl(r1, c1), board[r1][c1]);
    applyTileToEl(getTileEl(r2, c2), board[r2][c2]);
    await activateRainbow(cellB.type);
    busy = false;
    checkWin();
    return;
  }
  if (cellB.type === SPECIAL.RAINBOW && isNormalType(cellA.type)) {
    swapBoardData(r1, c1, r2, c2);
    applyTileToEl(getTileEl(r1, c1), board[r1][c1]);
    applyTileToEl(getTileEl(r2, c2), board[r2][c2]);
    await activateRainbow(cellA.type);
    busy = false;
    checkWin();
    return;
  }

  // ── 通常スワップ ──
  swapBoardData(r1, c1, r2, c2);

  const matched = findMatches();

  if (matched.size === 0) {
    // マッチなし → 元に戻す
    swapBoardData(r1, c1, r2, c2);
    applyTileToEl(getTileEl(r1, c1), board[r1][c1]);
    applyTileToEl(getTileEl(r2, c2), board[r2][c2]);
    triggerBounce(getTileEl(r1, c1));
    triggerBounce(getTileEl(r2, c2));
    showFlash('そこには並ばないよ…');
    busy = false;
    return;
  }

  // DOM に入れ替えを反映
  applyTileToEl(getTileEl(r1, c1), board[r1][c1]);
  applyTileToEl(getTileEl(r2, c2), board[r2][c2]);

  // 連鎖ループ開始
  await resolveChain();

  busy = false;
  checkWin();
}

/**
 * swapBoardData(r1, c1, r2, c2)
 * board 配列上で2セルを入れ替える（DOM は変えない）
 */
function swapBoardData(r1, c1, r2, c2) {
  const tmp     = board[r1][c1];
  board[r1][c1] = board[r2][c2];
  board[r2][c2] = tmp;
}

/* ============================================================
   9. 連鎖ループ
   ============================================================ */

/**
 * resolveChain()
 * ─ マッチ判定
 * ─ マッチあり → 消去 → 落下 → 補充 → 再判定
 * ─ マッチなし → ループ終了
 * をマッチがなくなるまで繰り返す
 */
async function resolveChain() {
  while (true) {
    const matched = findMatches();
    if (matched.size === 0) break;

    // 連鎖カウント
    comboCount++;
    if (comboCount >= 2) {
      showCombo(comboCount);
    }

    // 特殊ピース生成判定（消去前に行う）
    const specialGen = detectSpecialGeneration(matched);

    // スコア加算
    const gained = calcScore(matched, comboCount);
    score += gained;
    updateHUD();
    showScorePop(gained, matched);
    showScoreMessage(gained, comboCount);

    // 爆弾が含まれていれば範囲拡大
    expandBombBlast(matched);

    // STEP 1: 消去アニメーション
    await removeMatches(matched);

    // STEP 2: 重力落下
    applyGravity();

    // STEP 3: 特殊ピース配置（落下後の正しい位置に置く）
    if (specialGen) {
      placeSpecialPiece(specialGen);
    }

    // STEP 4: 空きを補充
    fillBoard();

    // STEP 5: DOM 再構築（落下・補充アニメ）
    rebuildDOM(matched, specialGen);
    await wait(Math.max(ANIM.DROP, ANIM.SPAWN) + 70);

    // アニメクラスを除去
    boardEl.querySelectorAll('.tile').forEach(el => {
      el.classList.remove('anim-drop', 'anim-spawn', 'anim-blast', 'is-animating');
    });

    // 次の連鎖前に少し間を置く
    await wait(ANIM.WAIT);
  }

  // 全連鎖完了
  comboCount = 0;
  hideCombo();
}

/* ============================================================
   10. マッチ判定
   ============================================================ */

/**
 * findMatches()
 * 盤面全体を走査し、3個以上連続するセルのキーを Set で返す
 * キー形式: "row,col"
 * 特殊ピースはマッチ対象外（通常ピースのみ判定）
 */
function findMatches() {
  const cells = new Set();

  // 横方向
  for (let r = 0; r < ROWS; r++) {
    let runStart = 0;
    let runLen   = 1;
    for (let c = 1; c <= COLS; c++) {
      const prev = board[r][c - 1];
      const curr = c < COLS ? board[r][c] : null;
      const same = curr
        && isNormalType(prev.type)
        && isNormalType(curr.type)
        && prev.type === curr.type;

      if (same) {
        runLen++;
      } else {
        if (runLen >= 3) {
          for (let k = runStart; k < runStart + runLen; k++) {
            cells.add(`${r},${k}`);
          }
        }
        runStart = c;
        runLen   = 1;
      }
    }
  }

  // 縦方向
  for (let c = 0; c < COLS; c++) {
    let runStart = 0;
    let runLen   = 1;
    for (let r = 1; r <= ROWS; r++) {
      const prev = board[r - 1][c];
      const curr = r < ROWS ? board[r][c] : null;
      const same = curr
        && isNormalType(prev.type)
        && isNormalType(curr.type)
        && prev.type === curr.type;

      if (same) {
        runLen++;
      } else {
        if (runLen >= 3) {
          for (let k = runStart; k < runStart + runLen; k++) {
            cells.add(`${k},${c}`);
          }
        }
        runStart = r;
        runLen   = 1;
      }
    }
  }

  return cells;
}

/* ============================================================
   11. 消去
   ============================================================ */

/**
 * removeMatches(matched)
 * マッチセルに消去アニメーションを付け、
 * アニメ完了後に board から削除（null にする）
 */
async function removeMatches(matched) {
  matched.forEach(key => {
    const [r, c] = parseKey(key);
    const el = getTileEl(r, c);
    if (el) {
      el.classList.add('anim-pop', 'is-animating');
    }
  });

  await wait(ANIM.POP);

  matched.forEach(key => {
    const [r, c] = parseKey(key);
    board[r][c] = null;
  });
}

/* ============================================================
   12. 爆弾処理
   ============================================================ */

/**
 * expandBombBlast(matched)
 * matched セット内に爆弾ピースが含まれていれば
 * 周囲8マスのキーを matched に追加し、
 * 視覚フラッシュを当てる
 */
function expandBombBlast(matched) {
  const bombs = [];
  matched.forEach(key => {
    const [r, c] = parseKey(key);
    if (board[r][c]?.type === SPECIAL.BOMB) {
      bombs.push([r, c]);
    }
  });

  if (bombs.length === 0) return;

  showFlash('💥 爆発！');

  bombs.forEach(([br, bc]) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = br + dr, nc = bc + dc;
        if (!isInBounds(nr, nc)) continue;
        const key = `${nr},${nc}`;
        if (!matched.has(key)) {
          matched.add(key);
          // 爆発範囲フラッシュ
          getTileEl(nr, nc)?.classList.add('anim-blast');
        }
      }
    }
  });
}

/* ============================================================
   13. レインボー処理
   ============================================================ */

/**
 * activateRainbow(targetType)
 * targetType と同じ通常ピースをすべて消す
 */
async function activateRainbow(targetType) {
  const label = PIECES[targetType]?.label ?? '';
  showFlash(`🌈 ${label} を全消し！`);

  const matched = new Set();

  // 同種を全マーク
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]?.type === targetType) {
        matched.add(`${r},${c}`);
      }
    }
  }
  // レインボー自身も消す
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]?.type === SPECIAL.RAINBOW) {
        matched.add(`${r},${c}`);
      }
    }
  }

  const gained = matched.size * 80;
  score += gained;
  updateHUD();
  showScorePop(gained, matched);

  await removeMatches(matched);
  applyGravity();
  fillBoard();
  rebuildDOM(matched, null);
  await wait(Math.max(ANIM.DROP, ANIM.SPAWN) + 70);

  boardEl.querySelectorAll('.tile').forEach(el => {
    el.classList.remove('anim-drop', 'anim-spawn', 'is-animating');
  });
  await wait(ANIM.WAIT);

  // 連鎖継続
  await resolveChain();
}

/* ============================================================
   14. 特殊ピース生成
   ============================================================ */

/**
 * detectSpecialGeneration(matched)
 * マッチ内に4個以上の連続ランがあれば特殊ピース情報を返す
 * ─ 5個以上 → RAINBOW
 * ─ 4個     → BOMB
 * 複数ある場合は最長優先、同点なら最後に見つけた方
 */
function detectSpecialGeneration(matched) {
  let best = null;

  // 横ラン
  for (let r = 0; r < ROWS; r++) {
    let run = [];
    for (let c = 0; c <= COLS; c++) {
      if (c < COLS && matched.has(`${r},${c}`)) {
        run.push([r, c]);
      } else {
        if (run.length >= 4) {
          if (!best || run.length > best.run.length) best = { run: [...run] };
        }
        run = [];
      }
    }
  }

  // 縦ラン
  for (let c = 0; c < COLS; c++) {
    let run = [];
    for (let r = 0; r <= ROWS; r++) {
      if (r < ROWS && matched.has(`${r},${c}`)) {
        run.push([r, c]);
      } else {
        if (run.length >= 4) {
          if (!best || run.length > best.run.length) best = { run: [...run] };
        }
        run = [];
      }
    }
  }

  if (!best) return null;

  const specialType = best.run.length >= 5 ? SPECIAL.RAINBOW : SPECIAL.BOMB;
  // 生成位置: ランの中央
  const mid = best.run[Math.floor(best.run.length / 2)];

  return { row: mid[0], col: mid[1], type: specialType };
}

/**
 * createSpecialPiece(type)
 * 特殊ピースのセルオブジェクトを作る
 */
function createSpecialPiece(type) {
  return { type };
}

/**
 * placeSpecialPiece(gen)
 * applyGravity 後の正しい位置に特殊ピースを配置する
 * gen.col の列について一番下の null を探す
 */
function placeSpecialPiece(gen) {
  // applyGravity 後は上端に null が固まっているので
  // 指定行近辺の null に配置する
  // ここでは単純に gen.row, gen.col の位置（null のはず）に置く
  if (board[gen.row][gen.col] === null) {
    board[gen.row][gen.col] = createSpecialPiece(gen.type);
  } else {
    // 万一埋まっていたら列の上端の null に置く
    for (let r = 0; r < ROWS; r++) {
      if (board[r][gen.col] === null) {
        board[r][gen.col] = createSpecialPiece(gen.type);
        break;
      }
    }
  }
}

/* ============================================================
   15. 重力・補充
   ============================================================ */

/**
 * applyGravity()
 * 各列について、null を取り除いてピースを下詰めにする
 * 上端の空きは null のままにしておく（fillBoard で補充）
 *
 * 例: col = [A, null, B, null, C, D]  (上→下)
 *   → [-----------]
 *      [null, null, A, B, C, D]
 */
function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    // 下から走査し、非null を集める（下の値が先頭）
    const vals = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== null) {
        vals.push(board[r][c]);
      }
    }
    // 下から詰め直す
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = vals.length > 0 ? vals.shift() : null;
    }
  }
}

/**
 * fillBoard()
 * board に残っている null をすべて新しいランダムピースで埋める
 * 空白マスが残りっぱなしにならないように必ず全埋めする
 */
function fillBoard() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === null) {
        board[r][c] = { type: randomNormalType() };
      }
    }
  }
}

/* ============================================================
   16. DOM 再構築（落下 + 補充アニメーション）
   ============================================================ */

/**
 * rebuildDOM(matched, specialGen)
 * 落下・補充後の board に合わせて DOM を再構築する
 *
 * アニメーション振り分け:
 * ─ 「消去された列の上端 N 行」 → anim-spawn（新規補充）
 * ─ それ以外 → anim-drop（落下）
 */
function rebuildDOM(matched, specialGen) {
  // 列ごとに何個消えたか（= その列の上端から何行が補充されたか）
  const newRowsPerCol = new Array(COLS).fill(0);
  matched.forEach(key => {
    const [, c] = parseKey(key);
    newRowsPerCol[c]++;
  });

  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const el = makeTileEl(r, c);

      // 特殊ピース生成位置は特別に光らせる
      if (specialGen && r === specialGen.row && c === specialGen.col) {
        el.classList.add('anim-spawn');
      } else if (r < newRowsPerCol[c]) {
        // 列上端の補充ピース
        el.classList.add('anim-spawn');
      } else {
        // 落下ピース
        el.classList.add('anim-drop');
      }

      boardEl.appendChild(el);
    }
  }
}

/* ============================================================
   17. スコア計算
   ============================================================ */

/**
 * calcScore(matched, combo)
 * ─ 横・縦の各ランの長さごとにスコアを加算
 * ─ 2連鎖目から倍率がかかる（1.5倍、2倍、2.5倍…）
 */
function calcScore(matched, combo) {
  const runs = collectRuns(matched);

  const base = runs.reduce((sum, len) => {
    const key = Math.min(len, 5);
    return sum + (SCORE_TABLE[key] ?? SCORE_TABLE[5]);
  }, 0) || matched.size * 80; // フォールバック

  // 連鎖ボーナス
  const mult = combo >= 2 ? 1 + (combo - 1) * 0.5 : 1;
  return Math.round(base * mult);
}

/**
 * collectRuns(matched)
 * matched セットから横・縦のランの長さ配列を収集する
 */
function collectRuns(matched) {
  const runs = [];

  // 横
  for (let r = 0; r < ROWS; r++) {
    let run = 0;
    for (let c = 0; c < COLS; c++) {
      if (matched.has(`${r},${c}`)) {
        run++;
      } else {
        if (run >= 3) runs.push(run);
        run = 0;
      }
    }
    if (run >= 3) runs.push(run);
  }

  // 縦
  for (let c = 0; c < COLS; c++) {
    let run = 0;
    for (let r = 0; r < ROWS; r++) {
      if (matched.has(`${r},${c}`)) {
        run++;
      } else {
        if (run >= 3) runs.push(run);
        run = 0;
      }
    }
    if (run >= 3) runs.push(run);
  }

  return runs;
}

/* ============================================================
   18. HUD 更新
   ============================================================ */

/**
 * updateHUD()
 * スコア表示・進捗バー・ラベルを更新する
 */
function updateHUD() {
  scoreEl.textContent     = score.toLocaleString();
  const pct               = Math.min(100, Math.round(score / TARGET_SCORE * 100));
  progBarEl.style.width   = pct + '%';
  progLabelEl.textContent = `${score.toLocaleString()} / ${TARGET_SCORE.toLocaleString()}`;
}

/* ============================================================
   19. フラッシュ / コンボ / スコアポップアップ
   ============================================================ */

let flashTimer = null;

/**
 * showFlash(msg)
 * 画面上部にメッセージを一時表示する
 */
function showFlash(msg) {
  flashEl.textContent = msg;
  flashEl.classList.remove('is-hidden');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(hideFlash, 2400);
}

function hideFlash() {
  flashEl.classList.add('is-hidden');
  flashEl.textContent = '';
}

/**
 * showCombo(n)
 * コンボ数を表示する
 */
function showCombo(n) {
  comboEl.textContent = `🔥 ${n}連鎖！`;
  comboEl.classList.remove('is-hidden');
  // アニメーションリセット
  comboEl.style.animation = 'none';
  void comboEl.offsetWidth;
  comboEl.style.animation = '';
}

function hideCombo() {
  comboEl.classList.add('is-hidden');
  comboEl.textContent = '';
}

/**
 * showScoreMessage(gained, combo)
 * スコアとコンボに応じたメッセージをフラッシュ表示する
 */
function showScoreMessage(gained, combo) {
  if      (combo >= 4)    showFlash(`🌟 ${combo}連鎖！ +${gained}`);
  else if (combo >= 3)    showFlash(`✨ ${combo}連鎖！ +${gained}`);
  else if (combo >= 2)    showFlash(`🔥 ${combo}連鎖！ +${gained}`);
  else if (gained >= 500) showFlash(`💥 ビッグマッチ！ +${gained}`);
  else if (gained >= 200) showFlash(`⭐ ナイス！ +${gained}`);
  else                    showFlash(`+${gained}`);
}

/**
 * showScorePop(gained, matched)
 * スコア加算時に盤面上にポップアップを表示する
 */
function showScorePop(gained, matched) {
  if (!matched.size) return;

  const keys  = [...matched];
  const [r, c] = parseKey(keys[Math.floor(keys.length / 2)]);

  const rect  = boardEl.getBoundingClientRect();
  const cellW = rect.width  / COLS;
  const cellH = rect.height / ROWS;

  const pop = document.createElement('div');
  pop.className = 'score-pop';
  pop.textContent = `+${gained}`;
  pop.style.left = (c * cellW + cellW  / 2 - 24) + 'px';
  pop.style.top  = (r * cellH + cellH  / 2 - 12) + 'px';

  boardEl.appendChild(pop);
  pop.addEventListener('animationend', () => pop.remove(), { once: true });
}

/* ============================================================
   20. バウンスバック（無効スワップ）
   ============================================================ */

/**
 * triggerBounce(el)
 * タイルにバウンスアニメーションを付ける
 */
function triggerBounce(el) {
  if (!el) return;
  el.classList.remove('anim-bounce');
  void el.offsetWidth; // reflow
  el.classList.add('anim-bounce');
  el.addEventListener(
    'animationend',
    () => el.classList.remove('anim-bounce'),
    { once: true }
  );
}

/* ============================================================
   21. クリア判定・モーダル
   ============================================================ */

/**
 * checkWin()
 * 目標スコア達成チェック
 */
function checkWin() {
  if (score >= TARGET_SCORE) {
    setTimeout(showClearModal, 280);
  }
}

/**
 * showClearModal()
 * クリアモーダルを表示する
 */
function showClearModal() {
  modalScoreEl.textContent = score.toLocaleString();
  overlayEl.classList.remove('is-hidden');
}

function hideModal() {
  overlayEl.classList.add('is-hidden');
}

/* ============================================================
   22. ユーティリティ
   ============================================================ */

/** wait(ms) — Promise ラップの setTimeout */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** parseKey("r,c") → [r, c] */
const parseKey = (key) => key.split(',').map(Number);

/** isNormalType(type) — 通常ピース番号かどうか */
function isNormalType(type) {
  return typeof type === 'number';
}

/** isAdjacent(r1,c1,r2,c2) — 上下左右に隣接しているか */
function isAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

/** isInBounds(r,c) — 盤面内かどうか */
function isInBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

/* ============================================================
   23. ボタンイベント
   ============================================================ */

document.getElementById('js-btn-restart').addEventListener('click', () => {
  if (busy) return;
  initGame();
});

document.getElementById('js-btn-again').addEventListener('click', () => {
  initGame();
});

document.getElementById('js-btn-stages').addEventListener('click', () => {
  // 将来的に47都道府県ステージ選択へ遷移
  alert('ステージ一覧は準備中です！\n現在は北海道ステージのみプレイ可能です。');
});

/* ============================================================
   24. 起動
   ============================================================ */
initGame();
