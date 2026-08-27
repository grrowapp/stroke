## Why

サーバ API の契約を書いた資料が、実装と食い違ったまま残っている。

`docs/specs/api/api-contract.md` は A7（`POST /api/strokes/:id/proposal`）について、3箇所で「ファイルは書かない」「**サーバーは proposal を書かない**」と明言している（55・127・201行）。`write-proposal-to-docs` で A7 は受理した本文を残すようになったため、いずれも誤りになった。

食い違いが放置されるのは、**この資料を規定する capability が無い**ためである。`architecture-docs` は `docs/specs/core/system-structure.md` だけを対象とし、「実装を変えたら同じ change のなかで資料も更新する」という要求もそのファイルにしか掛かっていない。API の契約には同じ網が無く、実装だけが動いても誰も止めない。

CLAUDE.md はこの資料を「サーバ API の契約。画面・エージェントとサーバの境界」と位置付けており、人間もエージェントもここを読んで判断する。誤ったまま残ると、読んだ側が誤った前提で作業する。実際この change の元になった不具合の調査でも、この資料の記述が判断を1度誤らせた。

加えて、置き場が `docs/specs/api/` である以上、ファイル名の `api-` は重複している。

## What Changes

- 変更: `docs/specs/api/api-contract.md` を `docs/specs/api/contract.md` へ改名する。置き場が `api/` なのでファイル名に `api-` は要らない
- 変更: 参照している箇所（`CLAUDE.md` を含む14箇所）を新しい path に揃える
- 変更: A7 についての記述を実装に合わせる。「ファイルは書かない」「サーバーは proposal を書かない」を、受理した本文を残す現状に直す（55・127・201行）
- 追加: この資料を規定する capability を新しく設ける。置き場所が1つであること・記述が実装で裏が取れること・API の契約を変えたら同じ change のなかで資料も更新することを求める

## Capabilities

### New Capabilities

- `api-contract-doc`: サーバ API の契約を1つの資料として持ち、実装と食い違わない状態を保つ。置き場所・記述の裏取り・変更時の更新義務を規定する。`architecture-docs` が `system-structure.md` に対して持つ網を、API の契約に対して持たせる

### Modified Capabilities

なし。API の振る舞いは変えない。資料の置き場所と記述、およびそれを保つ規定だけを扱う。

## Impact

- `docs/specs/api/api-contract.md` → `docs/specs/api/contract.md`（改名と記述の修正）
- `CLAUDE.md` — Docs の節の記載
- 参照している資料とコード（`docs/specs/core/system-structure.md` / `docs/specs/architecture/*` / `docs/specs/reference/stroke-modules.md` / `docs/specs/plan/next-agent-run.md` / `server/utils/stroke/request-schemas.ts` ほか）
- API・画面・依存の変更なし
