# tasks — connect-portal-and-strokes

design.md の Open Questions（共有の置き場の既定値・steering の定型の本文）は 1 で決着させる。1 の承認が下りるまで 2 以降に着手しない。

## 1. 設定の改定（ADR-0004 の手続き）

- [ ] 1.1 `docs/specs/core/settings-reference.md` の改定案を作る。置き場2件（`NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT`）を共有の置き場1件へ統一し、既定値の案を添える
- [ ] 1.2 同じ改定案に steering の定型1キーを足す。本文の案も添える（定型はコードに持たない — `ai-invocation`）
- [ ] 1.3 改定案をユーザーに提示し、承認を得る。承認後に `settings-reference.md` を更新する

## 2. 置き場の統一

- [ ] 2.1 `server/utils/stroke/settings.ts` の `DEFAULT_SESSIONS_ROOT` / `DEFAULT_PROJECTS_ROOT` と `resolveSessionsRoot()` / `resolveProjectsRoot()` を、共有の置き場1本に置き換える
- [ ] 2.2 `describePathsError()` の検査対象を新しい環境変数1件に合わせる
- [ ] 2.3 `server/utils/stroke/paths.ts` の `sessionDir()` と `projectDir()` を同じ親から組み立てる
- [ ] 2.4 `nuxt.config.ts` の `runtimeConfig` を追随させる（置き場1件・`claude` に steering の定型1キー）
- [ ] 2.5 `server/plugins/00.startup-checks.ts` が新しい置き場を見るようにする

## 3. 入口: 作成の可否判定を外す

- [ ] 3.1 `server/utils/control/actions.ts` の `resolveDirectoryActions()` を `register` だけにし、コメントの前提（接続先が決まったらここで見る）を実態に合わせて書き直す
- [ ] 3.2 `shared/types.ts` から `DirectoryActions.create` と理由コード `target-undecided` を消す
- [ ] 3.3 `app/pages/projects/index.vue` の作成ボタンから `disabled` と理由の表示を外し、押せない理由の集約（`actions-blocked`）を登録だけに絞る

## 4. 入口: モーダルで開く

- [ ] 4.1 作成ボタンの押下で概要入力のページへ遷移させる（`app/pages/strokes/index.vue`。パスは動かさない — design D1）
- [ ] 4.2 ストロークの3画面（`app/pages/strokes/index.vue` / `[sessionId]/index.vue` / `[sessionId]/proposal.vue`）の中身を `UModal` で開く。`fullscreen`・閉じ操作なし。中身と流れは変えない
- [ ] 4.3 リロードで同じ途中画面がモーダルとして開くことを確かめる（復帰は URL が担う）

## 5. proposal の書き手を claude へ移す

- [ ] 5.1 `assets/.claude/skills/guidance/SKILL.md` に、proposal 全文を `docs/proposal.md` へ書いてからそのパスを `/proposal` に渡すことを明記する
- [ ] 5.2 `server/api/strokes/[id]/proposal.post.ts` から `writeProposal()` の呼び出しを外す（受理・W2 配信・phase 更新は残す）
- [ ] 5.3 `server/utils/stroke/session-store.ts` の `readProposal()` の読み先を `docs/proposal.md` に変え、`writeProposal()` を削る。`SESSION_FILES.proposal` の位置づけを合わせる

## 6. 出口: 承認を rename 昇格にする

- [ ] 6.1 `server/utils/stroke/project.ts` の `generateProject()` を `promoteSessionToProject(sessionId, name)` に置き換える。衝突確認 → `rename` の順で行い、`rename` の暗黙の置き換えに頼らない（design D3）。`assertProjectName()` は据え置き
- [ ] 6.2 `server/api/strokes/[id]/approve.post.ts` を昇格の呼び出しに差し替える。`state.json` は rename の前に書く
- [ ] 6.3 昇格の失敗時にセッションディレクトリが元の名前のまま残り、phase が `proposed` のままであることを確かめる

## 7. AI 起動の引数化

