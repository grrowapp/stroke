# tasks — connect-portal-and-strokes

design.md の Open Questions（保存先の既定値・steering の定型の本文・リトライ上限の既定値）は 1 で決着させる。1 の承認が下りるまで 2 以降に着手しない。

## 1. 設定の改定（ADR-0004 の手続き）

- [x] 1.1 `docs/specs/core/settings-reference.md` の改定案を作る。保存先2件（`NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT`）を `SPEC_WORKFLOW_SHARED_ROOT` の1件へ統一し、既定値の案を添える
- [x] 1.2 同じ改定案に steering の定型1キーとリトライ上限1キーを足し、本文・既定値の案を添える
- [x] 1.3 改定案をユーザーに提示し、承認を得る。承認後に `settings-reference.md` を更新する

## 2. 保存先の統一と `settings.ts` の撤去

承認時の追加決定（2026-08-25）:

1. ストローク側の設定は `nuxt.config.ts` と `app/app.config.ts` の2つだけに置き、**環境変数から設定を読まない**
2. `server/utils/stroke/settings.ts` はファイルごと廃止する
3. 共有モジュールは設定を引かず引数で受け取る（`specs/agent/invocation` の D5 を core 全体へ広げる）
4. 保存先はポータルの `projectsParentPath` と**同じ場所を指す必要がある**ため、2つに分けず `projectShareRoot` 1件へ畳む（分けると食い違いで承認したプロジェクトが一覧から消える）

- [x] 2.1 `nuxt.config.ts` に値の実体を直接書く。`projectShareRoot` を先頭に置き、`claude` に `steeringPrompt` と `maxRetries` を足す
- [x] 2.2 `server/utils/stroke/paths.ts` の `sessionDir()` / `projectDir()` が保存先を引数で受け取り、同じ親から組み立てる
- [x] 2.3 `session-core.ts` が保存先を引数で受け取る。endpoint 側は `session-store.ts`（Nitro 専用）が、CLI 側は `scripts/session.ts` が解決して渡す
- [x] 2.4 固定値（`SESSION_FILES` / `OPENSPEC_DIR` / `CLAUDE_TIMEOUT_MS` / `PROJECT_NAME_PATTERN` / `LOG_PREFIX` ほか）を使う側のモジュールへ移す
- [x] 2.5 設定の読み口を `server/utils/stroke/config.ts` 1本にする（zod 検証・`describeClaudeArgsError`）。`readiness.ts` は `projectShareRoot` が絶対パスで書き込めることを検査する
- [x] 2.6 `scripts/session.ts` が `nuxt.config.ts` を import して値を得る
- [x] 2.7 `server/utils/stroke/settings.ts` を削除する。あわせて `prompt.ts`（読み替えだけ）と `claude-config.ts`（`config.ts` に畳んだ）も削除する
- [x] 2.8 `server/plugins/00.startup-checks.ts` が新しい保存先を見るようにする
- [x] 2.9 ポータル側を `projectShareRoot` に追随させる（`server/utils/config.ts` の `projectsParentPath` を畳む）
- [x] 2.10 `.env.example` からストローク側2行と `NUXT_PROJECTS_PARENT_PATH` を消し、README の設定の記述を直す

## 3. 入口: 可否判定の撤去

- [x] 3.1 `server/utils/control/actions.ts` の `resolveDirectoryActions()` を仕組みごと消す（登録の可否も返さない）
- [x] 3.2 `shared/types.ts` から `DirectoryActions` と理由コードを消す
- [x] 3.3 `app/pages/projects/index.vue` — 作成はただのボタン（可否をサーバーに聞かない）、登録は非活性固定にする

## 4. 入口: モーダルで開く

- [x] 4.1 作成ボタンの押下で概要入力のページへ遷移させる（design D1。パスは動かさない）
- [x] 4.2 ストロークの3画面の中身を `UModal`（fullscreen・閉じ操作なし）で開く。中身と流れは変えない
- [x] 4.3 リロードで同じ途中画面がモーダルとして開くことを確かめる（復帰は URL が担う）

## 5. proposal の書き手を claude へ移す

- [ ] 5.1 `assets/.claude/skills/guidance/SKILL.md` に、proposal 全文を `docs/proposal.md` へ書いてからそのパスを `/proposal` に渡すことを明記する
  - **permission で編集できず保留。** `.claude/settings.json` の `deny: "Edit(./.claude/**)"` が `assets/.claude/...` にも一致する。deny を絶対パス指定に直せば通る
- [x] 5.2 `server/api/strokes/[id]/proposal.post.ts` から `writeProposal()` の呼び出しを外す（受理・W2 配信・phase 更新は残す）
- [x] 5.3 `server/utils/stroke/session-store.ts` の `readProposal()` の読み先を `docs/proposal.md` に変え、`writeProposal()` を削る

## 6. 承認 = rename 昇格

- [x] 6.1 `server/utils/stroke/project.ts` の `generateProject()` を `promoteSessionToProject(sessionId, name)` に置き換える。衝突確認 → rename の順（design D3）
- [x] 6.2 承認処理（U10）を昇格の呼び出しに差し替える。rename 失敗時は phase を `proposed` へ書き戻し、**`approved` かつ未改名の宙吊りを作らない**
- [x] 6.3 昇格の失敗時にセッションが元の名前・`proposed` のまま操作可能に残ることをテストで確かめる

