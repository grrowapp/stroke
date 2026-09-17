## Context

動機は [proposal.md](./proposal.md)「Why」。要件は [specs/](./specs/)。

今の上層は3つの path でできている。

| path | 実装 | 中身 |
| --- | --- | --- |
| `/` | `app/pages/index.vue` | 通知の一覧（`portal` layout・約 150 行） |
| `/projects` | `app/pages/projects/index.vue` | プロジェクト一覧（`portal` layout） |
| `/strokes` | `app/pages/strokes/index.vue` | 概要入力（`stroke` layout・全面モーダル） |

3つとも `pages/` に画面の実装そのものを持っている。構造の規範（`docs/specs/structure/page-structure.md`）が定める到達点は「`pages/` はルーティングのみ。実体は `components/page/<PageName>/<PageType>/Container.vue`」で、現状はその手前にある。

制約になるのは次の3つ。

- **`/` とストローク開始の path は同じ画面を出す。** 中身を2つ書いて同期させる形は取れない
- **器の決定は動かさない。** ストロークは全面モーダル・閉じる操作なし（`stroke/frontier`）。`/` もその器で出る
- **`/` は通知に占められている。** 明け渡す以上、通知の行き先を決める必要がある

## Goals / Non-Goals

**Goals:**

- `/` とストローク開始の path が、1つの画面実体を共有する形になっている
- `/` を開いても他の path へ移らないことが、実装の読みではなくテストで担保されている
- URL と画面と責務範囲の正が `docs/specs/architecture/screen-flow.md` の1ファイルにある

**Non-Goals:**

- ストロークの中身と流れ（概要入力 → AI と往復 → proposal 確認 → 承認）の変更
- 下層（`/projects/<id>/**`）の遷移の整理
- `pages/` 全体を規範の到達点へ移す移行（本 change が触る画面だけを規範の形にする）

## Decisions

### D1: 画面実体を Page Component に切り出し、2つの route が同じものを描く

ストローク開始画面の実体を `app/components/page/Stroke/Start/Container.vue` に置き、`/` と ストローク開始の path はそれを呼ぶだけの薄い route にする。

```
app/pages/index.vue          ─┐
                              ├─→ app/components/page/Stroke/Start/Container.vue
app/pages/strokes/index.vue  ─┘
```

- **なぜ** — 「中身は同じ、path だけが別」を、同期の要らない形で満たす唯一のやり方である。実体が1つなので、片方だけ古くなることが起こり得ない
- **規範との関係** — `pages/` はルーティングのみという `page-structure.md` の到達点に、この画面については到達する。規範の側を曲げる決定ではない
- **不採用: `/` から ストローク開始の path への内部リダイレクト** — 遷移を1本足すことになり、`screen-flow` の「ルートは他の URL へ自動で移さない」を自分で破る
- **不採用: `pages/index.vue` に実装を置き、ストローク開始側が import する** — 依存の向きが route 間に生まれる。route は互いを知らない方がよい
- **不採用: 動的 route（`[[path]].vue`）で1ファイルに両方を受ける** — どの path が存在するかがファイル名から読めなくなる。責務を切り分ける本 change の目的と逆を向く

### D2: ストローク開始の path は `/strokes` のまま据え置く

作成ボタンの飛び先を今の `/strokes` から動かさない。

- **なぜ** — `/strokes/<sessionId>` と `/strokes/<sessionId>/proposal` が既にその下に在り、ストロークの path の並びとして揃っている。動かす理由が無い
- **なぜ `/projects/create` にしないか** — ストロークはプロジェクトの子ではない。昇格して初めてプロジェクトになる（`stroke/frontier`）。path の親子が実体の親子と食い違う
- 既存 ticket `relocate-stroke-routes`（ストロークの route を `/projects/create/**` へ移す）は据え置きのまま。本 change はその判断に踏み込まない

### D3: `/` は `stroke` layout で出す

`/` は `portal` layout（ヘッダー + タブ bar）ではなく `stroke` layout（全面モーダル）を使う。

- **なぜ** — `/` が出すのはストローク開始画面そのものであり、器の決定（全面モーダル・閉じる操作なし）は画面に付くもので、入った path で変わらない。`/` だけタブ bar が付くと、同じ画面が2つの見た目を持つことになり D1 が崩れる

### D4: 通知の移設先は `/notifications`（※ユーザー承認が要る）

