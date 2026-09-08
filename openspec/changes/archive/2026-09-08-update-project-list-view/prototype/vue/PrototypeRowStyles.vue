<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — 失敗の行の見せ方3案と、variant C の行フラッシュ、スライダーの受け口。
 *
 * scoped を付けていない。テーブルの `<tr>` に当てるクラスを外から効かせるためで、
 * この形は使い捨て前提である。決まった案だけを `main.css` へ移す。
 */
defineProps<{ variant: string }>();
</script>

<template>
  <!-- 何も描かない。style を効かせるためだけに置く -->
  <span class="pt-row-styles" :data-variant="variant" hidden />
</template>

<style>
/*
 * ── 生成中の行 ─────────────────────────────────────────────────────────────
 * 地はスライダーから `--pt-bg` で受ける。行を薄くする（opacity）ことはしない——
 * 透過はスライダー側の alpha で見る。
 */
.pt-tuned {
  cursor: not-allowed;
}

/*
 * 下地を敷いてから色を重ねる。
 *
 * `background` に rgba を1枚置くだけだと、透過を下げたときに後ろへ抜けるのは**ページの地**
 * （`--surface-base` #0f172a）なので、薄めるほど暗く沈む。通常の行と同じ地
 * （`--surface-panel`）を敷き、その上に色を重ねると、透過は「通常の行の上にどれだけ
 * 自分の色を乗せるか」になる。
 */
.pt-tuned td {
  background-color: var(--surface-panel);
  background-image: linear-gradient(var(--pt-bg, #161f32), var(--pt-bg, #161f32));
}

/*
 * 中身を薄くし、**さらにピントを外す**。
 *
 * 不透明度だけ下げても輪郭は立ったままで、「薄い」だけで「ボケた」にはならない。
 * `blur` を少し掛けると輪郭が溶けて、初めて焦点が合っていないように見える。
 */
.pt-tuned td > * {
  opacity: var(--pt-ink, 0.75);
  filter: blur(var(--pt-blur, 1.2px));
}

/*
 * フォルダアイコンは外す。ただし**インデントは他の行と揃える**ので、
 * アイコンぶんの幅（14px）だけ場所を空ける。
 */
.pt-indent {
  display: inline-block;
  width: 14px;
  flex: none;
}

/*
 * ── アクティブのしるし（電球） ─────────────────────────────────────────────
 *
 * 平らな丸だと「点」にしか見えない。斜め上に光の当たり、外へにじむ光、下側の落ち込みを
 * 足すと、球が灯っているように見える。チップの中に入れて、行に別部品を並べない。
 */
/*
 * チップ**そのもの**を灯らせる。中に豆を置くのではなく、緑の面が光っているように見せる。
 *
 * 4枚重ねている。
 *   1. 上から下への明暗（面の丸みを出す）
 *   2. 上辺の内側に白い線（ガラスの照り返し）
 *   3. 下辺の内側に暗い線（球の落ち込み）
 *   4. 外へのにじみ2枚（灯っていることを外へ漏らす）
 */
/*
 * 4状態とも**同じガラスの形**にして、違うのは「灯っているか」だけにする。
 * 形（上の照り・下の落ち込み・面の明暗）は共通、外へのにじみの有無で灯りを分ける。
 */
.pt-chip-glass {
  /*
   * 大きさを揃える。文言の長さで幅が変わると、状態の列が凸凹して読みにくい。
   * いちばん広い「作成に失敗」に合わせて最小幅を取り、中身は中央に置く。
   */
  min-width: var(--pt-chip-w, 76px);
  justify-content: center;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--chip) 38%, transparent) 0%,
      color-mix(in srgb, var(--chip) 20%, transparent) 55%,
      color-mix(in srgb, var(--chip) 26%, transparent) 100%
    );
  color: color-mix(in srgb, var(--chip) 55%, #fff);
  border: 1px solid color-mix(in srgb, var(--chip) 55%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 34%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 28%, transparent);
}

/* 灯っている。外へ光が漏れ、文字も発光する */
.pt-chip-lit {
  text-shadow: 0 0 6px color-mix(in srgb, var(--chip) 60%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 34%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 28%, transparent),
    0 0 7px color-mix(in srgb, var(--chip) 45%, transparent),
    0 0 15px color-mix(in srgb, var(--chip) 22%, transparent);
}

/* 消えている。形はそのままで、光だけが無い */
.pt-chip-dark {
  color: color-mix(in srgb, var(--chip) 40%, var(--text-muted));
}

/*
 * 未接続は「**消えているランプ**」にする。
 *
 * 無彩色で塗ると OFF の札に見えて、灯っているアクティブとの間に段差が生まれる。同じ
 * ガラスの器で、灯りが入っていないだけ——にするために、色をわずかに残し、面は透かす。
 * 艶（上辺の照り）は残す。あれがガラスであることの手がかりなので、外すと札に戻る。
 */

