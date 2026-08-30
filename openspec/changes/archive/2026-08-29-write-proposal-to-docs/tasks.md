## 1. 症状を先に赤にする

- [x] 1.1 `e2e/proposal-persistence.spec.ts` を新規作成。A7 で提出した**後に**接続した画面へ proposal が届くことを確かめる。既存の `stroke-exit.spec.ts` は `playwright.config.ts` が seed した `docs/proposal.md` に乗っており、A7 → 永続の経路を一度も通らない
- [x] 1.2 同じファイルで、承認が「proposal が無い」を理由に拒まないこと・出し直すと最後の1件だけが残ることを確かめる
- [x] 1.3 **修正前に赤になることを確認した**（3件とも失敗）

## 2. 受理した proposal を残す

- [x] 2.1 `session-store.ts` に `writeProposal()` を足した。在り処を返す `proposalFile()` を1本置き、`readProposal()` と共有させて置き場所の定義を1箇所に留めた（design.md - 決定3）
- [x] 2.2 `writeProposal()` が書き込み先の `docs/` を作る
- [x] 2.3 書き込みは既存の `writeAtomic` を通す
- [x] 2.4 `proposal.post.ts` を **書く → phase を進める → publish** の順にした
- [x] 2.5 `proposal.post.ts` / `session-store.ts` / `approve.post.ts` の「サーバーは書かない」旨のコメントを現状に合わせた

## 3. 緑を確認する

- [x] 3.1 `yarn build && yarn test:e2e proposal-persistence` で3件とも緑。承認まで到達し `<name>/docs/proposal.md` の存在も確認
- [x] 3.2 `yarn test`（132件）と `yarn typecheck` が通る
- [x] 3.3 `openspec validate` が通る
- [x] 3.4 E2E 全体を `yarn clean` 後に実行し **13 failed / 198 passed**。失敗13件が既存であることを確認した。`design-token`(8) と `upstream-style`(2) は単独でも失敗し、`agent-question`(3) は**私の変更を外した HEAD では 4 failed** で、変更後の方が少ない。`stroke-exit` の失敗は `.e2e-tmp/` の残骸による名前衝突で、`yarn clean` に `.e2e-tmp` / `test-results` を足して解消した

## 4. 実際の流れで確かめる

`yarn check:ws-disconnect` と同じく、作った状況ではなく本当の使い方で1回通す。

- [x] 4.1 dev を起動し、**画面から**概要を投稿してストロークを4回進めた（セッション `36e0f942-…`）
- [x] 4.2 dev を停止し、`yarn clean && yarn build` してから dev を起動した
- [x] 4.3 画面から同じセッションに再接続し、ストロークを再開して proposal 提出まで進めた（`phase: proposed` に到達）
- [x] 4.4 **画面2 に proposal の本文が表示されることを確認した**。修正前は「まだ proposal はありません」で承認ボタンすら出なかった
- [x] 4.5 画面から承認した ← **check1 成功**。`phase: approved` / `/opt/projects/todo-cli-e2e` へ昇格
- [x] 4.6 ポータルの一覧に `todo-cli-e2e` が出ることを確認した ← **check2 成功**（一覧9件目）

### 4 で判明した別件（この change の範囲外・要 change 化）

- 画面は U7（回答）の直後に U13 を呼ぶが、前の claude がまだ走っていると **409 busy** になり「AI を起動できませんでした。」で止まる。走っていた claude が終了すると誰も起こし直さず、`currentQuestion` も残る。ユーザーにできるのは同じ問いに答え直すことだけで、`strokes.json` に同じ問いへの回答が重複記録される（実測: 「実行環境」×3・「完了指定」×2・「保存場所」×2）
- AI は proposal を OpenSpec の形式（`## Why` / `## What Changes` / `## Capabilities` / `## Impact`）で書かない（実測: `## 概要` / `## 確定した決定事項`）。`CONTEXT.md` の proposal の定義から外れている

## 5. レビュー

- [x] 5.1 `typescript-reviewer` を独立2体で走らせた（`/santa-method`）。1体目は **Approve**（CRITICAL/HIGH なし。E2E が症状を捉えていることを、server を修正前に戻して再ビルドし独立に実測検証）。2体目は CRITICAL/HIGH なし・MEDIUM 3件
- [x] 5.2 読み書きを1つの口にまとめた。`readProposal` / `writeProposal` の2本を `sessionProposal(sessionId)` に統合し、`PROPOSAL_PATH` で在り処の記述を1箇所に。呼び出し元3箇所を差し替え（`ws-channels.ts` の `createRegistry()` と同じ形）
- [x] 5.3 MEDIUM: spec の核「残せなければ受理しない」が自動テストされていなかった → E2E に「残せなければ受理しない」を追加（`docs` をファイルにして書けなくし、受理が失敗し phase が `stroking` のままであることを確かめる）。単体テストは `session-store.ts` が Nitro の端（`useRuntimeConfig` / `createError`）で Nuxt 環境が要り、E2E の方が契約ごと確かめられるので採らなかった
- [x] 5.4 MEDIUM: 出し直しでの部分失敗・同時提出を design.md の Risks に記録した
- [ ] 5.5 MEDIUM: 正のドキュメントが実装と矛盾したまま残っている。**ユーザーの判断待ち**
  - `docs/specs/api/api-contract.md:55,127-128,201` — 「**ファイルは書かない。**」「**サーバーは proposal を書かない**」
  - `docs/specs/architecture/session-workflow.md:19` / `question-flow.md:43` — 図の注記
  - `playwright.config.ts:92` — コメント（動作に影響なし）
  - `docs/adr/0011-steering-stage-follows-approval.md:8` — 「承認で `docs/proposal.md` を生成したら」。これはこの change 以前から実態と食い違っていた

## 6. 残り

- [ ] 6.1 `test/server/utils/stroke/` に空ディレクトリが残っている（単体テストを退けた跡）。`rmdir` が要る
- [ ] 6.2 `e2e/ws-disconnect-probe.spec.ts` を削除する（別 change の調査用一時ファイル。`testMatch` に一致するので `yarn test:e2e` に混入する）
- [ ] 6.3 成果物を commit する