`/` を明け渡すため、通知の一覧を `/notifications` へ移す。`portal` layout の通知タブの飛び先も同時に変える。

- **なぜ `/notifications`** — `/projects` と同じ「その画面が何の一覧かを名詞で言う」形。上層のタブは通知とプロジェクト一覧の2つで、片方が `/projects` である以上、もう片方も同じ形が読みやすい
- **検討した代案** — `/inbox`（本家にもこの product にも「inbox」の語が無い。`CONTEXT.md` に無い語を URL で新しく作ることになる）
- **`notification-feed` に delta は要らない。** あの spec は通知が何を出すかだけを規定し、置き場を持たない。置き場は `screen-flow` が新しく持つ

> **ユーザーへの提案（承認が要る）** — 通知の URL を `/notifications` にしてよいか。`/` は stroke 初期画面が占めるため、移すこと自体は避けられない。移設先の名前だけが選択の対象である。

### D5: 自動遷移を持たないことをテストで担保する

「`/` を開いても `/projects` へ移らない」を、実装の読みではなく E2E で固定する。

- `/` を開いて待ち、URL が `/` のままであることを確かめる
- 再読み込みしても `/` のままであることを確かめる
- **なぜテストで持つか** — 自動遷移は1行で足せる。書かないという決めだけでは、次に同じことが起きたときに誰も気づけない。[ADR 0025](../../../docs/adr/0025-no-unilateral-navigation-changes.md) は人に向けた規定で、機械に向けた歯止めが別に要る
- `nuxt.config.ts` の `routeRules` には `redirect` を置かない。今も置いていない

### D6: 上位資料への整合反映（※ユーザー承認が要る）

`screen-flow` の delta が「画面遷移の正を資料として持つ」を要件にしているため、上位資料への反映が本 change の責務範囲に入る（`docs/agents/issue-tracker.md`「更新対応」）。

| 資料 | 反映内容 |
| --- | --- |
| `docs/specs/architecture/screen-flow.md` | **新規。** 上層の URL 一覧・各画面の責務・遷移の図・自動遷移を持たない旨 |
| `docs/specs/plan/portal-stroke-entrance.md` | 入口の記述が screen-flow と重なる。重複を畳み、URL と責務の正は screen-flow を指す |
| `docs/specs/structure/system-structure.md` | `app/components/page/` の実体が初めてできる。ディレクトリツリーへ反映 |

> **ユーザーへの提案（承認が要る）** — 上の3ファイルへの反映を本 change で行ってよいか。`docs/adr/0009` は archive 済みで引き継ぎ先が `portal-stroke-entrance.md` のため、そちらを触ると ADR の引き継ぎ先の記述にも影響する。

## Risks / Trade-offs

- **通知の URL が変わり、ブックマークが切れる** → 単一ユーザー前提の開発用ツールであり、移行期間を設ける対象ではない。リダイレクトは置かない（置けば `screen-flow` の自動遷移の禁止と衝突する）
- **`/` が全面モーダルになり、上層のタブ bar から `/` が消える** → `/` へ戻る導線を portal 側に持つ必要がある。ストロークの中から上層へ戻る導線は既に在る（`stroke/frontier`「承認の成功で画面2を離れてプロジェクト一覧へ戻る」）が、**ストロークを始めていない状態の `/` へ戻る導線**は今の portal に無い。通知タブとプロジェクトタブに加えて、`/` への導線を portal layout に足す
- **Page Component への切り出しで、この画面だけ構造が他と違う形になる** → 規範の到達点の側へ動くので、食い違いではなく移行の前進である。`structure-migration.md` に差として残っているのは既知
- **`/` と `/strokes` の2つが同じ画面を出すことが、重複に見える** → `screen-flow` が「同じ画面を出す」を要件として明文化し、資料にも書く。読んだ人が片方を消さないようにする

## Migration Plan

1. 画面実体を Page Component へ切り出す（`/strokes` の見た目と挙動は変えない）
2. 通知を `/notifications` へ移し、portal のタブの飛び先を変える
3. `/` を Page Component を呼ぶ薄い route に置き換える
4. 資料（D6）を反映する
5. E2E を更新し、D5 のテストを足す

途中で止めた場合に壊れるのは 2 と 3 の間（`/` が通知のまま、通知が `/notifications` にもある）だけである。2 と 3 は同じコミットにまとめる。

## Open Questions

無し。D4 と D6 はユーザー承認を待つ項目であり、後回しにできる未知ではない。
