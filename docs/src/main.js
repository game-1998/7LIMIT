import { update, ref, set, get }
  from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import { showScreen } from "./ui.js";
import { applyCardToTarget, createRoom, joinRoom, setupPlayerList, watchGameState } from "./firebase.js";
import { shuffle, startGame } from "./initGame.js";
import { renderCard, showCenterCard, showTargetSelectPanelDouble, showTargetSelectPanelSingle } from "./cardUI.js";
import { labelFromType, renderSelectedSummary } from "./gameUI.js";

window.myUid = null;
window.isPlayingCard = false;
window.selectedTargets = [];

onAuthStateChanged(firebaseAuth, (user) => {
  if (user) {
    window.myUid = user.uid;
  }
});

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
  await set(ref(window.firebaseDB, `rooms/${roomId}/linkCounter`), 0);
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
  isPlayingCard = false;
  window.selectedTargets = []; //ターゲット配列をリセット
  window.selectedTargetUid = null;
  renderSelectedSummary();
};

// --------------------------------------
// カード効果対象追加（最後の1人以外）
// --------------------------------------
document.getElementById("nextTarget").onclick = () => {
  if (window.selectedTargetUid === null) {
    alert("ターゲットを選択してください");
    return;
  }

  const uid = window.selectedTargetUid;
  const gaugeIndex = window.selectedGaugeIndex;

  if (gaugeIndex == null) {
    alert("ゲージを選択してください");
    return;
  }

  window.isPlayingCard = true;

  // ターゲットをpush
  window.selectedTargets.push({
    uid,
    gaugeIndex: gaugeIndex
  });
  renderSelectedSummary();

  // 次の選択のために UI 状態をリセット
  window.selectedTargetUid = null;
  window.selectedGaugeIndex = null;

  // UI 更新
  switch (window.mode) {
    case "single":
    showTargetSelectPanelSingle();
    break;

    case "multi":
    showTargetSelectPanelMulti();
    break;

    case "double":
    showTargetSelectPanelSingle();
    break;

    case "direction":
    showTargetSelectPanelSingle();
    break;

    default:
    console.warn("未知の targetMode:", mode);
    break;
  }
};

// --------------------------------------
// カード効果対象確定（shuffle以外）
// --------------------------------------
document.getElementById("confirmTarget").onclick = () => {
  const checked = [...document.querySelectorAll("#targetList input:checked")]
    .map(input => input.value);

  if (checked.length === 0) {
    alert("ターゲットを選択してください");
    return;
  }

  const myId = window.firebaseAuth.currentUser.uid;
  const roomId = window.pendingRoomId;
  const targetUid = window.selectedTargetUid;
  const gaugeIdx = window.selectedGaugeIndex;

  if (gaugeIdx == null) {
    alert("ゲージを選択してください");
    return;
  }

  window.isPlayingCard = true;
  window.selectedTargets.push({
    uid: window.selectedTargetUid,
    gaugeIndex: window.selectedGaugeIndex
  });

  const targets = window.selectedTargets;
  window.selectedTargets = []; //ターゲット配列をリセット
  window.selectedTargetUid = null;
  renderSelectedSummary();

  // カード使用イベントを Firebase に書き込む
  const gameStateRef = ref(firebaseDB, `rooms/${roomId}/gameState/cardEvent`);
  update(gameStateRef, {
    uid: myId,
    cardIndex: window.selectedCardIndex,
    targets,
    timestamp: Date.now()
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
    applyCardToTarget(roomId, selectedCardIndex, targets);
    window.selectedGaugeIndex = null;
  });
};

// --------------------------------------
// カード効果対象確定（shuffle）
// --------------------------------------
document.getElementById("confirmTargets").onclick = () => {
  const checked = [...document.querySelectorAll("#targetList input:checked")]
    .map(input => input.value);

  if (checked.length === 0) {
    alert("ターゲットを選択してください");
    return;
  }

  const myId = window.firebaseAuth.currentUser.uid;
  const roomId = window.pendingRoomId;

  window.isPlayingCard = true;

  // ★ シャッフル対象プレイヤー
  const targets = checked.map(uid => ({ uid }));

  // ★ リセット
  window.selectedTargets = [];
  window.selectedTargetUid = null;
  renderSelectedSummary();

  // ★ Firebase に書き込み
  const gameStateRef = ref(firebaseDB, `rooms/${roomId}/gameState/cardEvent`);
  update(gameStateRef, {
    uid: myId,
    cardIndex: window.selectedCardIndex,
    targets,
    timestamp: Date.now()
  });

  // ★ パネルを閉じる
  document.getElementById("targetPanel").classList.add("hidden");

  // ★ 中央カード演出（プレイヤー名一覧）
  const card = window.gameState.players[myId].hand[window.selectedCardIndex];
  const cardHtml = renderCard(card);

  const names = checked
    .map(uid => window.gameState.players[uid].name)
    .join("、");

  const html = `
    <div class="center-card-wrapper">
      <div class="center-target">
        対象プレイヤー：<br>
        <span class="second-line">${names}</span>
      </div>
      ${cardHtml}
    </div>
  `;

  showCenterCard(html, () => {
    applyCardToTarget(roomId, selectedCardIndex, targets);
  });
};

document.getElementById("returnButton").onclick = () => {
  set(ref(firebaseDB, `rooms/${pendingRoomId}/gameState/phase`), "title");
};

document.getElementById("announceButton").onclick = () => {
  const roomId = window.pendingRoomId;

  // 抽選者だけが押せる前提
  set(ref(firebaseDB, `rooms/${roomId}/gameState/phase`), "roulette");

  const overlay = document.getElementById("announceOverlay");
  overlay.style.display = "none";
};

document.getElementById("openCardList").addEventListener("click", () => {
  document.getElementById("cardListModal").style.display = "block";
});

document.getElementById("closeCardList").addEventListener("click", () => {
  document.getElementById("cardListModal").style.display = "none";
});
