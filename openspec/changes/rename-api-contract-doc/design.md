## Context

食い違いの中身と経緯は proposal.md - Why を参照。ここには改名を安全に通すための事実を残す。

**参照の広がり**

`api-contract` を参照している箇所は14件ある。内訳は資料が大半で、コードからは1件だけ。

| 種別 | ファイル |
|---|---|
| 規約 | `CLAUDE.md`（Docs の節） |
| 資料 | `docs/specs/core/system-structure.md` / `docs/specs/architecture/data-fetching.md` / `docs/specs/architecture/question-flow.md` / `docs/specs/reference/stroke-modules.md` / `docs/specs/plan/next-agent-run.md` |
| コード | `server/utils/stroke/request-schemas.ts`（コメント） |

openspec 側（`openspec/changes/**` と `openspec/ticket/`）にも参照があるが、そちらは**過去の記録**である。archive された change は当時の path を書いたまま残すのが正しく、書き換えない。

**既存の網との関係**

`architecture-docs` は `docs/specs/core/system-structure.md` に対して「単一の場所」「実装で裏が取れる」「実装を変えたら同じ change で更新する」を課している。API の契約には同じ網が無い。今回足す `api-contract-doc` は、その3つを API の契約に対して置き直したものである。

## Goals / Non-Goals

**Goals:**

- 資料の置き場所が1つに定まり、名前が置き場と重複しないこと
- A7 についての記述が実装と一致すること
- 同じ食い違いが再び育たないよう、更新義務を要件として持つこと

**Non-Goals:**

- API の振る舞いを変えない。口・入出力・エラーはそのまま
- 資料の構成や書き方を作り直さない。改名と、実装と食い違う記述の修正に留める
- archive された change や過去の ticket の記述を書き換えない
- `architecture-docs` を触らない。あちらは `system-structure.md` の担当のまま

## Decisions

### 決定1: 改名は git の追跡が切れない形で行う

`git mv` を使う。内容の修正は改名と**別の手順**で行い、改名だけの差分と内容だけの差分に分ける。まとめてやると「移動したのか書き換えたのか」が差分から読めなくなる。

### 決定2: 参照の更新は資料とコードに限り、openspec の過去分は触らない

archive された change は「そのとき何を決めて何をしたか」の記録である。当時の path を今の path に書き換えると、記録としての正しさが壊れる。参照が切れることは承知のうえで残す。

*代替案*: 全件を機械的に置換する。記録が書き換わるので採らない。

### 決定3: 記述の修正は A7 の3箇所に限る

`docs/specs/api/api-contract.md` のうち実装と食い違っているのは、A7 について「ファイルは書かない」「サーバーは proposal を書かない」と書いた55・127・201行だけである。他の記述の裏取りはこの change の範囲としない。範囲を広げると、改名の差分に無関係な修正が混ざる。

ただし新しい要件「資料の記述は実装で裏が取れる」は資料全体に掛かる。**この change の時点で全件の裏取りは行わない**ことを明記し、以後の変更で守らせる形にする。

### 決定4: `CLAUDE.md` の記載も同じ change で直す

`CLAUDE.md` はこの資料を「サーバ API の契約」として名指ししている。改名して `CLAUDE.md` を放置すると、次に読むエージェントが存在しない path を辿る。

## Risks / Trade-offs

- **参照の取りこぼし** → `grep -rn "api-contract"` で網羅し、更新後に0件（archive と ticket を除く）であることを確かめる
- **archive の参照が切れる** → 決定2 のとおり意図的に残す。過去の記録として読む分には path が古いことは自明であり、辿れないことより書き換わることの方が害が大きい
- **資料全体の裏取りをしていない** → 新しい要件は資料全体に掛かるが、この change で全件は検めない。A7 以外にも食い違いが眠っている可能性は残る。決定3 のとおり範囲を明示して残す
- **`api-contract-doc` という新しい capability が増える** → `architecture-docs` に相乗りさせる案もあるが、あちらの Purpose は構造の資料に絞られている。API の契約を混ぜると、どちらの資料に掛かる要件かが読めなくなる

## Migration Plan

不要。資料の改名と記述の修正のみで、実行されるコードの振る舞いは変わらない。ロールバックは revert で足りる。
