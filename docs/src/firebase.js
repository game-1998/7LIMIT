// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue, remove } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import { labelFromType, renderPlayers, updateTurnInfo } from "./gameUI.js";
import { hideAnnounceOverlay, showAnnounceOverlay, showScreen, showTitleScreen } from "./ui.js";
import { renderCard, showCenterCard, updateHandUI } from "./cardUI.js";
import { applyCardEffect, processTurn } from "./gameLogic.js";
import { collectRouletteData, hideRouletteOverlay, hideWaitingOverlay, showRouletteOverlay, showWaitingOverlay } from "./roulette.js";

// Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyC4-L9vvo0vDJes6HSKb3tEOY9x4-Bc61A",
  authDomain: "limit-98311.firebaseapp.com",
  databaseURL: "https://limit-98311-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "limit-98311",
  storageBucket: "limit-98311.firebasestorage.app",
  messagingSenderId: "557544841596",
  appId: "1:557544841596:web:fd8586040823f8761fc4f9",
  measurementId: "G-0KW1YYZ4XX"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

window.firebaseDB = db;
window.firebaseAuth = auth;

// ======================================================
// ルーム作成
// ======================================================
export async function createRoom(name, pass) {
  const now = Date.now();
  const expiresAt = now + 24 * 60 * 60 * 1000; // 24時間後
  const userId = window.firebaseAuth.currentUser.uid;
  const roomId = Math.random().toString(36).substring(2, 8);

  // ルーム作成
  await set(ref(firebaseDB, `rooms/${roomId}`), {
    createdAt: now,
    expiresAt: expiresAt,
    state: "waiting",
    password: pass,
    host: userId,
    players: {},
    createdAt: Date.now()
  });

  // ホスト自身を players に登録する
  await set(ref(firebaseDB, `rooms/${roomId}/players/${userId}`), {
    name,
    gauges: [
      { type: "hanki", value: 0, effect: null, link: null },
      { type: "mansui", value: 0, effect: null, link: null },
      { type: "cap",   value: 0, effect: null, link: null }
    ],
    hand: []
  });

  // パスワード → ルームID
  await set(ref(firebaseDB, `passwordIndex/${pass}`), roomId);

  window.tempPlayerName = name;
  window.pendingRoomId = roomId;

  // 参加者一覧をリアルタイム更新（ホスト側）
  setupPlayerList(roomId);

  showScreen("lobbyScreen");
  document.getElementById("lobbyRoomPassword").textContent = pass;

  watchTurnOrder(roomId);

  document.getElementById("startGameButton").style.display = "block";
  cleanupOldRooms();
}

// ======================================================
// ルーム参加
// ======================================================
export async function joinRoom(name, pass) {
  const passRef = ref(firebaseDB, `passwordIndex/${pass}`);
  const passSnap = await get(passRef);

  if (!passSnap.exists()) {
    alert("そのパスワードのルームは存在しません");
    return;
  }

  const roomId = passSnap.val();
  window.pendingRoomId = roomId;

  const userId = window.firebaseAuth.currentUser.uid;
  window.tempPlayerName = name;

  // 自分を players に登録
  await set(ref(firebaseDB, `rooms/${roomId}/players/${userId}`), {
    name,
    gauges: [
      { type: "hanki", value: 0, effect: null, link: null },
      { type: "mansui", value: 0, effect: null, link: null },
      { type: "cap",   value: 0, effect: null, link: null }
    ],
    hand: []
  });

  // 参加者一覧
  setupPlayerList(roomId);

  showScreen("lobbyScreen");
  document.getElementById("lobbyRoomPassword").textContent = pass;

  watchTurnOrder(roomId);

  document.getElementById("startGameButton").style.display = "none";
}