/*
 * スライダーで直接いじる版。色相・面の濃さ・枠の濃さ・文字の明るさを外から受ける。
 */
.pt-chip-knob {
  --chip: hsl(var(--pt-hue, 200) 80% 74%);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--chip) calc(var(--pt-fill, 12) * 1%), transparent) 0%,
      color-mix(in srgb, var(--chip) calc(var(--pt-fill, 12) * 0.4%), transparent) 55%,
      color-mix(in srgb, var(--chip) calc(var(--pt-fill, 12) * 0.7%), transparent) 100%
    );
  border-color: color-mix(in srgb, var(--chip) calc(var(--pt-edge, 30) * 1%), transparent);
  color: color-mix(in srgb, var(--chip) calc(var(--pt-txt, 45) * 1%), #fff);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 20%, transparent);
  text-shadow: none;
}

/* 1. 青みのガラス。面の色は一覧の地に近い寒色 */
.pt-chip-cool {
  --chip: #7dd3fc;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--chip) 26%, transparent) 0%,
      color-mix(in srgb, var(--chip) 10%, transparent) 55%,
      color-mix(in srgb, var(--chip) 18%, transparent) 100%
    );
  border-color: color-mix(in srgb, var(--chip) 42%, transparent);
  color: color-mix(in srgb, var(--chip) 45%, #fff);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 22%, transparent);
  text-shadow: none;
}

/* 2. 緑をわずかに残したガラス。同じランプが消えている、という読み */
.pt-chip-ghost {
  --chip: var(--status-success);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--chip) 22%, transparent) 0%,
      color-mix(in srgb, var(--chip) 8%, transparent) 55%,
      color-mix(in srgb, var(--chip) 15%, transparent) 100%
    );
  border-color: color-mix(in srgb, var(--chip) 26%, transparent);
  color: color-mix(in srgb, var(--chip) 24%, var(--text-muted));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 22%, transparent);
  text-shadow: none;
}

