// ui.js
// 画面遷移だけを担当する。状態は一切持たない。

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
  target.style.display = (id === "gameScreen") ? "flex" : "block";
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