// ======================================================
// Firebase → UI 反映
// ======================================================
export function watchGameState(roomId) {
  const gameStateRef = ref(firebaseDB, `rooms/${roomId}/gameState`);

  onValue(gameStateRef, async (snap) => {
    const state = snap.val();
    if (!state) return;

    await renderPlayers(state);

    window.gameState = state;

    const myId = window.firebaseAuth.currentUser.uid;
    const me = state.players[myId];
    if (me?.hand) updateHandUI(me.hand);

    updateTurnInfo(state);

    // 山札枚数の表示更新
    if (typeof state.deckCount === "number") {
      const el = document.getElementById("deck-count");
      if (el) el.textContent = `山札：${state.deckCount}枚`;
    }

    // ゲージイベント検知
    if (state.gaugeEvent && state.gaugeEvent.timestamp !== window.lastGaugeEventTime) {
      window.lastGaugeEventTime = state.gaugeEvent.timestamp;

      const wait = () => {
        const end = window.lastGaugeAnimationEnd || 0;

        // アニメーションがまだ終わっていない
        if (Date.now() - end < 200) {
          requestAnimationFrame(wait);
          return;
        }

        // ここで初めてアナウンスを出す
        const { uid, gaugeType } = state.gaugeEvent;
        const g = state.players[uid].gauges.find(g => g.type === gaugeType);
        const playerName = state.players[uid].name;

        let message = `${playerName} の 「${labelFromType(gaugeType)}」 がリミットに到達！`;

        // ② リンク先も MAX になっているなら追加
        if (g && g.link) {
          const link = g.link;
          const linkedPlayer = state.players[link.uid];
          const linkedGauge = linkedPlayer.gauges[link.gaugeIndex];

          const linkedName = linkedPlayer.name;
          const linkedType = linkedGauge.type;

          message += `\n${linkedName} の 「${labelFromType(linkedType)}」 がリミットに到達！`;
        }
        showGaugePopup(message);
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(wait);
      });
    }

    // カード使用イベント検知(他プレイヤー用)
    if (state.cardEvent && state.cardEvent.timestamp !== window.lastCardEventTime) {
      window.lastCardEventTime = state.cardEvent.timestamp;

      const { uid, cardIndex, targets } = state.cardEvent;
      const card = state.players[uid].hand[cardIndex];
      const cardHtml = renderCard(card);

      // ここで targetMode に応じた表示を生成
      const targetHtml = buildTargetAnnouncement(state, card, targets);

      const html = `
        <div class="center-card-wrapper">
          ${targetHtml}
          ${cardHtml}
        </div>
      `;

      showCenterCard(html);
    }

    // ゲーム終了アナウンス
    if (state.gameOver && state.phase === "announce") {
      const wait = () => {
        const end = window.lastGaugeAnimationEnd || 0;

        // アニメーションがまだ終わっていない
        if (Date.now() - end < 200) {
          requestAnimationFrame(wait);
          return;
        }
        
        // ポップアップが開いている
        if (window.gaugePopup) {
          requestAnimationFrame(wait);
          return;
        }

        // ゲーム終了アナウンス
        const announcer = state.players[state.mostMaxUid].name;

        // 抽選者だけボタンを表示
        const isAnnouncer = (myUid === state.mostMaxUid);
        showAnnounceOverlay(announcer, isAnnouncer);

        return; // ここで一旦止める
      };
      requestAnimationFrame(() => {
        requestAnimationFrame(wait);
      });
    }

    if (state.phase === "roulette") {
      if (myUid === state.mostMaxUid) {
        showRouletteOverlay(state.rouletteEntries);
      } else {
        showWaitingOverlay();
      }
    }

    if (state.phase === "title") {
      hideRouletteOverlay();
      hideWaitingOverlay();
      hideAnnounceOverlay();
      showTitleScreen();
      const btn = document.getElementById("returnButton");
      if (btn) {
        btn.style.display = "none";
      }
    }
  });
}

function showGaugePopup(text) {
  window.gaugePopup = true;
  const popup = document.getElementById("gaugePopup");
  const popupText = document.getElementById("gaugePopupText");
  const closeBtn = document.getElementById("gaugePopupClose");

  popupText.textContent = text;
  popup.classList.remove("hidden");

  closeBtn.onclick = () => {
    popup.classList.add("hidden");
    window.gaugePopup = false;
  };
}

