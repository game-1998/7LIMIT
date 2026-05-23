// ===== ルーレット設定 =====

import { labelFromType } from "./gameUI.js";
import { shuffle } from "./initGame.js";

// プレイヤー色（あなたの決めたセット）
const playerColors = {
  0: "#E74C3C", // 赤
  1: "#3498DB", // 青
  2: "#08af4e", // 緑
  3: "#FF6EB4", // ピンク
  4: "#9B59B6", // 紫
  5: "#E67E22", // オレンジ
  6: "#F1C40F", // 黄
  7: "#1ABC9C", // ターコイズ
  8: "#A0522D", // ブラウン
  9: "#7F8C8D"  // グレー
};

function resizeCanvas(canvas) {
  const size = window.innerWidth;
  canvas.width = size;
  canvas.height = size;
}

let rouletteRunning = false;

// ===== ルーレット開始 =====
export function startRoulette(entries) {
  rouletteRunning = true;

  const canvas = document.getElementById("rouletteCanvas");
  const ctx = canvas.getContext("2d");

  resizeCanvas(canvas);

  let angle = 0;
  let speed = 0.25;
  let spinning = true;
  let decelerating = false;

  // ===== 結果判定 =====
  function finalizeResult() {
    const N = entries.length;
    const slice = (Math.PI * 2) / N;

    const normalized = (Math.PI * 1.5 - angle) % (Math.PI * 2);
    const index = Math.floor(normalized / slice);

    const winner = entries[(index + N) % N];

    alert(`罰ゲームは ${winner.name} の ${labelFromType(winner.type)}！`);

    document.getElementById("returnButton").style.display = "block";
  }

  // ===== アニメーション =====
  function animate() {
    if (!rouletteRunning) return;

    if (spinning) {
      angle += speed;

      if (decelerating) {
        speed *= 0.99;
        if (speed < 0.001) {
          spinning = false;
          finalizeResult();
          return;
        }
      }
    }

    drawWheel(canvas, entries, angle);
    requestAnimationFrame(animate);
  }
  animate();

  canvas.onclick = null; // 前回の残りを消す

  // ===== タップで減速開始 =====
  canvas.onclick = () => {
    if (!decelerating) decelerating = true;
  };
}

function drawWheel(canvas, entries, angle = 0) {
  const N = entries.length;
  const slice = (Math.PI * 2) / N;
  const center = canvas.width / 2;
  const r = canvas.width / 2 * 0.8;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(angle);

  for (let i = 0; i < N; i++) {
    const e = entries[i];
    const start = i * slice;
    const end = start + slice;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, start, end);
    ctx.closePath();
    ctx.fillStyle = playerColors[e.colorIndex];
    ctx.fill();

    // 境界線を描く
    ctx.strokeStyle = "#000";   // 線の色（黒）
    ctx.lineWidth = 2;          // 線の太さ
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + slice / 2);
    ctx.translate(r * 0.65, 0);
    ctx.rotate(Math.PI / 2);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    const name = e.name;
    const type = labelFromType(e.type);

    // 文字間隔
    const lh = r * 0.11;

    // 名前の開始位置（中央揃え）
    const nameStartY = -((name.length - 1) * lh) / 2;

    // タイプの開始位置（名前より1文字分下）
    const typeStartY = nameStartY + lh;

    // 名前の縦書き（右側）
    ctx.font = `bold ${r * 0.1}px sans-serif`;
    drawVerticalText(ctx, name, 15, nameStartY, lh);

    // タイプの縦書き（左側）
    ctx.font = `${r * 0.1}px sans-serif`;
    drawVerticalText(ctx, type, -15, typeStartY, lh);

    ctx.restore();
  }

  ctx.restore();

  // ▼を描画
  const tipX = center;              // 中心X
  const tipY = center - r;     // 円の外周

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);          // ▼の下の頂点
  ctx.lineTo(tipX - 15, tipY - 30);
  ctx.lineTo(tipX + 15, tipY - 30);
  ctx.closePath();
  ctx.fill();
}

function drawVerticalText(ctx, text, x, y, lineHeight) {
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y + i * lineHeight);
  }
}

// ===== オーバーレイ制御 =====
export function showRouletteOverlay(entries) {
  const overlay = document.getElementById("rouletteOverlay");
  overlay.style.display = "flex";

  // ルーレットはまだ開始しない
  const canvas = document.getElementById("rouletteCanvas");
  resizeCanvas(canvas);

  // 静止ルーレットを描画
  drawWheel(canvas, entries, 0);

  // 既存の onclick を消す（前回の残り防止）
  canvas.onclick = null;

  // タップで開始
  canvas.onclick = () => {
    document.getElementById("rouletteStartText").style.display = "none";
    startRoulette(entries);
  };
}

export function showWaitingOverlay() {
  const overlay = document.getElementById("rouletteOverlay");
  overlay.style.display = "flex";
  overlay.innerHTML = `<div style="color:white; font-size:32px;">抽選中…</div>`;
}

export function hideRouletteOverlay() {
  const overlay = document.getElementById("rouletteOverlay");
  overlay.style.display = "none";
}

export function hideWaitingOverlay() {
  const overlay = document.getElementById("rouletteOverlay");
  overlay.style.display = "none";
}

// ===== entries 生成 =====
export function collectRouletteData(state) {
  const entries = [];
  const countMap = {};
  let colorIndex = 0;

  for (const uid in state.players) {
    const p = state.players[uid];

    for (const g of p.gauges) {
      if (g.locked) {
        entries.push({
          uid,
          name: p.name,
          type: g.type,
          colorIndex
        });
        countMap[uid] = (countMap[uid] || 0) + 1;
      }
    }

    colorIndex++;
  }

  shuffle(entries);
  
  let maxCount = -1;
  let candidates = [];

  for (const uid in countMap) {
    const count = countMap[uid];
    if (count > maxCount) {
      maxCount = count;
      candidates = [uid];
    } else if (count === maxCount) {
      candidates.push(uid);
    }
  }

  const mostMaxUid = candidates[Math.floor(Math.random() * candidates.length)];
  return { entries, mostMaxUid };
}
