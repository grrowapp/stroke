# CLAUDE.md

## 前提

**`develop` は各 worktree の親ブランチであり、合流点である。その実体はリポジトリ本体
（`.git` をディレクトリとして持つ側）に展開されている。以下「親」はこのディレクトリを指す。**

`openspec/`・`.spec-workflow/` は**運用と管理の資料**。親に有るものが唯一の正

- **`openspec/`・`.spec-workflow/` は親だけが持つ**
- **worktree に `sparseCheckout = true` を設定し、`openspec/`・`.spec-workflow/` を除外する**
- **`openspec/`・`.spec-workflow/` への読み書きは親の実体へ向ける**

### issue-tracker：`docs/agents/issue-tracker.md`

issue-trackerには、change-id の命名・ticket の起票・artifact・参照の方向・更新対応・ADR の archive・repo 直下のフォルダの扱い・進捗と検証などを説明している。作業の状態が変化した場合に参照すること

例： change を起票する / artifact を書く / specs に delta を入れる / specs と docs の食い違いを見つけた / ADR の内容が docs に確定した / change を閉じる

## Dev サーバー

- 起動・ビルドなどの実行は **package.json の scripts 経由**（`yarn dev` / `yarn build` / `yarn test` …）で行う。`node .output/server/index.mjs` のような直接起動をしない
- ポートの既定は **3399**。**固定ではなく、並走させる worktree はずらす**（2026-08-31 時点で 3399 以外は pre5 の 3599 だけ）。同じ値が2箇所にある — ストロークの `claude.apiBaseUrl`（正は `docs/specs/core/settings-reference.md`）と `nuxt.config.ts` の `devServer.port`（起動時のビルド設定でストローク側設定ではないため settings-reference の対象外。`nuxt.config.ts` が実体）。**変えるときは必ず両方を揃えて変える**——片方だけ変えると、起動した claude は開いていないポートへ MCP 接続を試みる
- 3000 はこのマシンで別のプロセスが使用中。使わない。5000 は本家 spec-workflow の dashboard
- E2E の STUB_PORT / APP_PORT（`playwright.config.ts`）は**実行のたびに 50000 から上へ空きを探して取る**（上限 60000）。固定値ではないので、worktree を並べて同時に `yarn test:e2e` を回してよい。どのポートを使ったかは Playwright の起動ログに出る
  - dev サーバーのポートとは要件が違う。人がブラウザで繋ぎに行く dev は既定を決めて worktree ごとにずらすが、E2E は立てて捨てるだけなので空きを取る

## Worktree 運用

worktree = `git worktree` で切った作業ディレクトリ。それぞれが**もとになった親ブランチ**を1つ持つ。

- 合流点はこの親ブランチ。main を直接の合流点にしない
- 成果のマージ先・追随の取り込み元・ユーザー指示で扱う対象は、いずれもこの worktree のブランチ
- 親ブランチが判定できないときは、推測せずユーザーに確認する
- 各 worktree は親ブランチに更新が入っていたら、**取り込めるタイミングで自主的に** `git rebase develop` して追随する
- 取り込みを先延ばしするほどコンフリクトが育つ。**小さく頻繁に**取り込むこと
- **main・develop へのマージ**は、ユーザー指示を受けてから確認→承認を一回踏んで行う
- **change の実装（apply）は、この worktree のブランチへ直接コミットする**

## repo 直下のフォルダの扱い

規定の正は `docs/agents/issue-tracker.md`「repo 直下のフォルダの扱い」。

- repo 直下への新規フォルダ作成は、**エージェントの自己判断では行わない**（直下の増殖を禁じる）
- 作ってよいのは3つ — 1. **ユーザーが初期化・新規プロジェクトの立ち上げを指示した**、2. スキル・エージェントのプロンプト定義に指示がある、3. **docs に規定があり、指定されたフォルダがまだ無い**（`docs/` `test/` のような場合）
- 3 の根拠にできるのは **docs（`docs/adr/` を除く）だけ**。ADR・specs・ticket・change・steering は根拠にしない
- 3 で作ったときは、**根拠にしたものと作成したフォルダ名を、作成した直後の応答でユーザーへ簡潔に報告する**
- 直下にフォルダを足したら `docs/specs/core/system-structure.md` のディレクトリ構造へ整合反映する
- どれにも当たらないなら作らない。置き場が無いと感じたら既存フォルダへ収めるか、ユーザーに確認する

## Docs

`docs/specs/` は**定義としての specs**。`docs/agents/` は**エージェント向けの運用**。`docs/adr/` は決めの記録。

** `docs/agents/` **
| ファイル名 | 概要 |
| --- | --- |
| `issue-tracker.md` | 「作業の規定」を参照 |
| `triage-labels.md` | triage の5ラベル |
| `domain.md` | CONTEXT.md と ADR の運用 |

**`docs/specs/`**
| 分類 | 分類概要 |
| --- | --- |
| `core/` | 構造・入れ物・設定の規範（ディレクトリ構造 / schema / 設定の正 / 部品の棚卸し） |
| `api/` | 契約（サーバ API・MCP ツール） |
| `architecture/` | 流れ（セッション・問いの往復・仕様書画面・データ取得と SSR） |
| `reference/` | 調べた事実（本家 spec-workflow-mcp・`@nuxtjs/mdc`・`claude -p`） |
| `plan/` | 未確定の検討（feature ワークフロー・接合・置換の可否・移行課題） |