export async function applyCardToTarget(roomId, cardIndex, targets) {
  const gameRef = ref(firebaseDB, `rooms/${roomId}/gameState`);
  const snap = await get(gameRef);
  const state = snap.val();
  
  if (!state) return;

  const uid = window.firebaseAuth.currentUser.uid;
  const card = state.players[uid].hand[cardIndex];
  const t0 = targets[0];
  const targetUid = t0.uid;
  const targetGaugeIndex = t0.gaugeIndex;

  // ゲージ更新＋MAX判定
  const result = await applyCardEffect(state, uid, card, targets);
  const updatedState = result.state;

  // Firebase に書き込み
  await set(gameRef, updatedState);

  // MAXイベントを全員に通知
  if (result.isMax) {
    await set(ref(firebaseDB, `rooms/${roomId}/gameState/gaugeEvent`), {
      uid: targetUid,
      gaugeType: result.gaugeType,
      value: updatedState.players[targetUid].gauges[targetGaugeIndex].value,
      timestamp: Date.now()
    });
  }

  const targetGauges = updatedState.players[targetUid].gauges;
  const lockedCount = targetGauges.filter(g => g.locked).length;

  // 山札が0またはゲージが3本ともロックされたらゲーム終了フラグを立てる
  if (updatedState.deckCount === 0 || lockedCount === 3) {
    updatedState.gameOver = true;   // ← 後で UI 側で見る用
    updatedState.phase = "announce";

    const { entries, mostMaxUid } = collectRouletteData(updatedState);

    updatedState.rouletteEntries = entries;
    updatedState.mostMaxUid = mostMaxUid;
  }

  // ターン処理
  const newState = processTurn(updatedState, uid, cardIndex);

  // Firebase に書き込み
  await set(gameRef, newState);
  window.isPlayingCard = false;
}

export function setupPlayerList(roomId) {
  const playersRef = ref(window.firebaseDB, `rooms/${roomId}/players`);
  onValue(playersRef, (snapshot) => {
    const players = snapshot.val() || {};
    const list = document.getElementById("playerList");
    list.innerHTML = "";

    Object.values(players).forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p.name;
      list.appendChild(li);
    });
  });
}

export function watchTurnOrder(roomId) {
  const orderRef = ref(window.firebaseDB, `rooms/${roomId}/turnOrder`);
  onValue(orderRef, (snap) => {
    const order = snap.val();
    if (!order) return;

    // 全員が順番表示画面へ
    showScreen("orderScreen");

    // 表示更新
    const list = document.getElementById("orderList");
    list.innerHTML = order
      .map((p, i) => `${i + 1}番：${p.name}`)
      .join("<br>");
  });
}

async function cleanupOldRooms() {
  const roomsSnap = await get(ref(firebaseDB, "rooms"));
  if (!roomsSnap.exists()) return;

  const rooms = roomsSnap.val();
  const now = Date.now();

  for (const id in rooms) {
    const room = rooms[id];
    if (room.expiresAt && room.expiresAt < now) {
      await remove(ref(firebaseDB, `rooms/${id}`));
    }
  }
}

function buildTargetAnnouncement(state, card, targets) {
  const mode = card.targetMode;

  // single（1人1ゲージ）
  if (mode === "single") {
    const t = targets[0];
    const p = state.players[t.uid];
    return `
      <div class="center-target">
        ターゲット：<br>
        <span class="second-line">
          ${p.name} の 「${labelFromType(p.gauges[t.gaugeIndex].type)}」 ゲージ
        </span>
      </div>
    `;
  }

  // double（2人のゲージを交換）
  if (mode === "double") {
    const t1 = targets[0];
    const t2 = targets[1];
    const p1 = state.players[t1.uid];
    const p2 = state.players[t2.uid];

    return `
      <div class="center-target">
        ターゲット：<br>
        <span class="second-line">
          ${p1.name} の 「${labelFromType(p1.gauges[t1.gaugeIndex].type)}」 ゲージ<br>
          ${p2.name} の 「${labelFromType(p2.gauges[t2.gaugeIndex].type)}」 ゲージ
        </span>
      </div>
    `;
  }

  // direction（自分 → 相手）
  if (mode === "direction") {
    const from = targets[0];
    const to = targets[1];
    const pFrom = state.players[from.uid];
    const pTo = state.players[to.uid];

    return `
      <div class="center-target">
        ターゲット：<br>
        <span class="second-line">
          ${p1.name} の 「${labelFromType(p1.gauges[t1.gaugeIndex].type)}」 ゲージ<br>
          ↓<br>
          ${p2.name} の 「${labelFromType(p2.gauges[t2.gaugeIndex].type)}」 ゲージ
        </span>
      </div>
    `;
  }

  // multi（複数プレイヤー）
  if (mode === "multi") {
    const list = targets
      .map(t => {
        const p = state.players[t.uid];
        return `${p.name}`;
      })
      .join("、");

    return `
      <div class="center-target">
        ターゲット：<br>
        <span class="second-line">${list}</span>
      </div>
    `;
  }

  return "";
}
