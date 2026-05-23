export const CARD_TEXT = {
  double: {
    name: "ダブル",
    desc: "ゲージ増減(±)が2倍になる（永続）"
  },
  half: {
    name: "ハーフ",
    desc: "ゲージ増減(±)が1/2になる（永続）"
  },
  signFlip: {
    name: "符号反転",
    desc: "ゲージ増減の符号が反転する(+ ↔ −)（永続）"
  },
  share: {
    name: "共有",
    desc: "ゲージ値・効果を共有する（永続）"
  },
  cancel: {
    name: "効果解除",
    desc: "ゲージに付与された効果を解除"
  },
  reset: {
    name: "リセット",
    desc: "ゲージ値を0にする"
  },
  typeSwap: {
    name: "タイプ交換",
    desc: "ゲージタイプを入れ替える"
  },
  valueSwap: {
    name: "値交換",
    desc: "ゲージ値を入れ替える"
  },
  gaugeSwap: {
    name: "ゲージ交換",
    desc: "ゲージ(ゲージタイプ、ゲージ値、付与効果、共有状態)を入れ替える"
  },
  copy: {
    name: "コピー",
    desc: "ゲージ値を他のゲージにコピーする"
  },
  shuffle: {
    name: "シャッフル",
    desc: "選択したプレイヤー(人数制限なし)のゲージ値全てをランダムに入れ替える"
  },
  transfer: {
    name: "譲渡",
    desc: "ゲージ値を0にし、その値を他のゲージに追加する"
  },
  // delta は値ごとに動的生成
  delta: (value) => ({
    name: `増減 ${value > 0 ? "+" + value : value}`,
    desc: `ゲージを ${value > 0 ? "+" + value : value} する`
  })
};

export const CARD_POOL = [
  ...Array(20).fill({ type: "double", targetMode: "single" }),          //ダブル  10枚
  ...Array(10).fill({ type: "half", targetMode: "single" }),             //ハーフ  5枚
  ...Array(10).fill({ type: "signFlip", targetMode: "single" }),         //符号反転  5枚
  ...Array(10).fill({ type: "share", targetMode: "double" }),            //ゲージ共有　8枚
  //...Array(20).fill({ type: "cancel", targetMode: "single" }),           //解除  8枚
  ...Array(10).fill({ type: "reset", targetMode: "single" }),            //リセット  5枚
  ...Array(20).fill({ type: "typeSwap", targetMode: "double" }),        //タイプ交換  10枚
  //...Array(10).fill({ type: "valueSwap", targetMode: "double" }),       //ゲージ値交換
  ...Array(20).fill({ type: "gaugeSwap", targetMode: "double" }),       //ゲージ交換  10枚
  //...Array(10).fill({ type: "copy", targetMode: "direction" }),         //コピー
  //...Array(5).fill({ type: "shuffle", targetMode: "multi" }),           //シャッフル
  //...Array(8).fill({ type: "transfer", targetMode: "direction" }),      //譲渡
  ...Array(15).fill({ type: "delta", value: -1, targetMode: "single" }),  //-1
  ...Array(27).fill({ type: "delta", value: +1, targetMode: "single" }),  //+1
  ...Array(10).fill({ type: "delta", value: -2, targetMode: "single" }),  //-2
  ...Array(26).fill({ type: "delta", value: +2, targetMode: "single" }),  //+2
  ...Array(5).fill({ type: "delta", value: -3, targetMode: "single" }),   //-3
  ...Array(23).fill({ type: "delta", value: +3, targetMode: "single" })   //+3
];
