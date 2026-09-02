## 1. 許可から本家 MCP を外す

- [x] 1.1 `server/utils/stroke/invoke.ts` の `buildRun` steering 分岐を `withMcpToolsAllowed(claude.args)`（自前の MCP ツールだけ）へ変える。`--mcp-config` の `mcpServers` は触らない——本家 MCP の**配線は続ける**（自己登録がそれで成立する）
- [x] 1.2 同じ箇所のコメントを書き直す。いまの「**本家 MCP の分も足す**——配るだけでは一覧に出るのに1つも呼べず、『呼べないものを見せてから失敗させない』を破る」は、この change が否定した根拠そのものである。**配線と許可は別で、配線の目的（起動時の自己登録）は許可なしで果たされる**ことと、`--allowedTools` は可視性を決めないことを書く（design.md D1）
- [x] 1.3 `server/utils/mcp/allowed-tools.ts` から `UPSTREAM_MCP_ALLOWED_TOOL` を落とす。`UPSTREAM_MCP_SERVER_NAME` は `invoke.ts` の `mcpConfigFor` が使うので**残す**
- [x] 1.4 `withMcpToolsAllowed` の doc コメントから、本家 MCP を足す前提で書かれた段（「steering 工程は自前サーバーに加えて本家 MCP も許可が要る」）を落とす。関数自体は複数のツール名を取れるままでよい（形は変えない）
- [x] 1.5 `import` の整理（`invoke.ts` の `UPSTREAM_MCP_ALLOWED_TOOL`）と `yarn typecheck` の通過を確かめる

## 2. 案内を許可と揃える

- [x] 2.1 `server/mcp/tools/get-steering-guide.ts` の節「## 本家 MCP は使わない」を書き直す。**見出しは変えない**（テストが見出しで節を引く）。「配線されているが**許可されていないので呼んでも通らない**」を事実として述べ、いまの規範だけの書きぶり（「この工程では1つも呼ばない」）をその裏づけの上に置く（design.md D2）
- [x] 2.2 同じ節の `approvals` の段を残す。**理由の説明として要る**——口頭の承認を受け付けず問い合わせ続けることを促すこと（本家 2.2.5 `dist/tools/approvals.js` の `VERBAL APPROVAL NOT ACCEPTED` / `Poll status with: approvals action:"status"`）、無人の実行は待ち続けて打ち切られること、**この工程の終わりは3文書が受理されたときで承認は終わりの条件ではない**こと
- [x] 2.3 節に本家の他4本（`spec-workflow-guide` / `steering-guide` / `spec-status` / `log-implementation`）を呼ばない理由も1行ずつ添えるか判断する。**足すなら簡潔に。** 案内が長くなるほど読み飛ばされる。判断の根拠を節のコメントかタスクの記録に残す
  - 判断: 足す。理由を1行も添えないと、一覧に並ぶ5本のうち何が・なぜ呼べないのかが分からず、探りに行くコストが残る（design.md D2 の代替案不採用の理由と同じ）。`spec-workflow-guide`/`steering-guide` は既存の1文（本家のワークフロー向けで提出の入口が違う）に相乗り、`spec-status`/`log-implementation` は新規に1文（`.spec-workflow/` を直接読み書きする経路で、この工程の入口ではない）を足した。5本まとめて「許可されていないので呼んでも実行されない」と冒頭で先に述べ、個別の理由は各ツールの性質に応じた最小限にとどめた
- [x] 2.4 `server/mcp/tools/get-guide.ts`（flontier）は**触らない**ことを確認する。flontier 工程には本家 MCP を配線も許可もしていない（`invoke.test.ts`「flontier 工程には本家 MCP を渡さない」「…許可しない（配ってもいない）」）。proposal の Impact は `get-guide.ts` も挙げているが、実装を読んだ限り本家 MCP に触れる記述が無い。触らない判断とその理由を記録に残す
  - 確認: `server/mcp/tools/get-guide.ts` を読んだが、本家 MCP・`mcp__specworkflow`・`spec-workflow` への言及は無い（唯一の言及は「やらないこと」節の `openspec` コマンドを叩くな、で無関係）。`test/server/utils/stroke/invoke.test.ts` の「flontier 工程には本家 MCP を渡さない」「flontier 工程には本家 MCP を許可しない（配ってもいない）」とも整合する。**触らない。** proposal の Impact 欄の記載は実装の実態と食い違っていたが、design.md も get-guide.ts の変更を要求していないため、design を正として従った

## 3. テストを実装へ揃える

- [x] 3.1 `test/server/utils/stroke/invoke.test.ts:194` の「steering 工程は本家 MCP も `--allowedTools` に載せる（配るだけで呼べない状態にしない）」を反転させる。**否定だけにしない**——`--allowedTools` ごと落ちても通るテストになる。フラグが1本だけ在ること・`mcp__stroke-board` が載っていることを肯定で見た上で、`mcp__specworkflow` が載っていないことを見る（`flontier 工程には本家 MCP を許可しない` が採っている書き方に揃える）
- [x] 3.2 同じテストで、**本家 MCP が `--mcp-config` の `mcpServers` には残っている**ことを引き続き検証する（配線は続けるため）。許可と配線が別であることが、テストの上でも読めるようにする
- [x] 3.3 `test/server/utils/mcp/allowed-tools.test.ts` が `UPSTREAM_MCP_ALLOWED_TOOL` に依存していないか確かめ、依存していれば自前のツール名だけを使う形へ直す
  - 確認: 依存していない。`UPSTREAM_MCP_SERVER_NAME` / `UPSTREAM_MCP_ALLOWED_TOOL` のどちらも import していない（import しているのは `MCP_SERVER_ALLOWED_TOOL` と `withMcpToolsAllowed` のみ）。修正不要
