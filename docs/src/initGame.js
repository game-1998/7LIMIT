import { ref, set } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { CARD_POOL, CARD_TEXT } from "./state.js";

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function createInitialDeck() {
  const shuffled = shuffle(CARD_POOL);
  const deck100 = shuffled.slice(0, 100); // 100枚だけ使う

  // --- ログ表示カウント処理 ---
  const counts = {};

  for (const card of deck100) {
    // 表示名を取得
    let displayName;

    if (card.type === "delta") {
      // delta は値ごとに名前を生成
      const info = CARD_TEXT.delta(card.value);
      displayName = info.name; // 例: "増減 +2"
    } else {
      displayName = CARD_TEXT[card.type].name; // 例: "ダブル"
    }

    counts[displayName] = (counts[displayName] || 0) + 1;
  }

  console.log("=== Deck100 内訳 ===");
  Object.entries(counts).forEach(([name, count]) => {
    console.log(`${name}: ${count}`);
  });
  console.log("====================");
  // --- カウント処理 ---

  return deck100;
}

export async function startGame(roomId, players) {
  const deck = createInitialDeck();

  // とりあえず全員に2枚ずつ配る
  const gamePlayers = {};
  let deckIndex = 0;

  for (const p of players) {
    const hand = [deck[deckIndex], deck[deckIndex + 1]];
    deckIndex += 2;

    gamePlayers[p.uid] = {
      name: p.name,
      hand,
      gauges: [
        { type: "hanki", value: 0, effect: null, link: null, locked: false },
        { type: "mansui", value: 0, effect: null, link: null, locked: false },
        { type: "cap",   value: 0, effect: null, link: null, locked: false }
      ],
      effects: {
        double: false,
        half: false,
        signFlip: false,
        share: null, // 共有しているゲージ情報はあとで詰める
      },
    };
  }

  const remainingDeck = deck.slice(deckIndex);

  const firstTurnUid = players[0].uid; // とりあえずホスト先頭

  // 最初のプレイヤーにだけ 3 枚目を追加
  const firstPlayer = gamePlayers[firstTurnUid];
  if (firstPlayer && remainingDeck.length > 0) {
    firstPlayer.hand.push(remainingDeck.shift());
  }

  const gameState = {
    deck: remainingDeck,
    turn: firstTurnUid,
    players: gamePlayers,
    turnOrder: players.map(p => p.uid),
  };

  await set(ref(firebaseDB, `rooms/${roomId}/gameState`), gameState);
}
