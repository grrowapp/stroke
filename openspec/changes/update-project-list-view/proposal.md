## Why

プロジェクト一覧の状態の見え方が、**承認済みの `ui.md` に書かれた確定値どおりに実装されていない**。

`show-pending-project-in-list`（archive 済み、2026-08-30）は prototype で実物を見比べて値を確定させ、`ui.md` に色・寸法・にじみまで記録した。行の地とローダーはそのとおり実装された。しかし**状態チップだけは、記録された質感が実装に入らず、単色の平板な形になっている**。加えて、未接続の行の薄め方が prototype と違い、チップまで一緒に沈んでいる。

`ui.md` は「4状態とも同じガラスの形にする。違うのは灯っているかどうかだけ」と定めているが、実装ではその形が成立していない。ADR-0004 の「資料と食い違うコードは誤り」に当たる。

見つけ方は次のとおり。当時の prototype（`prototype/index.html`）をセッションの scratchpad から回収して起動し、実物（`/projects`）と並べて突き合わせた。

## What Changes

- **状態チップにガラスの質感を戻す。** 面の3段グラデーション・上辺の照り返し・下辺の落ち込み・文字を `#fff` と混ぜる処理を `.sb-chip` に入れる
- **アクティブのチップに発光を戻す。** 文字のにじみ（`text-shadow`）と外へのにじみ2枚を `.sb-chip-on` に入れる
- **未接続の行の薄め方を変える。** 行ごと `opacity` を掛けるのをやめ、**状態列以外**を薄める形にする。チップは沈ませない
- **生成中の行の薄め方も同じ形にする**（実装中に加えた。tasks 2.6）。`td > *` への `opacity` をやめ、文字色で弱める。ローダーとチップは沈ませない
- **動きを抑える設定でも状態の列が読めるようにする**（実装中に加えた。tasks 5.3）。`@media (prefers-reduced-motion: reduce)` の中にあった行ごとの `opacity` を落とす
- 当時の prototype を `prototype/index.html` として本 change に持ち込む（ペラ1・依存なし）

**この change は見た目だけを扱う。** 母集合の判定・配信・削除の口・決着モーダルには触れない。

### 持ち込んだ資料

`prototype/index.html` が値の正である。`prototype/vue/` の6本（祝いの3案・行スタイル・切替器・一覧本体）は、`show-pending-project-in-list` の実装中に作られた Vue の試作で、`ce23e6f5`（2026-08-31）で `app/components/prototype/` と `app/pages/prototype/projects.vue` へ回収されたものの**同一の写し**である。突き合わせの経緯として同梱したもので、**この change が入れる値はここからは取らない。**

### 対象外

- **失敗の行**（`.row-fail` / `.chip.failed`）— 失敗は行として残さず決着モーダルで受けると決まっている（`show-pending-project-in-list` の 8.9）。機能として出番が無い
- **PID の併記** — 利用者に出す意味がないため不採用

どちらも prototype には当時の形が残っていたが、**この change の prototype からは削除した**。実装対象と誤読させないためである。

## Capabilities

### Modified Capabilities

- `project/directory` — 一覧の行と状態の見せ方。未接続の行の薄め方と、状態チップの質感

## Impact

| ファイル | 内容 |
| --- | --- |
| `app/assets/css/main.css` | `.sb-chip` / `.sb-chip-on` / `.sb-row-off` / `.sb-row-creating` の4つと、`@media (prefers-reduced-motion: reduce)` の行ごと `opacity` の除去 |
| `app/pages/projects/index.vue` | 最終更新の `td` から文字色のユーティリティ1つを外す。持ち主を `main.css` へ一本化するため |
| `test/e2e/design-token.spec.ts` | チップの断言を、実値の固定から要件の確認へ書き換える（書き換え時は `e2e/`。マージ後の `79afcbb9` で `test/e2e/` へ移った） |

コードの構造・DOM は変えない。**CSS の宣言を直し、色の持ち主を CSS に寄せるためのユーティリティ1つを外す。**

実装コミット `64a2b8d1` には、この change の対象外である `playwright.config.ts` と `CLAUDE.md`（E2E のポートを 50000 から上へ空きを探す方式へ）が同乗している。E2E を回すために必要だった直しで、見た目とは無関係。決定の記録に残す。

### 見た目が変わる画面

`.sb-chip` は一覧の専用クラスではない。**同じ意味のチップとして3箇所で使われており、ガラスはその全部に及ぶ。**

| 画面 | 使い方 |
| --- | --- |
| `app/pages/projects/index.vue` | 一覧の状態（アクティブ / 未接続 / 生成中）。この change の主対象 |
| `app/layouts/workspace.vue` | 下層ヘッダの接続状態（アクティブ / 未接続）。一覧と同じ状態を同じ言葉で出している |
| `app/components/workspace/DocumentEditor.vue` | 保存の状態（保存しました / 未保存 / 保存できません） |

**揃うのが正しい。** どれも「いまどうなっているか」を同じ形で出すものなので、一覧だけガラスにして他を平板に残す理由が無い。実機で3箇所とも崩れないことを確かめる（tasks 5.5）。

### 既存テストの書き換え

`design-token.spec.ts` の「アクティブは緑のチップ、未接続は無彩色」が、**旧実装の実値を期待値に固定していた**。

```
expect(active.borderWidth).toBe('0px');
// コメント「prototype の chipOn は border を宣言していないので枠幅 0」
```

prototype の実物は `.chip { border: 1px solid }` ＋ `.chip.active { border-color: … 55% }` で、**枠は在る**。旧実装とこのテストが揃って prototype を読み違えていた。

