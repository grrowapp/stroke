## Context

動機は `proposal.md` の Why。

**構造を語る資料が3つあり、役割が重なっている。**

| 資料 | CLAUDE.md での位置づけ | 中身 |
| --- | --- | --- |
| `openspec/specs/app-structure` | 機能的 spec（Requirement + Scenario） | 「`app/components/` と `app/composables/` の配下は階層ディレクトリ（`workspace/` / `shared/`）で分ける」を SHALL で定める |
| `docs/specs/core/system-structure.md` | 「構造の定義。**統合後のあるべき配置の規範**」 | 「components は `ui/` ＋機能単位で切る」 |
| `docs/specs/plan/structure-migration.md` | 「規範に対する現状の差分（移行課題）」 | 「`components/` が global / shared / workspace / stroke / review ＋直下平置き → `ui/` ＋機能単位へ移す」 |

**食い違いの正体は、片方が現状の規則で、もう片方が到達点だということである。** `structure-migration.md` がその差を移行課題として持っており、3つ並べれば筋は通っている。

問題は `app-structure` が **SHALL で現状を固定している**ことである。到達点へ動かす作業が、そのたびに spec 違反になる。実際 `create-module-markdown` では、`modules/` を置くために `app-structure` に delta を当てる必要が生じた。

## Goals / Non-Goals

**Goals:**

- 次に構造へ触る人が、**どれを読めばよいか**が一意に決まる状態にする
- `modules/` を規範に載せる
- 棚卸しと移行課題を実態に合わせる

**Non-Goals:**

- components の再編（`ui/` ＋機能単位への移動）そのものはやらない。それは別の作業で、`structure-migration.md` が引き続き持つ
- 振る舞いを変えない。コードに触るのは `test/` の移動だけ

## Decisions

### 決定1: 構造の正は `docs/specs/core/system-structure.md`。`app-structure` は検査できる形に言い換えたものとする

食い違ったときは `system-structure.md` が勝つ。`app-structure` はそこから導かれる要件を持つが、**現状の配置を SHALL で固定しない**。

**なぜ:** CLAUDE.md が `system-structure.md` を「統合後のあるべき配置の規範」と定めている。規範が到達点を語り、spec が現状を固定すると、到達点へ動くこと自体が違反になる。規範と spec が同じ方向を向いていなければ、どちらに従っても間違いになる。

**`app-structure` の書き換えの方針:** 「`workspace/` / `shared/` で分ける」という**現状の区切りの名前を要件から外し**、判定の軸だけを残す。すなわち「モジュールの置き場は実際の参照範囲によって決める」「役割・名前・将来の想定で決めない」は残し、ディレクトリ名の列挙は `system-structure.md` へ委ねる。

これで components が `ui/` ＋機能単位へ動いても spec を書き換えずに済み、`structure-migration.md` の移行課題が spec 違反ではなくなる。

**代替案1: `openspec/specs/app-structure` を正とし、`system-structure.md` をそれに従わせる** — CLAUDE.md の位置づけ（あるべき配置の規範）を覆すことになる。採らない。

**代替案2: 両方を残し、食い違いを注記だけする** — 読む人がどちらに従うかを毎回判断することになる。解決していない。採らない。

### 決定2: `modules/` は `system-structure.md` のディレクトリ構造に加える

`app-structure` には `create-module-markdown` が既に判定基準（画面の階層に属さない自己完結の機能を置く）を入れた。**規範の側にも実体を載せる。**

### 決定3: テストの置き場は写し元に従う

規範は「`test/` にソースの構造をそのまま写す」である。写し元がモジュールへ移ったなら、テストも `test/modules/markdown/...` へ移る。

`create-module-markdown` で追加された `test/modules/markdown/runtime/position/` は既にこの形である。**古い側（`test/app/components/workspace/markdown-*.test.ts`）を合わせる。**

`markdown-roundtrip.test.ts` だけは例外にする。あれは TipTap を検証したもので、写し元が `app/components/workspace/` に無い（そもそも採用しなかったライブラリの記録である）。**どこにも写し元が無いテストの置き場**は、この change で決める。

## Risks / Trade-offs

**`app-structure` から区切りの名前を外すと、判定が緩くなる** → 「実際の参照範囲で決める」という軸は残るので、判定はできる。ただし `workspace/` と `shared/` のどちらに置くかは `system-structure.md` を読まないと分からなくなる。spec 単体で完結しなくなるのは受け入れる。2つが食い違っている今より良い。

**`create-module-markdown` と同じ capability（`app-structure`）に delta を当てる** → 順序が要る。あちらを先に archive してからでないと、同じ Requirement を2つの change が別々に書き換えることになる。

**components の再編が残る** → この change では動かさない。`structure-migration.md` が引き続き持つ。ただし移行課題が spec 違反ではなくなるので、着手できる状態にはなる。
