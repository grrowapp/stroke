# tasks: adr0016-sub-fix-direct-write-allowance

判定の根拠は design.md「Decisions」。**1章の実測が終わるまで 2章の値を触らない。**

## 1. 要否を実測で確かめる

- [ ] 1.1 検証の前提を整える。他の worktree の dev サーバーが動いていないことを確かめる（`projectShareRoot` = `/opt/projects` は共有され、巡回が相手のセッションを再キックする）
- [ ] 1.2 `nuxt.config.ts` の `claude.debugLogDir` に一時的な出力先を設定する（この change の成果には含めない。5章で空へ戻す）
- [ ] 1.3 `yarn check:stroke` で flontier の1周（初回起動 → 往復 → proposal 提出 → 差し戻し → 出し直し）を通す
- [ ] 1.4 承認まで進めて steering 工程の実行をログに残す。`adr0016-sub-add-stroke-check-approval-option` が未了なら、承認はブラウザで押す（サーバーを直接叩かない）
- [ ] 1.5 生出力の `tool_use` を道具名で数え、`Skill` / `Bash(openspec *)` / `Read` / `Edit` / `Write` の**5つすべて**の回数を出す。flontier 分と steering 分を分けて数える
- [ ] 1.6 `Bash` の `tool_use` に `openspec` の呼び出しが現れるかを見る。現れないなら、ワークフロー定義（`~/.local/share/openspec/schemas/flontier-strokeflow/schema.yaml`）の `stroke.md` / `proposal.md` 生成要求はエージェントに届いていない（design.md 決定4 の分岐）
- [ ] 1.7 セッションディレクトリ直下に、エージェントが書いたファイル（下書きの `proposal.md` など）が残っているかを確かめる。`docs/proposal.md` はサーバーが書くので対象外
- [ ] 1.8 1.5〜1.7 の結果を `docs/verification/adr0016-sub-fix-direct-write-allowance/` に報告として残す。**回数は0でも記録する**——「使われなかった」が判定の根拠になる
- [ ] 1.9 実測の結果から `Write` / `Edit` の要否をそれぞれ判定する（既定は「外す」。design.md 決定2）。1.6 が「届いている」に出た場合は、instruction 側の要求を先に取り除く必要があるため、`adr0016-sub-switch-workflow-to-mcp-tools` の完了を待つ判断をここで下し、記録する
- [ ] 1.10 `Read` / `Bash(openspec *)` の回数を見て、許可を外す判断が要るなら **change を起票する**（範囲外として黙って落とさない）。起票しないと決めたならその理由を 1.8 の報告に残す

## 2. 起動フラグの値とコメントを直す

- [ ] 2.1 `nuxt.config.ts` の `--allowedTools` の値を 1.9 の判定に合わせる
- [x] 2.2 事実と違うコメント（「`Write` は develop 側の追加で、proposal を `docs/proposal.md` に書くのに要るので残す」）を消す。`docs/proposal.md` を書くのは A7 である（`server/utils/stroke/session-store.ts` の `sessionProposal().write`）
- [ ] 2.3 コメントを design.md 決定5 の形へ書き直す。外した場合は「何を・どの実測で・何が塞がるか」、残した場合は「何のために・どの実測がそれを示したか」
- [x] 2.4 `yarn test` と `yarn typecheck`（または `yarn build`）が通ることを確かめる。`test/server/utils/mcp/allowed-tools.test.ts` は設定値ではなく独自のリテラルを使っているので、値の変更では落ちないはず——落ちたらその理由を確かめる（2026-09-01: `yarn typecheck` exit 0、`yarn test` exit 0・58 files / 735 tests passed）

## 3. 上位資料への整合反映（ADR-0004）

- [ ] 3.1 design.md「上位資料への整合反映」の提案をユーザーへ示し、**承認を得る**。承認前に `docs/` を書き換えない
- [ ] 3.2 承認後、`docs/specs/core/settings-reference.md:145` の `claude.args` の JSON を実装の値に揃える
- [ ] 3.3 承認後、同ファイルに `--allowedTools` の段落を新設する（許可は実測で要ると確かめた道具だけ・成果物をファイルへ直接書ける道具を許可しない・MCP 分は呼び出しごとに追記されるので定義に含まれない）
- [ ] 3.4 `docs/specs/api/mcp-tools.md` の「操作の入口はこれだけである」と食い違いが残っていないことを読んで確かめる（同ファイルは変えない）

## 4. 外した構成で1周を通す

- [ ] 4.1 2章の値で flontier の1周（往復 → proposal 提出 → 差し戻し → 出し直し）を通す
- [ ] 4.2 承認まで進め、steering 3文書が `submit-document`（`type: "steering"`）を経て受理されることを確かめる。文書の有無だけで合格にしない（`scripts/stroke-check.ts` の `submitDocumentCount`）
- [ ] 4.3 実行の記録に、許可されていない道具を呼んで拒否された跡（`permission_denials`）が無いことを確かめる。あればその道具は要るということなので 1.9 の判定へ差し戻す
- [ ] 4.4 提出された proposal の本文を読み、下書きを置けなくなったことで内容が痩せていないかを確かめる。痩せていたら「残して根拠を書き直す」へ倒す
- [ ] 4.5 4.1〜4.4 の結果を 1.8 と同じ場所へ追記する

## 5. 片付け

- [ ] 5.1 `claude.debugLogDir` を空へ戻す（1.2 の一時設定を残さない）
- [ ] 5.2 デバッグログのファイルを手で消す（ローテーションが無く、概要・問い・proposal の全文が残る）
- [ ] 5.3 検証で作ったセッション・昇格したプロジェクトを `/opt/projects` から片付ける
- [ ] 5.4 起動した dev サーバーを停止し、ポートが解放されたことを確かめる

## 6. レビューと完了

- [x] 6.1 `openspec validate adr0016-sub-fix-direct-write-allowance --store stroke` が通ることを確かめる（2026-09-01: `Change 'adr0016-sub-fix-direct-write-allowance' is valid`）
- [ ] 6.2 実装の成果を commit する
- [ ] 6.3 `typescript-reviewer` エージェントに `/santa-method` でレビューさせ、**完全にパスするまで**指摘の対応とレビューを繰り返す
- [ ] 6.4 ユーザーから完了承認を得る
