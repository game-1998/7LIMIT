// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, set, get, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import { labelFromType, renderPlayers, updateTurnInfo } from "./gameUI.js";
import { showScreen } from "./ui.js";
import { renderCard, showCenterCard, updateHandUI } from "./cardUI.js";
import { applyCardEffect, processTurn } from "./gameLogic.js";

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
  await set(ref(db, `rooms/${roomId}`), {
    createdAt: now,
    expiresAt: expiresAt,
    state: "waiting",
    password: pass,
    host: userId,
    players: {},
    createdAt: Date.now()
  });

  // ホスト自身を players に登録する
  await set(ref(db, `rooms/${roomId}/players/${userId}`), {
    name,
    gauges: [
      { type: "hanki", value: 0, effect: null, link: null },
      { type: "mansui", value: 0, effect: null, link: null },
      { type: "cap",   value: 0, effect: null, link: null }
    ],
    hand: []
  });

  // パスワード → ルームID
  await set(ref(db, `passwordIndex/${pass}`), roomId);

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
  const passRef = ref(db, `passwordIndex/${pass}`);
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
  await set(ref(db, `rooms/${roomId}/players/${userId}`), {
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
  const gameStateRef = ref(db, `rooms/${roomId}/gameState`);

  onValue(gameStateRef, (snap) => {
    const state = snap.val();
    if (!state) return;

    window.gameState = state;

    const myId = window.firebaseAuth.currentUser.uid;

    renderPlayers(state);

    const me = state.players[myId];
    if (me?.hand) updateHandUI(me.hand);

    updateTurnInfo(state);

    // ゲージイベント検知
    if (state.gaugeEvent && state.gaugeEvent.timestamp !== window.lastGaugeEventTime) {
      window.lastGaugeEventTime = state.gaugeEvent.timestamp;

      const { uid, gaugeType, value } = state.gaugeEvent;
      const playerName = state.players[uid].name;

      showGaugePopup(`${playerName} の 「${labelFromType(gaugeType)}」 がリミットに到達！`);
    }

    // カード使用イベント検知
    if (state.cardEvent && state.cardEvent.timestamp !== window.lastCardEventTime) {
      window.lastCardEventTime = state.cardEvent.timestamp;

      const { uid, cardIndex, targetUid, gaugeIdx } = state.cardEvent;

      const card = state.players[uid].hand[cardIndex];
      const cardHtml = renderCard(card);
      const targetPlayer = gameState.players[targetUid];

      // ターゲット名を取得
      const targetName = targetPlayer?.name ?? "不明";

      // カードHTML + ターゲット表示を合成
      const html = `
        <div class="center-card-wrapper">
          <div class="center-target">
            ターゲット：<br>
            <span class="second-line">
              ${targetName} の 「${labelFromType(targetPlayer.gauges[gaugeIdx].type)}」 ゲージ
            </span>
          </div>
          ${cardHtml}
        </div>
      `;

      showCenterCard(html);
    }
  });
}

function showGaugePopup(text) {
  const popup = document.getElementById("gaugePopup");
  const popupText = document.getElementById("gaugePopupText");
  const closeBtn = document.getElementById("gaugePopupClose");

  popupText.textContent = text;
  popup.classList.remove("hidden");

  closeBtn.onclick = () => {
    popup.classList.add("hidden");
  };
}

export async function applyCardToTarget(roomId, cardIndex, targetUid, targetGaugeIndex) {
  const gameRef = ref(db, `rooms/${roomId}/gameState`);
  const snap = await get(gameRef);
  const state = snap.val();

  if (!state) return;

  const uid = window.firebaseAuth.currentUser.uid;
  const card = state.players[uid].hand[cardIndex];

  // ゲージ更新＋MAX判定
  const result = applyCardEffect(state, uid, card, targetUid, targetGaugeIndex);
  const updatedState = result.state;

  // MAXイベントを全員に通知
  if (result.isMax) {
    await set(ref(db, `rooms/${roomId}/gameState/gaugeEvent`), {
      uid: targetUid,
      gaugeType: result.gaugeType,
      value: updatedState.players[targetUid].gauges[targetGaugeIndex].value,
      timestamp: Date.now()
    });
  }

  // ターン処理
  const newState = processTurn(updatedState, uid, cardIndex);

  // Firebase に書き込み
  await set(gameRef, newState);
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