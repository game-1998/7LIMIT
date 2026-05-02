// --------------------------------------
// カードを1枚引く
// --------------------------------------
export function drawCard(state, uid) {
  if (!state.deck || state.deck.length === 0) return state;

  const newState = structuredClone(state);  // ★ 深いコピー

  const card = newState.deck.shift();
  newState.players[uid].hand.push(card);

  return newState;
}


// --------------------------------------
// 手札からカードを取り出す
// --------------------------------------
export function playCardFromHand(state, uid, cardIndex) {
  const newState = structuredClone(state);  // 深いコピー

  const card = newState.players[uid].hand[cardIndex];
  newState.players[uid].hand.splice(cardIndex, 1);

  return { state: newState, card };
}

// --------------------------------------
// カード効果の適用
// --------------------------------------
export function applyCardEffect(state, uid, card, targetUid, targetGaugeIndex) {
  const newState = structuredClone(state); // state をコピー
  const target = newState.players[targetUid];
  const gauge = target.gauges[targetGaugeIndex];
  const GAUGE_MAX = 7;

  // ★ すでにロックされているゲージは変更しない
  if (gauge.locked) {
    return { state: newState, isMax: false, gaugeType: gauge.type };
  }

  // ゲージ更新
  if (card.type === "delta") {
    gauge.value += card.value;
  }

  if (gauge.value < 0) gauge.value = 0;

  // MAX 判定 → ロック
  let isMax = false;
  if (gauge.value >= GAUGE_MAX) {
    gauge.value = GAUGE_MAX;
    gauge.locked = true;   // ← これで以降は触れない
    isMax = true;
  }

  return { state: newState, isMax, gaugeType: gauge.type };
}

// --------------------------------------
// ターン交代（state.turn を使う）
// --------------------------------------
export function nextTurn(state) {
  const order = state.turnOrder;      // ["uid1", "uid2", ...]
  const current = state.turn;         // 現在の UID

  const idx = order.indexOf(current);

  // UID が turnOrder に存在しない → バグ
  if (idx === -1) {
    console.warn("[nextTurn] ERROR: current turn UID が turnOrder に存在しません");
    // とりあえず先頭に戻す
    state.turn = order[0];
    return state;
  }

  const next = order[(idx + 1) % order.length];

  return next;
}

// --------------------------------------
// 1ターンの処理
// --------------------------------------
export function processTurn(state, uid, cardIndex) {
  // 手札からカードを取り出す
  const { state: s1, card } = playCardFromHand(state, uid, cardIndex);
  
  // ターン交代
  const nextUid = nextTurn(s1);
  s1.turn = nextUid;

  // 次のプレイヤーがカードを引く
  const s2 = drawCard(s1, s1.turn);

  return s2;
}