- [ ] 7.1 `server/utils/stroke/claude.ts` の `runClaude()` から `readClaudeConfig()` と `useRuntimeConfig()` の参照を外し、起動定義（`command` / `args`）と cwd を引数で受け取る
- [ ] 7.2 `server/utils/stroke/ai.ts` の `invokeAi(sessionId, run)` を作る。`run = { launch, cwd, prompts, prepare? }`。初回／継続の判定は中に残す
- [ ] 7.3 `invokeAi` の返り値を `'submitted' | 'failed'` にし、`markInvocationFailed()` を呼び出し側へ出す
- [ ] 7.4 `server/api/strokes/[id]/invoke-agent.get.ts` を、設定 JSON を引いて無加工で渡す形にする（cwd はセッションディレクトリ、`prepare` に `initSessionOpenspec`）。失敗時の `state.json` 更新をここで行う

## 8. 出口: steering 工程

- [ ] 8.1 steering の実行の記録（session-id → running / false）を持つモジュールを足す。`running.ts` と同じくメモリで持つ
- [ ] 8.2 承認の成功後に steering を起動する処理を足す。`--mcp-config` の JSON を生成先パスから組み立て（本家 `spec-workflow-mcp` の起動の形を実機で確認して確定する）、steering の定型と cwd＝生成先を渡し、完了を待たずに `invokeAi` を呼ぶ
- [ ] 8.3 起動時に記録を running にし、`invokeAi` が `'failed'` を返したら false に変える
- [ ] 8.4 提出の告知を受ける endpoint を足す。`phase` を見ず、記録を消して `notifySubmission()` を呼ぶだけにする
- [ ] 8.5 告知を叩くセッション API スキルを `assets/.claude/skills/` に足し、`guidance` の一覧に載せる
- [ ] 8.6 retry 対象（false の session-id）の一覧を返す endpoint を足す。取得で状態を変えない
- [ ] 8.7 巡回を `server/plugins/` に足す（`upstream.ts` の `setInterval` と同じ形）。8.6 を拾って順に起動し直すだけにし、条件判定を持たせない。リトライは新しい session-id で起動する

## 9. 出口: 承認後の画面

- [ ] 9.1 `app/pages/strokes/[sessionId]/proposal.vue` を、承認の成功でモーダルを閉じて `/projects` へ戻る形にする

## 10. テスト

- [ ] 10.1 `server/utils/control/actions.test.ts` を「作成の可否を返さない」に更新する
- [ ] 10.2 rename 昇格のユニットテスト（成功・衝突・失敗時に元の名前で残る）
- [ ] 10.3 引数化した `invokeAi` / `runClaude` のユニットテスト（渡した起動定義・定型・cwd がそのまま使われる／`prepare` 無しで初回が走る）
- [ ] 10.4 steering の実行の記録のユニットテスト（起動で running・タイムアウトで false・告知で消える・巡回が false だけを拾う）
- [ ] 10.5 告知の口と retry 対象の口のユニットテスト（承認済みでも告知は通る／取得は状態を変えない）
- [ ] 10.6 E2E: 作成 → モーダルで概要入力が出る → リロードで同じ場面に戻る
- [ ] 10.7 E2E: 承認 → モーダルが閉じて `/projects` に戻る
- [ ] 10.8 既存テスト一式（Playwright E2E を含む）を通す

## 11. 文書の追随

- [ ] 11.1 `docs/specs/api/api-contract.md` — A7 でサーバが `proposal.md` を書く記述、承認の 409 の生成前提、追加した2口（提出の告知・retry 対象）
- [ ] 11.2 `docs/specs/architecture/question-flow.md` — proposal.md を書く Note
- [ ] 11.3 `docs/specs/architecture/session-workflow.md` — セッション置き場のパス
- [ ] 11.4 `docs/specs/plan/portal-stroke-entrance.md` の「未決: モーダルの開き方」を、決定（案A・`relocate-stroke-routes` は据え置き）に書き換える

## 12. 仕上げ

- [ ] 12.1 `openspec validate connect-portal-and-strokes --strict` を通す
- [ ] 12.2 ここまでの成果物を1つの commit にまとめる
