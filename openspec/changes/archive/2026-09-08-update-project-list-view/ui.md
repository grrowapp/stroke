# update-project-list-view — ui

**入れる値の正は `prototype/index.html` である。** 本書はそこから読み取れる値を写して並べたもので、食い違ったら prototype の実物が勝つ。prototype はペラ1・外部依存なしなので、静的サーバで開けばいつでも実物を確認でき、ツマミで詰め直せる。

`show-pending-project-in-list` の `ui.md`（archive 済み）にも同じ値が記録されている。本書はそれを新たに決め直すものではない。

## 何を直すか

CSS の宣言を直す。当初は3つの予定だったが、実装中に同じ欠陥が2箇所で見つかり（tasks 2.6・5.3）、4つになった。

```
.sb-row-off       行ごとの opacity をやめ、状態列以外を薄める形にする
.sb-row-creating  同上。ただし名前セルはローダーを内包するため opacity では戻せず、文字色で弱める（通知の列は未接続と同じ opacity）
.sb-chip          ガラスの質感（面の3段・上辺の照り・下辺の落ち込み・文字の混色）を入れる
.sb-chip-on       アクティブの発光（文字のにじみ・外へのにじみ2枚）を入れる
```

これに加えて `@media (prefers-reduced-motion: reduce)` の中にあった `.sb-row-creating { opacity: 0.45 }` を落とした（「動きを抑える設定」）。

DOM は変えない。クラス名は1つだけ外した——最終更新の `td` にあった文字色のユーティリティ（`text-[var(--text-secondary)]`）。行の状態で沈める指定を `main.css` の `@layer components` に置く一方、ユーティリティはより後のレイヤーに載るため、沈める側が必ず負けていた。基準の色も `main.css` の `.sb-table td:nth-child(4)` へ移し、1つの property に持ち主を2人置かない形にした。

**順序に意味がある。** `.sb-row-off` を先に直さないと、チップにガラスを入れても行ごと沈んで見えない。

## 未接続の行

```css
/* 状態列（2列目）以外を薄める。行ごと opacity は掛けない */
.row-off td:nth-child(1) > *,
.row-off td:nth-child(3) > * { opacity: 0.45; }
.row-off td:nth-child(4) { color: color-mix(in srgb, var(--text-secondary) 45%, var(--surface-panel)); }
```

最終更新（4列目）だけ扱いが違う。文字色を地と混ぜて沈めており、`opacity` ではない。日付はもともと `--text-secondary` の1色で、子要素を持たないためである。

| 列 | 薄め方 |
| --- | --- |
| 1 プロジェクト | 子要素に `opacity: 0.45` |
| 2 状態 | **薄めない** |
| 3 未処理の通知 | 子要素に `opacity: 0.45` |
| 4 最終更新 | 文字色を `--text-secondary` 45% で `--surface-panel` と混ぜる |

## 生成中の行

未接続の行と**同じ薄さ**にする。ただし名前セルだけ薄め方が違う。名前セルはローダーと名前を1つの `span` に収めており、その親へ `opacity` を掛けるとローダーまで沈む。`opacity` はグループを作るので、子を親より濃くして戻すことができない。そのため名前セルは**文字色で弱める**。ローダーは `conic-gradient` の背景なので文字色の影響を受けず、チップは自分の文字色を持つので影響を受けない。

**ここは prototype（`.row-gen .name { opacity }`）から意図して離れている。** prototype はローダーと名前が別の要素だが、実物は1つの `span` に収めているためである。「食い違ったら prototype が勝つ」の例外はこの1点だけ。

未処理の通知（3列目）は未接続の行と同じく**子要素に `opacity`** を掛ける。この列の「—」はユーティリティで自分の文字色を持つため、`td` の文字色を変えても届かない。ローダーは無いので `opacity` で沈めてよい（prototype の `.row-gen td:nth-child(3) > *` と同じ）。当初は名前と同じ文字色の指定にしていたが効いておらず、2026-09-07 のレビュー（tasks 8.1）で見つけて直した。

```css
/* 実装の形（main.css）。名前は文字色、通知は子要素の opacity。状態列（2列目）は触らない */
.sb-row-creating td:nth-child(1) { color: color-mix(in srgb, var(--text-primary) 45%, var(--surface-panel)); }
.sb-row-creating td:nth-child(3) > * { opacity: 0.45; }
.sb-row-creating td:nth-child(4) { color: color-mix(in srgb, var(--text-secondary) 45%, var(--surface-panel)); }
```

