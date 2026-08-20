# claude-p-openspec-workflow — Tasks

## 1. 実行構成の実測（設計前提の確認）

- [x] 1.1 `claude -p --setting-sources project --add-dir <mvp リポジトリ>` から opsx コマンドが discover されるか実測する。されない場合はロード経路（設置場所・setting-sources 構成）を調整して確定する
- [x] 1.2 `--session-id` で自前採番した uuid が、スキル内の `${CLAUDE_SESSION_ID}` と一致するか実測する
- [x] 1.3 spawn 時に渡した環境変数 `STROKE_BASEURL` が skill のフェンス実行まで届くことを、セッション API スキル経由の curl で確認する

## 2. ワークフロー定義の作成

- [x] 2.1 共有の OpenSpec ルートを作成し `openspec store register` で登録する。`--store` で cwd 非依存に参照できることを確認する
- [x] 2.2 スキーマ `stroke-session` を作成する（schema.yaml。design「定義ファイル全文」のとおり）
- [x] 2.3 `templates/proposal.md` と `config.yaml` を作成する（design「定義ファイル全文」のとおり）
- [x] 2.4 `openspec instructions stroke --change <change> --store <id>` で instruction が取得できることを確認する

## 3. サーバの置換

- [x] 3.1 セッション作成時に store 上へ change を作る処理を追加する（`openspec new change <sessionId> --store <id>` 相当）
- [x] 3.2 `prompt.ts` を固定文2種（初回＝コマンド実行指示＋固定指示、継続＝リトライ兼用の続き促し）へ置き換え、`sessionPrompt` の合成を廃止する
- [x] 3.3 呼び出し元（`overview.post.ts` / `answer.post.ts` / `send-back.post.ts`）を初回／継続の定型に切り替える
- [x] 3.4 spawn 時の環境変数 `STROKE_BASEURL` を `claude-config.ts` / `claude.ts` に追加する（値は runtimeConfig で外出し）
- [x] 3.5 実行する opsx コマンド名を設定値として外出しする

## 4. 検証

- [x] 4.1 通しで確認する: 概要投入 → ストローク数往復 → 把握完了（stroke.md 書き出し）→ proposal 提出 → 差し戻し → 再提出
- [x] 4.2 specs シナリオ1: stroke 段の instruction に「detail の冒頭に『前提:』と書く」を追記し、コード変更・再ビルド・再起動なしで次の提出物に反映されることを確認する
- [x] 4.3 specs シナリオ2: proposal 段の template に「## Non-goals」を追加し、次に起案される proposal に反映されることを確認する
- [x] 4.4 specs シナリオ3: 起動済みの呼び出しには変更が現れず、次回の呼び出しから現れることを確認する
