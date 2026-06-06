import { update, ref, set, get, runTransaction }
  from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { shuffle } from "./initGame.js";

// --------------------------------------
// カードを1枚引く
// --------------------------------------
export function drawCard(state, uid) {
  if (!state.deck || state.deck.length === 0) return state;

  const newState = structuredClone(state);  // 深いコピー

  const card = newState.deck.shift();
  newState.players[uid].hand.push(card);

  // 山札の残り枚数を更新
  newState.deckCount = newState.deck.length;

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
export async function applyCardEffect(state, uid, card, targets) {
  const newState = structuredClone(state); // state をコピー
  const GAUGE_MAX = 7;
  let isMax = false;

  switch (card.type) {
    case "double": { // ダブル
      const t = targets[0];
      const g = newState.players[t.uid].gauges[t.gaugeIndex];

      g.effect = "double";   // 永続効果を付与

      if (g.link) {
        const link = g.link;
        const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
        g2.effect = "double";
      }

      return { state: newState, isMax, target: t, gaugeType: g.type };
    }

    case "half": { // ハーフ
      const t = targets[0];
      const g = newState.players[t.uid].gauges[t.gaugeIndex];

      g.effect = "half";   // 永続効果を付与

      if (g.link) {
        const link = g.link;
        const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
        g2.effect = "half";
      }

      return { state: newState, isMax, target: t, gaugeType: g.type };
    }

    case "signFlip": { // 符号反転
      const t = targets[0];
      const g = newState.players[t.uid].gauges[t.gaugeIndex];

      g.effect = "signFlip";   // 永続効果を付与

      if (g.link) {
        const link = g.link;
        const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
        g2.effect = "signFlip";
      }

      return { state: newState, isMax, target: t, gaugeType: g.type };
    }

    case "share": { // 共有（リンクの付け方は未実装）
      const [t1, t2] = targets;

      const g1 = newState.players[t1.uid].gauges[t1.gaugeIndex];
      const g2 = newState.players[t2.uid].gauges[t2.gaugeIndex];

      // 初期値を平均にする
      const avg = (g1.value + g2.value) / 2;
      g1.value = avg;
      g2.value = avg;

      // 永続効果が両方にある場合はランダムで片方だけ残す
      if (g1.effect && g2.effect) {
        if (Math.random() < 0.5) {
          g2.effect = null;
        } else {
          g1.effect = null;
        }
      }

      // 片方だけ永続効果がある場合 → もう片方にコピー
      if (g1.effect && !g2.effect) g2.effect = g1.effect;
      if (!g1.effect && g2.effect) g1.effect = g2.effect;

      // 古いリンク情報を消す
      if (g1.link) {
        const old = g1.link;
        const oldGauge = newState.players[old.uid].gauges[old.gaugeIndex];
        oldGauge.link = null;
      }
      if (g2.link) {
        const old = g2.link;
        const oldGauge = newState.players[old.uid].gauges[old.gaugeIndex];
        oldGauge.link = null;
      }

      const roomRef = ref(window.firebaseDB, `rooms/${pendingRoomId}/linkCounter`);

      // linkCounter を安全に +1
      await runTransaction(roomRef, current => {
        if (typeof current !== "number") return 1;
        return current + 1;
      });

      // 最新の番号を取得
      const snap = await get(roomRef);
      const linkNumber = snap.val();

      // リンクを張る（相互リンク）
      g1.link = { uid: t2.uid, gaugeIndex: t2.gaugeIndex, number: linkNumber };
      g2.link = { uid: t1.uid, gaugeIndex: t1.gaugeIndex, number: linkNumber };

      return { state: newState, isMax, target: t1, gaugeType: null };
    }

    case "cancel": { // 解除
      const t = targets[0];
      const g = newState.players[t.uid].gauges[t.gaugeIndex];

      g.effect = null;   // 永続効果を解除

      if (g.link) {
        const link = g.link;
        const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
        g2.effect = null;
      }

      return { state: newState, isMax, target: t, gaugeType: g.type };
    }

    case "delta": {// ゲージ増減
      const t = targets[0];
      const g = newState.players[t.uid].gauges[t.gaugeIndex];

      if (g.effect === "double") {
        g.value = g.value + card.value * 2;
      }
      else if (g.effect === "half") {
        g.value = g.value + card.value / 2;
      }
      else if (g.effect === "signFlip") {
        g.value -= card.value;
      }
      else if (!g.effect) {
        g.value += card.value;
      }

      if (g.value < 0) g.value = 0;

      // リンク先にも同じ値を反映
      if (g.link) {
        const link = g.link;
        const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
        g2.value = g.value;
      }

      // MAX 判定 → ロック
      if (g.value >= GAUGE_MAX) {
        g.value = GAUGE_MAX;
        g.locked = true;
        isMax = true;

        // リンク先もロック
        if (g.link) {
          const link = g.link;
          const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
          g2.value = GAUGE_MAX;
          g2.locked = true;
        }
      }

      return { state: newState, isMax, target: t, gaugeType: g.type };
    }

    case "typeSwap": { // タイプ交換
      const t1 = targets[0];
      const t2 = targets[1];

      const p1 = newState.players[t1.uid];
      const p2 = newState.players[t2.uid];

      const g1 = p1.gauges[t1.gaugeIndex];
      const g2 = p2.gauges[t2.gaugeIndex];

      // タイプを入れ替える
      const tmp = g1.type;
      g1.type = g2.type;
      g2.type = tmp;

      return { state: newState, isMax, target: t1, gaugeType: null };
    }

    case "reset": { // リセット
      const t = targets[0];
      const g = newState.players[t.uid].gauges[t.gaugeIndex];
      g.value = 0;

      if (g.link) {
        const link = g.link;
        const g2 = newState.players[link.uid].gauges[link.gaugeIndex];
        g2.value = 0;
      }

      return { state: newState, isMax, target: t, gaugeType: g.type };
    }

    case "valueSwap": { // ゲージ値交換
      const t1 = targets[0];
      const t2 = targets[1];

      const p1 = newState.players[t1.uid];
      const p2 = newState.players[t2.uid];

      const g1 = p1.gauges[t1.gaugeIndex];
      const g2 = p2.gauges[t2.gaugeIndex];

      // 値だけ交換
      const tempValue = g1.value;
      g1.value = g2.value;
      g2.value = tempValue;

      // リンクしている場合はリンク先にも反映
      if (g1.link) {
        const link = g1.link;
        const g1Linked = newState.players[link.uid].gauges[link.gaugeIndex];
        g1Linked.value = g1.value;
      }

      if (g2.link) {
        const link = g2.link;
        const g2Linked = newState.players[link.uid].gauges[link.gaugeIndex];
        g2Linked.value = g2.value;
      }

      return { state: newState, isMax: false, target: t1, gaugeType: null };
    }

    case "gaugeSwap": { // ゲージ交換
      const t1 = targets[0];
      const t2 = targets[1];

      const p1 = newState.players[t1.uid];
      const p2 = newState.players[t2.uid];

      const g1 = p1.gauges[t1.gaugeIndex];
      const g2 = p2.gauges[t2.gaugeIndex];

      // 丸ごと交換
      const temp = structuredClone(g1);
      p1.gauges[t1.gaugeIndex] = structuredClone(g2);
      p2.gauges[t2.gaugeIndex] = temp;

      // リンク整合性の修正
      if (g1.link) {
        const old = g1.link;
        const linkedGauge = newState.players[old.uid].gauges[old.gaugeIndex];

        // 相手側のリンク先を「新しい g1 の位置（t2）」に更新
        linkedGauge.link = { uid: t2.uid, gaugeIndex: t2.gaugeIndex, number: old.number };
      }

      if (g2.link) {
        const old = g2.link;
        const linkedGauge = newState.players[old.uid].gauges[old.gaugeIndex];

        // 相手側のリンク先を「新しい g2 の位置（t1）」に更新
        linkedGauge.link = { uid: t1.uid, gaugeIndex: t1.gaugeIndex, number: old.number };
      }
      return { state: newState, isMax, target: t1, gaugeType: null };
    }
    
    case "copy": { // コピー
      const from = targets[0]; // コピー元（自分）
      const to   = targets[1]; // コピー先（他プレイヤー）

      const pFrom = newState.players[from.uid];
      const pTo   = newState.players[to.uid];

      const gFrom = pFrom.gauges[from.gaugeIndex];
      const gTo   = pTo.gauges[to.gaugeIndex];

      // 値をコピー（from → to）
      gTo.value = gFrom.value;

      // コピー先がリンクしていたら、リンク相手にも反映
      if (gTo.link) {
        const link = gTo.link;
        const linkedGauge = newState.players[link.uid].gauges[link.gaugeIndex];
        linkedGauge.value = gTo.value;
      }

      return { state: newState, isMax, target: to, gaugeType: null };
    }

    case "transfer": { // 譲渡
      const from = targets[0]; // 自分
      const to   = targets[1]; // 相手

      const pFrom = newState.players[from.uid];
      const pTo   = newState.players[to.uid];

      const gFrom = pFrom.gauges[from.gaugeIndex];
      const gTo   = pTo.gauges[to.gaugeIndex];

      // 譲渡量
      const amount = gFrom.value;

      // 自分のゲージを 0 にする
      gFrom.value = 0;

      // 自分がリンクしていたら相手側も 0 にする
      if (gFrom.link) {
        const link = gFrom.link;
        const linkedGauge = newState.players[link.uid].gauges[link.gaugeIndex];
        linkedGauge.value = 0;
      }

      // 相手に加算
      gTo.value += amount;

      // 相手がリンクしていたらリンク相手にも反映
      if (gTo.link) {
        const link = gTo.link;
        const linkedGauge = newState.players[link.uid].gauges[link.gaugeIndex];
        linkedGauge.value = gTo.value;
      }

      // MAX 判定
      const GAUGE_MAX = 7;

      if (gTo.value >= GAUGE_MAX) {
        gTo.value = GAUGE_MAX;
        gTo.locked = true;
        isMax = true;

        // リンク先もロック
        if (gTo.link) {
          const link = gTo.link;
          const linkedGauge = newState.players[link.uid].gauges[link.gaugeIndex];
          linkedGauge.value = GAUGE_MAX;
          linkedGauge.locked = true;
        }
      }

      return { state: newState, isMax, target: to, gaugeType: gTo.type };
    }

    case "shuffle": { // シャッフル
      // 選択プレイヤーのゲージを全部集める
      let pool = [];
      let linkPairs = [];
      for (const t of targets) {
        const p = newState.players[t.uid];
        p.gauges.forEach((g, i) => {
          if (g.link) {
            linkPairs.push({
              g1: g, // ゲージオブジェクトそのもの
              g2: newState.players[g.link.uid].gauges[g.link.gaugeIndex],
              link1: structuredClone(g.link), // 元のリンク情報を保存
              link2: structuredClone(
                newState.players[g.link.uid].gauges[g.link.gaugeIndex].link
              )
            });
          }
        });
        pool.push(...p.gauges);
      }

      // 古いリンクを全部消す
      for (const t of targets) {
        const p = newState.players[t.uid];
        for (const g of p.gauges) {
          g.link = null;
        }
      }

      // シャッフル
      shuffle(pool);

      // 配り直す
      let index = 0;
      let newPositions = new Map();
      for (const t of targets) {
        const p = newState.players[t.uid];
        for (let i = 0; i < p.gauges.length; i++) {
          p.gauges[i] = pool[index++];
          newPositions.set(p.gauges[i], { uid: t.uid, gaugeIndex: i });
        }
      }

      for (const pair of linkPairs) {
        const new1 = newPositions.get(pair.g1);
        const new2 = newPositions.get(pair.g2);

        if (!new1 || !new2) continue; // 念のため

        // g1 → g2 のリンク
        const newLink1 = structuredClone(pair.link1);
        newLink1.uid = new2.uid;
        newLink1.gaugeIndex = new2.gaugeIndex;

        newState.players[new1.uid].gauges[new1.gaugeIndex].link = newLink1;

        // g2 → g1 のリンク
        const newLink2 = structuredClone(pair.link2);
        newLink2.uid = new1.uid;
        newLink2.gaugeIndex = new1.gaugeIndex;

        newState.players[new2.uid].gauges[new2.gaugeIndex].link = newLink2;
      }

      return { state: newState, isMax, target: targets[0], gaugeType: null };
    }
  }
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
