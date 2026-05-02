export function updateTurnInfo(state) {
  const div = document.getElementById("turnInfo");

  if (!state.turnOrder || !Array.isArray(state.turnOrder)) {
    div.innerHTML = "";
    return;
  }
  if (!state.players || Object.keys(state.players).length === 0) {
    div.innerHTML = "";
    return;
  }

  const myId = window.firebaseAuth.currentUser.uid;
  const order = state.turnOrder;
  const players = state.players;
  const currentTurn = state.turn;

  let html = "";

  order.forEach((uid, index) => {
    const p = players[uid];
    if (!p) return;

    const isCurrent = uid === currentTurn;
    const isMe = uid === myId;

    html += `
      <span class="turn-badge ${isCurrent ? "active" : ""} ${isMe ? "me" : ""}">
        ${p.name}
      </span>
    `;

    if (index < order.length - 1) {
      html += `<span class="turn-arrow">→</span>`;
    }
  });

  div.innerHTML = html;

  // 手札の光り
  const cards = document.querySelectorAll("#handArea .card");
  cards.forEach(card => {
    if (currentTurn === myId) {
      card.classList.add("card-glow");
    } else {
      card.classList.remove("card-glow");
    }
  });
}

export function renderPlayers(state) {
  const area = document.getElementById("playerArea");

  // playerArea が空なら初期化フラグをリセット
  if (!area.firstChild) {
    delete area.dataset.initialized;
  }

  // 初回だけ DOM を作る（この時点では全員 value=0 のはず）
  if (!area.dataset.initialized) {
    area.innerHTML = "";

    const playersArray = Object.entries(state.players || {});
    playersArray.forEach(([uid, p]) => {
      const block = document.createElement("div");
      block.className = "player-block";

      const gaugesHtml = p.gauges.map((g, idx) => {
        return `
          <div class="gauge-line" data-uid="${uid}" data-gidx="${idx}">
            <div class="gauge-label gauge-label-${g.type}">
              ${labelFromType(g.type)}
            </div>

            <div class="gauge-wrapper">
              <div class="gauge-scale">
                <span>0</span><span>1</span><span>2</span><span>3</span>
                <span>4</span><span>5</span><span>6</span><span>7</span>
              </div>

              <div class="gauge-block">
                <div class="gauge-grid">
                  <div></div><div></div><div></div><div></div>
                  <div></div><div></div><div></div>
                </div>

                <!-- 初回は width=0% で固定 -->
                <div class="gauge-bar gauge-${g.type}" style="width:0%"></div>
              </div>
            </div>
          </div>
        `;
      }).join("");

      block.innerHTML = `
        <div class="player-name">${p.name}</div>
        <div class="gauge-column">${gaugesHtml}</div>
      `;

      area.appendChild(block);
    });

    area.dataset.initialized = "true";
  }

  // 2回目以降：差分アニメーションが動く
  Object.entries(state.players).forEach(([uid, p]) => {
    p.gauges.forEach((g, idx) => {
      const percent = (g.value / 7) * 100;

      const line = area.querySelector(
        `.gauge-line[data-uid="${uid}"][data-gidx="${idx}"]`
      );
      if (!line) {
        console.warn("line が見つからない:", uid, idx);
        return;
      }

      const bar = line.querySelector(".gauge-bar");

      // ここで差分アニメーションが動く
      bar.style.width = percent + "%";

      // ロック状態
      if (g.locked) line.classList.add("locked");
      else line.classList.remove("locked");
    });
  });
}

export function labelFromType(type) {
  if (type === "hanki") return "半揮";
  if (type === "mansui") return "満水";
  if (type === "cap") return "キャップ";
  return "";
}
