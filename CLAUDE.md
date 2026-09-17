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
- ポートは**並走させる worktree ごとにずらす**。決めるのは `package.json` の `dev`（`nuxt dev --port <n>`）と `nuxt.config.ts` の `devServer.port` で、**CLI の `--port` が勝つ**。
  - **揃える相手はもう無い。** エージェントへ渡す接続先は、サーバーが実際に bind したアドレスから作る（`server/utils/stroke/listen-address.ts`）。かつて `claude.apiBaseUrl` という設定と揃える必要があったが、**その設定は外した**（`docs/specs/core/settings-reference.md`「接続先は設定ではない」）
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
- 直下にフォルダを足したら、構造の規範のディレクトリ構造へ整合反映する（規範の所在は issue-tracker）
- どれにも当たらないなら作らない。置き場が無いと感じたら既存フォルダへ収めるか、ユーザーに確認する

## 絶対禁止事項

書くものすべてに適用し、例外は無い。**書く前に必ず該当の ADR を読むこと。読まずに書くな。使ったやつは死ね。**

- **日本語当て字用法禁止** — 必読: `docs/adr/0021-technical-terms-keep-standard-notation.md`。開発・システム系の用語は一般に通用する表記（英語かカタカナ）で書き、自分で訳語を作らない。禁止例の一覧は ADR にあり、指摘されたら即座にそこへ追記する
- **規定外短縮表記禁止** — 必読: `docs/adr/0023-no-undefined-abbreviations.md`。instruction・template が定めていない短縮形を作らず、規定の名前は規定の形で書く
- **根拠薄弱な独断限定制約の設置禁止** — 必読: `docs/adr/0024-no-unfounded-unilateral-restrictions.md`。理由の無い限定（「〜だけ」「〜には置かない」）を独断で規定に入れない。限定にメリットがあると判断したら、先にユーザーへ理由を提示し承認を得てから書く
- **画面遷移・操作アクションの独断変更禁止** — 必読: `docs/adr/0025-no-unilateral-navigation-changes.md`。URL の入場先・リダイレクト・自動遷移・`navigateTo` / `router.push` / route rule / middleware・ボタンやリンクの飛び先・操作の可否（活性／非活性）・画面の責務範囲を、ユーザーの指示なしに足す・変える・消すことをしない。リファクタリングやバグ修正の「ついで」も同じ。変えたいときは、何をどう変えるかと理由を先にユーザーへ提示し、承認を得て、遷移の設計を `docs/specs/architecture/screen-flow.md` へ書き出してから実装する。既に入っている独断の遷移を見つけたら、黙って直さずユーザーへ報告する

## Docs

`docs/specs/` は**定義としての specs**。`docs/agents/` は**エージェント向けの運用**。`docs/adr/` は決めの記録。中身の一覧はこのファイルに持たない。各ディレクトリを直接見る（`docs/adr/0020`）。

