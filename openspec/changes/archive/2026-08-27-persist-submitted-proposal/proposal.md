## Why

A7（`POST /api/strokes/:id/proposal`）が受理した proposal を、どこにも保存していない。proposal のファイルは「AI がセッションの時点から `docs/proposal.md` に置く」前提になっているが、**その指示はどこにも無い**。ワークフロースキーマ `flontier-strokeflow` の proposal artifact が書くのは `openspec/changes/draft-proposal/proposal.md` であり、`/proposal` スキルは渡されたパスの中身を POST するだけである。結果として `docs/proposal.md` は誰も書かない。

そのため、把握完了から先の工程が3箇所で止まる。

- **承認**（U10）は `docs/proposal.md` を読めず、409（proposal が見つからない）で止まる
- **画面2** は W2 の接続時配信が同じファイルを読むため、リロードすると proposal が消える
- **steering の工程**（[ADR-0011](../../../docs/adr/0011-steering-stage-follows-approval.md)）は、承認を通しても AI が読む proposal が無く、そこでブロックする

`connect-portal-and-strokes`（未 archive）の design が Risk として挙げた「claude が `docs/proposal.md` を書かない」が、そのまま現実になっている。

## What Changes

- A7 が受理した proposal の全文を、セッションディレクトリの `docs/proposal.md` へ保存する。差し戻し後の再提出では上書きし、`docs/` が無ければ作る
- **承認は変更しない。** 昇格はセッションディレクトリの改名だけなので、保存されたファイルはそのまま `<name>/docs/proposal.md` として引き継がれる（ADR-0011 の記述と一致する）。承認時に別の場所へ書き出す処理は入れない
- steering の定型（`claude.steeringPrompt`）に proposal の在り処を明示する。steering の起動に許すツールは `Read` だけで探索系（`Glob` / `LS` / `Grep`）が無く、`write-steering-v2` の記述は「`proposal.md` を読め」とパスが曖昧なため、置いただけでは AI が辿り着けない
- **確定済みの決定を1つ覆す。** `connect-portal-and-strokes` が入れた「A7 は受理した proposal をファイルへ書き出してはならない（MUST NOT）／proposal を書くのは AI であり、システムのコードは作っても上書きしてもならない（MUST NOT）」を撤回する。書き手を AI に置く設計には、AI へそう指示する仕組みが存在しない。受理した側が書けば、承認・W2・steering が読む前提は仕組みとして満たされる。同 change は未 archive なので、その delta（`specs/api/stroke/proposal/spec.md`・`specs/project/generation/spec.md`）も併せて直す

## Capabilities

### New Capabilities

- なし

### Modified Capabilities

- `agent-api`: A7 の保存先を `docs/proposal.md` と明示し、再提出時の上書きと、保存先ディレクトリが無い場合の作成を規定する
- `ai-invocation`: 承認後の steering の起動へ渡す定型が、proposal の在り処を含むことを規定する

## Impact

コード。

- `server/api/strokes/[id]/proposal.post.ts` — 受理した本文を保存する
- `server/utils/stroke/session-store.ts` — `writeProposal()` を戻す（`docs/` の作成を含む）。`readProposal()` は現状のまま
- `server/utils/stroke/session-core.ts` — `writeAtomic()` が親ディレクトリを作らないため、その手当てが要る
- `server/api/strokes/[id]/approve.post.ts` — 変更なし。proposal が無ければ承認しない 409 ガードはそのまま活きる

設定と文書。

- `nuxt.config.ts` の `claude.steeringPrompt`、および `docs/specs/core/settings-reference.md`（設定の正。改定にはユーザー承認が要る・[ADR-0004](../../../docs/adr/0004-settings-reference-is-authoritative.md)）
- `docs/specs/api/api-contract.md` — A7 の「ファイルは書かない」と U10 の前提の記述
- `docs/specs/architecture/session-workflow.md` — 置き場の表の「claude が書く（サーバーは書かない）」

未 archive の change。

- `openspec/changes/connect-portal-and-strokes/specs/api/stroke/proposal/spec.md` と同 `specs/project/generation/spec.md` — archive したときにこの change の決定が戻ってしまわないよう、同じ内容へ揃える

テスト。

- A7 のユニット（保存する・再提出で上書きする・`docs/` が無ければ作る）
- E2E（`e2e/stroke-exit.spec.ts`）は fixture で `docs/proposal.md` を置いており、そのまま通る
