import { renderCard } from "./cardUI.js";
import { CARD_TEXT } from "./state.js";

export function showScreen(id) {
  const screens = [
    "titleScreen",
    "nameAndPasswordScreen",
    "roomCreatedScreen",
    "lobbyScreen",
    "orderScreen",
    "gameScreen"
  ];

  screens.forEach(screen => {
    const el = document.getElementById(screen);
    if (el) el.style.display = "none";
  });

  const target = document.getElementById(id);
  if (!target) {
    console.error("showScreen: 存在しない画面ID:", id);
    return;
  }

  // ゲーム画面だけ flex
  if (id === "gameScreen" || id === "titleScreen") {
    target.style.display = "flex";
  } else {
    target.style.display = "block";
  }
}

// --------------------------------------
// 順番表示（turnOrder は UID 配列）
// --------------------------------------
export function showOrderScreen(order) {
  const list = document.getElementById("orderList");

  // order = ["uid1", "uid2", ...]
  // 名前は window.gameState.players から取る
  const players = window.gameState?.players || {};

  list.innerHTML = order
    .map((uid, i) => {
      const name = players[uid]?.name || "(不明)";
      return `<li>${i + 1}番：${name}</li>`;
    })
    .join("");

  showScreen("orderScreen");
}

export function showAnnounceOverlay(name, isAnnouncer) {
  const overlay = document.getElementById("announceOverlay");
  const text = document.getElementById("announceText");
  const btn = document.getElementById("announceButton");

  text.textContent = `${name} が抽選を行います！`;

  if (isAnnouncer) {
    btn.classList.remove("hidden");
  } else {
    btn.classList.add("hidden");
  }

  overlay.style.display = "flex";
}

export function hideAnnounceOverlay() {
  const overlay = document.getElementById("announceOverlay");
  overlay.style.display = "none";
}

export function showTitleScreen() {
  // ルーム情報をクリア
  window.pendingRoomId = null;
  window.gameState = null;

  // タイトル画面を表示
  showScreen("titleScreen")
}

// カード一覧を表示
function renderCardList() {
  const grid = document.getElementById("cardListGrid");
  grid.innerHTML = "";

  // 並び順の定義
  const deltaValues = [-3, -2, -1, 1, 2, 3];
  const persistent = ["double", "half", "signFlip", "share"];
  const single = [
    "cancel", "reset", "typeSwap", "valueSwap",
    "gaugeSwap", "copy", "shuffle", "transfer"
  ];

  // グループタイトルを追加する関数
  const addGroupTitle = (title) => {
    grid.insertAdjacentHTML(
      "beforeend",
      `<div class="card-group-title">${title}</div>`
    );
  };

  // カード追加
  const addCard = (card) => {
    grid.insertAdjacentHTML("beforeend", renderCard(card));
  };

  // delta（6種類）
  addGroupTitle("増減カード");
  deltaValues.forEach(value => addCard({ type: "delta", value }));

  // 永続効果
  addGroupTitle("永続効果");
  persistent.forEach(type => addCard({ type }));

  // 単発効果
  addGroupTitle("単発効果");
  single.forEach(type => addCard({ type }));
}

renderCardList();
