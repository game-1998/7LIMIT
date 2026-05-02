import { update, ref, set, get }
  from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { signInAnonymously }
  from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import { showScreen } from "./ui.js";
import { applyCardToTarget, createRoom, joinRoom, setupPlayerList, watchGameState } from "./firebase.js";
import { shuffle, startGame } from "./initGame.js";
import { renderCard, showCenterCard } from "./cardUI.js";
import { labelFromType } from "./gameUI.js";

// 匿名ログイン
signInAnonymously(firebaseAuth)
  .then(() => console.log("Firebase 匿名ログイン成功"))
  .catch((error) => console.error("Firebase ログインエラー", error));

window.pendingRoomId = null;
let selectedMode = null;

// --------------------------------------
// ルーム作成 / 参加
// --------------------------------------
document.getElementById("createRoomButton").onclick = () => {
  selectedMode = "create";
  showScreen("nameAndPasswordScreen");
};

document.getElementById("joinRoomButton").onclick = () => {
  selectedMode = "join";
  showScreen("nameAndPasswordScreen");
};

confirmButton.onclick = () => {
  const name = playerNameInput.value.trim();
  const pass = roomPasswordInput.value.trim();

  if (!name || !pass) {
    alert("名前とパスワードを入力してください");
    return;
  }

  if (selectedMode === "create") {
    createRoom(name, pass);
  } else {
    joinRoom(name, pass);
  }
};

// --------------------------------------
// ゲーム開始（ホストのみ）
// --------------------------------------
document.getElementById("startGameButton").onclick = async () => {
  const roomId = pendingRoomId;
  if (!roomId) return;

  // プレイヤー一覧を取得
  const playersSnap = await get(ref(window.firebaseDB, `rooms/${roomId}/players`));
  const playersObj = playersSnap.val();
  const players = Object.entries(playersObj).map(([uid, data]) => ({
    uid,
    name: data.name
  }));

  // ここでシャッフル
  const shuffled = shuffle(players);
  await set(ref(window.firebaseDB, `rooms/${roomId}/turnOrder`), shuffled);
  await startGame(roomId, players);
};

// --------------------------------------
// 順番表示 → ゲーム画面
// --------------------------------------
document.getElementById("orderOkButton").onclick = () => {
  showScreen("gameScreen");
  // ★ DOM が描画されるまで 1 フレーム待つ
  requestAnimationFrame(() => {
    watchGameState(pendingRoomId);
  });
};

document.getElementById("closeTargetPanel").onclick = () => {
  document.getElementById("targetPanel").classList.add("hidden");
};

// --------------------------------------
// カード効果対象確定
// --------------------------------------
document.getElementById("confirmTarget").onclick = () => {
  console.log("DEBUG gaugeIdx:", window.selectedGaugeIndex);

  const checked = [...document.querySelectorAll("#targetList input:checked")]
    .map(input => input.value);

  if (checked.length === 0) {
    alert("ターゲットを選択してください");
    return;
  }

  console.log("選択されたターゲット:", checked);

  const myId = window.firebaseAuth.currentUser.uid;
  const roomId = window.pendingRoomId;
  const targetUid = window.selectedTargetUid;
  const gaugeIdx = window.selectedGaugeIndex;

  if (gaugeIdx == null) {
    alert("ゲージを選択してください");
    return;
  }

  // カード使用イベントを Firebase に書き込む
  const gameStateRef = ref(firebaseDB, `rooms/${roomId}/gameState`);
  update(gameStateRef, {
    cardEvent: {
      uid: myId,
      cardIndex: window.selectedCardIndex,
      targetUid,
      gaugeIdx,
      timestamp: Date.now()
    }
  });

  document.getElementById("targetPanel").classList.add("hidden");

  const card = window.gameState.players[myId].hand[window.selectedCardIndex];
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

  showCenterCard(html, () => {
    applyCardToTarget(roomId, selectedCardIndex, targetUid, gaugeIdx);
    window.selectedGaugeIndex = null;
  });
};