| 列 | 薄め方 |
| --- | --- |
| 1 プロジェクト | 文字色を `--text-primary` 45% で `--surface-panel` と混ぜる。ローダーは沈まない |
| 2 状態 | **薄めない** |
| 3 未処理の通知 | 未接続と同じ。子要素に `opacity: 0.45` |
| 4 最終更新 | 未接続と同じ。`--text-secondary` 45% で `--surface-panel` と混ぜる |

行の地（`#161f32` の重ね）はそのまま残す。薄くするのは中身だけで、生成中を「薄いだけの行」にしない。

## チップ（既定 — 未接続・生成中）

基調色は `--text-faint`。ツマミの既定値は 文字 90 / 面 12 / 枠 30。

| 項目 | 値 |
| --- | --- |
| 形 | `inline-flex`・`min-width: 76px`・`padding: 2px 8px`・`border-radius: 999px` |
| 文字 | `11px` / `600`。基調色を **90% で `#fff` と混ぜる** |
| 面 | 3段の `linear-gradient(180deg, …)` — 基調色を **12% → 4.8% → 8.4%** で敷く（停止点 0% / 55% / 100%） |
| 枠 | `1px`。基調色 **30%** |
| 上辺の照り返し | `inset 0 1px 0` `#fff` **16%** |
| 下辺の落ち込み | `inset 0 -1px 0` `#000` **20%** |

面の3段は、中央（55%）をいちばん薄くし、下端（100%）で少し戻す。平坦なグラデーションではなく、下辺で受けた光が戻る形にしている。

prototype の `.chip` にある `gap: 6px` は写していない。チップの中身は文字1つで、`gap` が効く相手が無い。

## チップ（アクティブ）

基調色を `--status-success` に差し替え、上の既定値をすべて上書きする。

| 項目 | 値 |
| --- | --- |
| 面 | **38% → 20% → 26%** の3段 |
| 枠 | **55%** |
| 文字 | **55% で `#fff` と混ぜる**（既定より白へ寄る） |
| 文字のにじみ | `text-shadow: 0 0 6px`（**60%**） |
| 上辺の照り返し | `inset 0 1px 0` `#fff` **34%**（既定より強い） |
| 下辺の落ち込み | `inset 0 -1px 0` `#000` **28%** |
| 外へのにじみ | `0 0 7px`（**45%**）と `0 0 15px`（**22%**）の**2枚** |

外へのにじみが2枚なのは、近い1枚だけだと縁が硬く見え、遠い1枚だけだと輪郭がぼやけるためである。近くで縁を作り、遠くで空気を作る。

## 触らないもの

実装は既に `ui.md` どおりで、この change では触らない。

```
生成中の行の地   #161f32 を --surface-panel の上に重ねる
ローダー         15px / 輪 2px / 帯 180° / conic-gradient ＋ mask
回転             0.9s linear infinite
明滅             1.6s linear infinite（0%,42% → 1 ／ 50%,92% → 0.25 ／ 100% → 1）
チップ幅         min-width: 76px
```

## 対象外（prototype からも削除済み）

- **失敗の行** — 失敗は行として居座らず、決着のモーダルで片付く。spec も「作成に失敗」の状態を持たないことを MUST NOT で規定している
- **PID の併記** — 一覧で下す判断は「その行に入るかどうか」だけで、プロセス ID はその判断に使われない。spec も MUST NOT で規定している

どちらも当時の prototype には残っていたが、実装対象と誤読させないため `prototype/index.html` から落とした。落とした事実と理由は同ファイルの冒頭コメントにある。

## 動きを抑える設定

この change は動きを足さない。`animation: none` の指定は既存のまま残す。

ただし `@media (prefers-reduced-motion: reduce)` の中に `.sb-row-creating { opacity: 0.45 }` があり、動きを抑える設定のときだけ行ごと沈んで状態の列が読めなくなっていた（tasks 5.3）。**弱め方は動きの設定に関わらず同じ**であるべきで、上の「生成中の行」の列ごとの指定（名前は文字色、通知は子要素の `opacity`、最終更新は文字色）が常に効いていればよい。この `opacity` を落とした。
