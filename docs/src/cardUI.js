import { applyCardToTarget } from "./firebase.js";
import { CARD_TEXT } from "./state.js";

// --------------------------------------
// カード1枚のHTML生成
// --------------------------------------
export function renderCard(card) {
  let displayName;
  let displayDesc;

  if (card.type === "delta") {
    displayName = (card.value > 0 ? "+" : "") + card.value;
    displayDesc = CARD_TEXT.delta(card.value).desc;
  } else {
    const info = CARD_TEXT[card.type];
    displayName = info.name;
    displayDesc = info.desc;
  }

  return `
    <div class="card">
      <div class="card-name">${displayName}</div>
      <div class="card-desc">${displayDesc}</div>
    </div>
  `;
}

// --------------------------------------
// 手札UI更新
// --------------------------------------
export function updateHandUI(hand) {
  const myUid = window.firebaseAuth.currentUser.uid;
  const isMyTurn = window.gameState.turn === myUid;

  const slots = [
    document.getElementById("card0"),
    document.getElementById("card1"),
    document.getElementById("card2")
  ];

  // スロット初期化
  slots.forEach((slot) => {
    slot.innerHTML = "";
    slot.classList.add("empty");
  });

  // 手札をスロットに配置
  hand.forEach((card, index) => {
    if (index >= 3) return;

    slots[index].innerHTML = renderCard(card);
    slots[index].classList.remove("empty");

    const cardDiv = slots[index].querySelector(".card");

    if (cardDiv) {
      cardDiv.onclick = () => {
        if (!isMyTurn) {
          console.log("自分のターンではありません");
          return;
        }

        window.selectedCardIndex = index;

        // まず全カードの選択状態を解除
        document.querySelectorAll("#handArea .card").forEach(c => {
          c.classList.remove("card-selected");
        });

        // このカードだけ選択状態にする
        cardDiv.classList.add("card-selected");

        // ここでモードを参照する
        const mode = card.targetMode;

        switch (mode) {
          case "single":
            showTargetSelectPanelSingle();
            break;

          case "multi":
            showTargetSelectPanelMulti();
            break;

          case "double":
            showTargetSelectPanelDouble();
            break;

          case "direction":
            showTargetSelectPanelDirection();
            break;

          default:
            console.warn("未知の targetMode:", mode);
            break;
        }
      };
    }
  });
}

// --------------------------------------
// ターゲット選択パネル表示
// --------------------------------------
function showTargetSelectPanelSingle() {
  const panel = document.getElementById("targetPanel");
  const list = document.getElementById("targetList");
  const gaugesDiv = document.getElementById("targetGaugeList");
  const players = window.gameState.players;

  list.innerHTML = "";
  gaugesDiv.innerHTML = "";

  // プレイヤー一覧
  Object.entries(players).forEach(([uid, p]) => {
    const item = document.createElement("label");
    item.className = "target-item";

    item.innerHTML = `
      <input type="radio" name="targetSelect" value="${uid}">
      <span>${p.name}</span>
    `;

    const input = item.querySelector("input");

    // チェックされた瞬間にゲージ選択へ
    input.onchange = () => {
      window.selectedTargetUid = uid;
      window.selectedGaugeIndex = null;
      showGaugeSelectSingle();
    };

    list.appendChild(item);
  });

  panel.classList.remove("hidden");
}

// --------------------------------------
// ゲージ選択
// --------------------------------------
function showGaugeSelectSingle() {
  const gaugesDiv = document.getElementById("targetGaugeList");
  gaugesDiv.innerHTML = "";

  const roomId = window.pendingRoomId;
  const targetUid = window.selectedTargetUid;

  const targetPlayer = window.gameState.players[targetUid];
  const gauges = targetPlayer.gauges;

  ["半揮", "満水", "キャップ"].forEach((name, idx) => {
    const g = gauges[idx];
    const value = g.value;

    const item = document.createElement("label");
    item.className = "gauge-item";

    // ロックされている場合は disabled
    const disabledAttr = g.locked ? "disabled" : "";

    item.innerHTML = `
      <input type="radio" name="gaugeSelect" value="${idx}" ${disabledAttr}>
      <span class="gauge-name">${name}</span>
      <span class="gauge-value">（ゲージ値：${value}）</span>
    `;

    const input = item.querySelector("input");

    if (g.locked) {
      item.classList.add("locked");
    } else {
      input.onchange = () => {
        window.selectedGaugeIndex = idx;
      };
    }

    gaugesDiv.appendChild(item);
  });
}

export function showCenterCard(cardHtml, onFinish) {
  const center = document.getElementById("centerCard");
  center.innerHTML = cardHtml;

  center.classList.remove("hidden");
  center.classList.add("show");

  // 2秒後にフェードアウト
  setTimeout(() => {
    center.classList.add("fadeout");

    // フェードアウト完了後に非表示
    setTimeout(() => {
      center.classList.remove("show", "fadeout");
      center.classList.add("hidden");
      center.innerHTML = "";
      
      // 演出が終わったタイミングでコールバック実行
      if (onFinish) onFinish();
    }, 400);
  }, 3000);
}