## 7. API の再編（U 系 path・U13 cwd・U12 path）

**7.1〜7.3・7.5・7.6 はユーザー判断で見送り（2026-08-25）。** path の移設は入口・出口の接合には要らない。cwd の引数化（7.4）だけが接合に効くので、path を動かさずに実施した。

- [ ] 7.1 U 系・W 配信のルートを `/api/sessions` 系へ移す（`server/api/` のディレクトリ移設。旧 path の互換は残さない）
- [ ] 7.2 U11 を `DELETE /api/sessions/:id` にする
- [ ] 7.3 U12 の応答の各件に path と `invocation` を載せる
- [x] 7.4 U13 が cwd を引数で受け取るようにする（自分で導出しない）— path は動かさず、クエリ `cwd` で受ける
- [ ] 7.5 画面（composables・pages）の API 参照 path を追随させる。ストロークの起動キックは U12/U2 由来の path を cwd として渡す
- [ ] 7.6 エージェントスキル（`assets/.claude/skills/`）の U3 参照 path を `/api/sessions/:id/strokes` へ直す。A 系の path は変えない

## 8. AI 実行の引数化と invocation の4値

- [x] 8.1 `shared/stroke.ts` の `Invocation` に `error` を加えて4値にする。`approved` でも `invocation` を持たせる（`state.json`）
- [x] 8.2 A8 `POST /api/strokes/:id/submission` を新設する。値（`running` / `idle` / `failed` / `error`）を指定して `invocation` を変えるだけの口。存在しない id はエラー
- [x] 8.3 `server/utils/stroke/claude.ts` の `runClaude()` から `useRuntimeConfig()` の参照を外し、起動定義と cwd を引数で受け取る
- [x] 8.4 `invokeAi(id, run)` を作る。`run = { launch, cwd, prompts, prepare? }`。初回/継続の符合判定は中に残す
- [x] 8.5 invokeAi の `invocation` 書き込みを全部 A8 経由にする: 起動で `running`、output stream で完了検知して `idle`、タイムアウトで `failed`
- [x] 8.6 リトライ回数を `state.json` 側に持ち、invokeAi が上限を判定する。上限到達は起動せず `error`
- [x] 8.7 サーバー起動時に `running` の残骸を `failed` へ倒す処理を `server/plugins/` に置く（design Risks）

## 9. steering の起動

- [x] 9.1 承認処理が rename 成功の直後に U13 を cwd＝生成先の path で叩く（完了を待たない）。昇格失敗時は叩かない
- [x] 9.2 steering の実行では、U13 の実装が steering の定型を設定から引き、mcp-config を cwd から導出して args に足す（本家 `spec-workflow-mcp` の起動の形を実機で確認して確定する）

## 10. 巡回

- [x] 10.1 `server/plugins/` に巡回を足す（`upstream.ts` の `setInterval` と同じ形）。U12 の応答から `invocation === 'failed'` の件だけを取り、path を cwd に添えて自身の U13 を HTTP で叩く。他の判定を持たない

## 11. error のユーザー引き渡し

- [x] 11.1 画面が `invocation` の `error` を表示し、ユーザーが再実行（U13 キック・回数リセット）か削除（U11）を選べるようにする

## 12. テスト

- [x] 12.1 可否判定撤去の追随（`actions.test.ts` の削除または置き換え）
- [x] 12.2 rename 昇格のユニット（成功・衝突・失敗時に `proposed`・元名で残る・宙吊りが無い）
- [x] 12.3 引数化した `invokeAi` / `runClaude` のユニット（渡した起動定義・定型・cwd がそのまま使われる）
- [x] 12.4 `invocation` 遷移のユニット（起動で `running`・完了検知で `idle`・タイムアウトで `failed`・上限で `error`・A8 経由で変わる）
- [x] 12.5 巡回のユニット（`failed` だけ拾う・path を cwd に渡す・`running` / `idle` / `error` は拾わない）
- [x] 12.6 E2E: 作成 → モーダルで概要入力 → リロードで同じ場面に戻る
- [x] 12.7 E2E: 承認 → モーダルが閉じて `/projects` に戻る
- [x] 12.8 既存テスト一式（Playwright E2E を含む）を通す

## 13. 文書の追随

- [x] 13.1 `docs/specs/api/api-contract.md` — U 系の path 変更・U11 DELETE 化・U12 の path と `invocation`・U13 の cwd 引数・A8 の追加・A7 の保存廃止・承認 409 の前提
- [x] 13.2 `docs/specs/architecture/question-flow.md` — proposal.md を書く Note
- [x] 13.3 `docs/specs/architecture/session-workflow.md` — 保存先のパス・invocation の4値
- [x] 13.4 `docs/specs/plan/portal-stroke-entrance.md` の「未決: モーダルの開き方」を決定（ページ遷移・`relocate-stroke-routes` は据え置き）に書き換える

## 14. 仕上げ

- [x] 14.1 `openspec validate connect-portal-and-strokes --strict` を通す
- [ ] 14.2 `typescript-reviewer` エージェントに `/santa-method`（`santa-ts-review`）でレビューを実行させる。独立2体が**両方 PASS するまで**直して繰り返す
- [x] 14.3 ここまでの成果物を1つの commit にまとめる
