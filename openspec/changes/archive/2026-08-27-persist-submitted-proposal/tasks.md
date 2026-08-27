## 1. 保存の実装

- [x] 1.1 `server/utils/stroke/session-store.ts` に `writeProposal(sessionId, proposal)` を戻す。書き先は `docs/proposal.md`（`PROJECT_DOCS_DIR` / `PROJECT_PROPOSAL_FILE` を使う）。書く直前に `docs/` を `mkdir(recursive: true)` する（design D3）
- [x] 1.2 `readProposal()` の doc コメントから「サーバーは書かない」を外し、書き手が A7 であることに直す
- [x] 1.3 `server/api/strokes/[id]/proposal.post.ts` で、検証の後・マーカー追記の前に `writeProposal()` を呼ぶ。順序は「検証 → 保存 → マーカー → phase → W2 配信 → 提出の記録」（design D2）
- [x] 1.4 保存に失敗したら phase を進めず・配信もせずに失敗を返すことを確かめる（`writeAtomic` の失敗が 500 として上がる経路のまま通す）
- [x] 1.5 A7 の doc コメント（「**ファイルは書かない。**」の段落）を、保存する仕様に書き換える
- [x] 1.6 `server/api/strokes/[id]/approve.post.ts` は変更しない。409 ガードと doc コメントの「サーバーは proposal を書かない」だけを、A7 が書く前提の記述に直す（design D4）

## 2. steering へ在り処を渡す

- [x] 2.1 `nuxt.config.ts` の `claude.steeringPrompt` に proposal の在り処（`docs/proposal.md`）を含める。定型は1本のまま（design D5）
- [x] 2.2 `docs/specs/core/settings-reference.md` の `claude.steeringPrompt` の項と既定値の表を、2.1 に合わせて改定する（設定の正・ADR-0004）

## 3. 文書の追随

- [x] 3.1 `docs/specs/api/api-contract.md` — A7 の「ファイルは書かない」を保存する記述へ、U10 の前提（「サーバーは proposal を書かない」）を A7 が書く前提へ直す
- [x] 3.2 `docs/specs/architecture/session-workflow.md` — 置き場の図の `docs/proposal.md` の注記「claude が書く（サーバーは書かない）」を「A7 が書く」に直す
- [x] 3.3 `docs/specs/architecture/question-flow.md` に proposal.md を書く Note があれば、書き手を A7 に直す
- [x] 3.4 AI が書くワークフロー artifact（`openspec/changes/draft-proposal/proposal.md`）と、サーバーが書く `docs/proposal.md` の役割の違いを `docs/specs/api/api-contract.md` に1行残す（design Risks）

## 4. 未 archive の change との整合

- [x] 4.1 **着手前にユーザーの合意を取る。** 他の change の成果物に触れるため（design D6）
- [x] 4.2 `openspec/changes/connect-portal-and-strokes/specs/api/stroke/proposal/spec.md` の「受理した proposal をファイルへ書き出してはならない（MUST NOT）」を、保存する要件へ直す
- [x] 4.3 `openspec/changes/connect-portal-and-strokes/specs/project/generation/spec.md` の「proposal を書くのは AI ／システムのコードは作っても上書きしてもならない（MUST NOT）」を、A7 が書く前提へ直す。昇格が改名だけである要件はそのまま残す
- [x] 4.4 同 change の `design.md` D4 と、Risk「claude が `docs/proposal.md` を書かない」の記述を現状に合わせる

## 5. テスト

- [x] 5.1 A7 のユニット: 受理した本文が `docs/proposal.md` に保存される
- [x] 5.2 A7 のユニット: `docs/` が無い状態の提出で `docs/` が作られる
- [x] 5.3 A7 のユニット: 再提出で同じファイルが上書きされ、前の版が残らない
- [x] 5.4 A7 のユニット: 保存に失敗したとき phase が `proposed` に進まず、W2 へ配信されない
- [x] 5.5 W2 のユニットまたは結合: 提出の後に接続すると、保存された proposal が接続時配信で届く
- [x] 5.6 既存テスト一式（`yarn test` と Playwright E2E）を通す。`e2e/stroke-exit.spec.ts` は fixture で `docs/proposal.md` を置いているのでそのまま通ること

## 6. 仕上げ

- [x] 6.1 `openspec validate persist-submitted-proposal --strict` を通す
- [x] 6.2 成果物を1つの commit にまとめる
- [x] 6.3 `typescript-reviewer` エージェントに `/santa-method`（`santa-ts-review`）でレビューを実行させる。レビューが完全にパスするまで直して繰り返す