色も `rgb(34, 197, 94)` のように固定しており、混ぜ方を詰め直すたびに落ちる。テストが値の写しになってしまうので、`specs/project/directory` が要求する**関係**を見る形へ変える——3状態が同じ形と同じ幅で並ぶこと、際立つのはアクティブだけであること。実値は `ui.md` と prototype が持つ。

`openspec/specs/project/directory/spec.md` の要件文は「押せないことが見て分かる」までしか規定しておらず、行ごと `opacity` を掛ける実装もこの文言は満たしてしまう。旧テストが実値を固定していたのは、関係を規定する文言が spec に無かったためでもある。そこで delta spec は、テストが見るべき**関係**を要件へ引き上げる——3状態は同じ形・同じ幅、際立つのはアクティブだけ、行を弱めるとき状態の列は弱めない。実現手段（`opacity` か文字色か）には踏み込まない。

## 突き合わせの結果

`ui.md` の記録と `main.css` の実装を1項目ずつ照合した。

### チップ（既定）

| 項目 | ui.md / prototype | 実装 `.sb-chip` |
| --- | --- | --- |
| 面 | 3段の `linear-gradient`（12% → 4.8% → 8.4%） | `--surface-sunken` 単色 |
| 上辺の照り返し | `inset 0 1px 0 #fff 16%` | 無し |
| 下辺の落ち込み | `inset 0 -1px 0 #000 20%` | 無し |
| 文字 | 基調色を **90% で `#fff` と混ぜる** | `--text-muted` そのまま |
| 幅 | `min-width: 76px` | 一致 |

### チップ（アクティブ）

| 項目 | ui.md / prototype | 実装 `.sb-chip-on` |
| --- | --- | --- |
| 面 | 38% → 20% → 26% の3段 | `18%` 単色 |
| 枠 | 55% | `border-width: 0` |
| 文字 | **55% で `#fff` と混ぜる** | `--status-success` そのまま |
| 文字のにじみ | `text-shadow: 0 0 6px`（60%） | 無し |
| 外へのにじみ | `0 0 7px`（45%）＋ `0 0 15px`（22%）の2枚 | 無し |

### 行

| 項目 | prototype | 実装 |
| --- | --- | --- |
| 未接続 | 状態列**以外**を薄める（`td:nth-child(1)` と `(3)` の子、`(4)` は色で） | `.sb-row-off { opacity: .45 }` で**行ごと** |
| 生成中 | 名前と日付は未接続と同じ薄さ。ローダーは薄めない | `.sb-row-creating td > * { opacity: .45 }` で**ローダーとチップまで沈む**（実装中に発見。tasks 2.6） |
| 生成中・動きを抑える設定 | 弱め方は動きの設定に関わらず同じ | `@media (prefers-reduced-motion: reduce)` の中で `.sb-row-creating { opacity: .45 }` を**行ごと**（実装中に発見。tasks 5.3） |
| 生成中の地 | `#161f32` を `--surface-panel` の上に重ねる | 一致 |

### 一致していたもの（触らない）

```
ローダー   15px / 輪 2px / 帯 180° / conic-gradient    一致
回転       sb-spin 0.9s linear infinite                一致
明滅       sb-loader-blink 1.6s（0,42%→1 / 50,92%→.25） 一致
生成中の地 #161f32                                      一致
チップ幅   min-width: 76px                              一致
```

## 決定の記録

| 日付 | 決定 |
| --- | --- |
| 2026-08-30 | **未接続の薄め方（`.sb-row-off`）を先に直す。** 行ごと `opacity` が掛かっている限り、チップにガラスを入れても沈んで見えない。チップの質感より前提になる |
| 2026-08-30 | **prototype から失敗の行と PID を削除して持ち込む。** どちらも不採用が確定しており、当時のまま置くと実装対象と誤読される。削除した事実と理由は `prototype/index.html` の冒頭コメントに残す |
| 2026-08-30 | **`ui.md` の Visual Language とは食い違ったままにする。** 同 `ui.md` は「アクティブ / 未接続の区別は色ではなく文言と非活性で示す」とも書いているが、採用した prototype はアクティブを緑で灯している。`main.css` の既存コメントが既にこの食い違いを認識して prototype 側を採っており、本 change もそれを踏襲する |
| 2026-08-31 | **範囲を `.sb-row-creating` と `@media (prefers-reduced-motion: reduce)` へ広げる。** どちらも未接続の行と同じ欠陥（行ごと・子ごとの `opacity` で状態の列まで沈む）で、delta spec の「状態の列を弱めてはならない」は同じ要件の中で生成中の行にも掛かる。別 change に切り出さない |
| 2026-08-31 | **最終更新の文字色の持ち主を `main.css` に一本化する。** `td` の Tailwind ユーティリティが後のレイヤーに載るため、行の状態で沈める指定が必ず負けていた。DOM は変えず、ユーティリティ1つを外して `.sb-table td:nth-child(4)` を持ち主にする |
| 2026-08-31 | **E2E のポート割り当ての直し（`playwright.config.ts`・`CLAUDE.md`）を同じコミットに同乗させる。** worktree 名の固定表で pre1〜pre7 が同じスロットへ落ちて衝突し、6.3 が回せなかった。この change の対象外だが、切り離すと E2E を通す手段が無いため同乗を許した。規定は `CLAUDE.md`「Dev サーバー」へ入れた |
| 2026-09-02 | **6.3（E2E）・8.1（レビュー）・8.2（完了承認）を未実施のままマージした事実を tasks に残す。** チェックを付けて埋めない。archive の前に 6.3 を通す |