/* 3. さらに透かす。器の輪郭と艶だけを残し、面はほぼ抜く */
.pt-chip-clear {
  --chip: #a5b4fc;
  background: color-mix(in srgb, var(--chip) 10%, transparent);
  border-color: color-mix(in srgb, var(--chip) 38%, transparent);
  color: color-mix(in srgb, var(--chip) 40%, #fff);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 22%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 18%, transparent);
  text-shadow: none;
}

/*
 * 未接続の行から `opacity: .45` を外す。
 *
 * **行ごと 45% にすると、チップに何色を入れても 45% に潰れて地に飲まれる**（実測）。
 * 生成中の明滅で踏んだのと同じ罠。薄めるのは行の文字だけにして、チップは素の濃さで出す。
 */
.pt-row-off-ink {
  opacity: 1;
}

/*
 * 薄めるのは**状態の列以外**。セルの位置で名指しする。
 *
 * `:not(:has(.sb-chip))` で書いていたが当たっておらず、プロジェクト名がアクティブと
 * 同じ濃さのまま出ていた。1列目（名前）・3列目（通知）は中身を薄め、4列目（最終更新）は
 * 素のテキストなので色で落とす——`opacity` を td に掛けると地まで抜けて暗く沈む。
 */
.pt-row-off-ink td:nth-child(1) > *,
.pt-row-off-ink td:nth-child(3) > * {
  opacity: 0.45;
}

.pt-row-off-ink td:nth-child(4) {
  color: color-mix(in srgb, var(--text-secondary) 45%, var(--surface-panel));
}

/* チップの中のローダー。チップの色に合わせる */
.pt-spinner-in-chip {
  width: 9px;
  height: 9px;
  border-width: 1.5px;
  border-color: color-mix(in srgb, var(--chip) 30%, transparent);
  border-top-color: color-mix(in srgb, var(--chip) 55%, #fff);
}

/*
 * ── アクティブの灯り方 6案 ─────────────────────────────────────────────────
 * 形（大きさ・角丸・余白・枠）は `pt-chip-glass` のまま。光らせ方だけを変える。
 */

/* 1. 今の案。外へのにじみ2枚 ＋ 上の照り ＋ 文字の発光 */

/* 2. にじみだけ。照りも文字の発光も持たない */
.pt-lamp-2 {
  text-shadow: none;
  box-shadow:
    0 0 7px color-mix(in srgb, var(--chip) 45%, transparent),
    0 0 15px color-mix(in srgb, var(--chip) 22%, transparent);
}

/* 3. 照りだけ。ガラスの艶はあるが、外へ光を漏らさない */
.pt-lamp-3 {
  text-shadow: none;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 45%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #000 30%, transparent);
}

/* 4. 内側から光る。中心が明るく、縁へ落ちる */
.pt-lamp-4 {
  background:
    radial-gradient(
      ellipse at 50% 40%,
      color-mix(in srgb, var(--chip) 62%, transparent) 0%,
      color-mix(in srgb, var(--chip) 26%, transparent) 60%,
      color-mix(in srgb, var(--chip) 12%, transparent) 100%
    );
  text-shadow: none;
  box-shadow: inset 0 0 8px color-mix(in srgb, var(--chip) 40%, transparent);
}

/* 5. 縁だけ光る。面は暗いまま。ネオン管 */
.pt-lamp-5 {
  background: color-mix(in srgb, var(--chip) 8%, transparent);
  border-color: var(--chip);
  text-shadow: none;
  box-shadow:
    0 0 6px color-mix(in srgb, var(--chip) 55%, transparent),
    inset 0 0 5px color-mix(in srgb, var(--chip) 35%, transparent);
}

/* 6. 塗りつぶし。ランプではなく「点いている」札 */
.pt-lamp-6 {
  background: var(--chip);
  border-color: var(--chip);
  color: color-mix(in srgb, #000 72%, var(--chip));
  text-shadow: none;
  box-shadow: none;
}

.pt-chip-active { --chip: var(--status-success); }
.pt-chip-offline { --chip: var(--text-faint); }
/* 未接続の見せ方クラスが --chip を上書きできるよう、後ろに置き直す */
.pt-chip-cool { --chip: #7dd3fc; }
.pt-chip-ghost { --chip: var(--status-success); }
.pt-chip-clear { --chip: #a5b4fc; }
.pt-chip-creating { --chip: var(--interactive-primary); }
.pt-chip-failed { --chip: var(--status-error); }

/* チップの中に収める */
.pt-chip-flex {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/*
 * ── オフラインの行に白を1枚かぶせる ───────────────────────────────────────
 *
 * 地の色を作り替えるのではなく、**オフラインの行の上に白を透過で重ねる**。
 * 文字にも一緒に白がかかるので、地だけ変えたときとは見え方が違う。
 *
 * オフラインの見え方は `tr` の `opacity: .45` で作られているが、それをそのまま使うと
 * かぶせた白まで 45% に薄まる。ここでは地を実測値（#161f32）で直に置き、薄めるのは
 * **中身だけ**にして、白の膜は素の濃さで乗るようにしている。
 */
.pt-veil td {
  position: relative;
  background: #161f32;
}

.pt-veil td > * {
  opacity: 0.45;
}

.pt-veil td::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgb(255 255 255 / var(--pt-veil, 0));
}

/*
 * ── 失敗の行 3案 ───────────────────────────────────────────────────────────
 */

/* A. 他と同じ形のまま、静かに落とす */
.pt-fail-a {
  opacity: 0.6;
  cursor: not-allowed;
}

/* B. ボケを外し、左に赤い柱を立てる */
.pt-fail-b {
  opacity: 1;
  cursor: not-allowed;
}

.pt-fail-b td:first-child {
  box-shadow: inset 3px 0 0 var(--status-error);
}

.pt-fail-b td {
  background: color-mix(in srgb, var(--status-error) 6%, var(--surface-panel));
}

/* C. チップを警告色にして、理由を添える */
.pt-fail-c {
  opacity: 0.85;
  cursor: not-allowed;
}

.pt-fail-c .sb-chip {
  background: color-mix(in srgb, var(--status-error) 16%, transparent);
  color: var(--status-error);
  border-color: color-mix(in srgb, var(--status-error) 40%, transparent);
}

.pt-fail-note {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

/* ── variant C の行フラッシュ ─────────────────────────────────────────────── */
@keyframes pt-row-flash {
  0% {
    background: color-mix(in srgb, var(--status-success) 34%, transparent);
  }
  100% {
    background: transparent;
  }
}

.pt-row-flash td {
  animation: pt-row-flash 1.6s ease-out 1;
}

@media (prefers-reduced-motion: reduce) {
  .pt-row-flash td {
    animation: none;
  }
}

/* ── prototype の操作パネル ────────────────────────────────────────────────
 * 評価対象と混ざらないよう、わざと素っ気ない見た目にする。
 */
.pt-lab-label {
  font-size: 11px;
  color: var(--text-muted);
}

.pt-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin: 8px 0 4px;
  padding: 10px 12px;
  border: 1px dashed var(--border-default);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.pt-panel label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pt-panel input[type='range'] {
  width: 140px;
}

.pt-panel output {
  min-width: 34px;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  font-weight: 600;
}

.pt-panel code {
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.pt-panel button {
  padding: 4px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--surface-sunken);
  font-weight: 600;
}

.pt-panel button:hover {
  background: var(--surface-hover);
}

/* 今の色を見せる四角。行の地と同じものを大きく出す */
.pt-swatch-chip {
  width: 42px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid var(--border-default);
}

.pt-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px dashed var(--border-default);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