- [x] 3.4 `test/server/mcp/tools/get-steering-guide.test.ts` の `REQUIRED` を、2章の文言に合わせて見直す。節「本家 MCP は使わない」の必須の語（`/approvals/` `/呼ばない/`）と最低文字数 230 を満たしているか確かめ、必要なら「許可されていない／通らない」を見る正規表現を足す。**節の並びも変えない**
  - 対応: `/許可/` `/通らない/` を足した（4正規表現）。新しい本文はこれらを含み、既存の230文字も本文が増えたため余裕で満たす（変更不要）
- [x] 3.5 `yarn test`（`vitest run`）と `yarn typecheck` を通す
  - `yarn test`: 全58ファイル・735テスト pass
  - `yarn typecheck`: exit code 0。`canvas-confetti` の型が無いという既存の無関係なエラー4件（`CreationNotice.vue` / `PrototypeCelebrationA/B/C.vue`）が出るが、この change の変更前から存在する（この change が触っていないファイル）

## 4. 実機で1周して確かめる

- [x] 4.1 `claude.debugLogDir` を一時的に設定して `yarn check:stroke --approve` を回し、承認後の steering 工程まで進める（`--approve` を渡さないと steering の着地を見られない）
  - （実測 2026-09-01: `claude.debugLogDir` を `.stroke-check/debug-log` に一時設定し、`yarn check:stroke --approve` を2周。両周とも承認 → steering 着地まで進んだ）
- [ ] 4.2 デバッグログで **本家 MCP が起動し登録簿へ自己登録している**ことを確かめる（本家の stderr `Project registered: <id>`、または `${SPEC_WORKFLOW_HOME}/activeProjects.json` に対象プロジェクトが現れること）。**許可を外しても登録が成立する**ことがこの change の前提である
- [x] 4.3 steering の取得・提出（`get-steering` / `submit-document` の `type: "steering"`）が `project_not_registered` を返さず、3文書が揃うことを確かめる
  - （実測 2026-09-01: 2周とも steering 実行で `submit-document`（`type: steering`）3回が成功し、文書3本が揃った）
- [ ] 4.4 デバッグログのツール一覧に**本家 MCP のツールが残っている**ことを確かめる（`--allowedTools` は可視性を決めない、の実測。design.md の前提）。残っていなければ前提が崩れるので、design.md D1 の根拠3を書き直してからやり直す
  - （2026-09-01 追記: `permission_denials` を全走査したが0件、`mcp__specworkflow` の `tool_use` も0件。エージェントが呼ぼうとしていないため拒否も出ず、一覧に出ているかどうかは今回の記録からは判定できなかった）
- [x] 4.5 エージェントが本家 MCP のツールを呼びに行ったかを見る。**呼んだなら、拒否がどう返り、何ターン消費したかを記録する**（design.md の Risks に挙げた未実測項目）。呼んでいないなら、案内が効いていることの裏づけとして記録する
  - （実測 2026-09-01: 2周とも `mcp__specworkflow` 呼び出し0回。呼んでいない側の記録として — 案内が効いていることの裏づけ）
- [x] 4.6 検証後に `claude.debugLogDir` を元に戻す。起動した dev サーバー・claude の子プロセスが残っていないことを確かめる（`pgrep -f claude` / ポートの解放）
  - （実測 2026-09-01: `claude.debugLogDir` を `''` に戻した（`nuxt.config.ts:376`）。デバッグログファイルも削除し残0件を確認。`yarn dev`（PID 379862、3599）を停止し `ss -tlnp | grep 3599` 該当なし＝ポート解放、`ps -p 379862` 該当なし。`pgrep -fa "claude -p"` にも claude の実行は残っていない）

## 5. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲済み）

- [x] 5.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。提案の内容は同 change の ticket に一覧（この change の分は `M1` / `R1` / `A1`）。**この change では `docs/` を書き換えない**
- [x] 5.5 `openspec/tickets/adr0016-sub-fix-upstream-mcp-allowance.md` の `status` を進める（`needs-triage` のまま閉じない）——確認したところ frontmatter は既に `status: Tasks`（tasks.md に未完のタスクが残っているため。`docs/agents/triage-labels.md` の語彙と一致）。変更不要

## 6. レビューと完了

- [ ] 6.1 `typescript-reviewer` エージェントに `/santa-method` でレビューさせる。**レビューが完全にパスするまで続ける。** 各周の指摘と対応をこのタスクの下に記録する
- [ ] 6.2 4章の検証結果と 6.1 のレビュー結果を添えて、ユーザーから完了承認を得る。承認までは完了・archive に進まない
