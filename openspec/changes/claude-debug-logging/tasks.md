# claude-debug-logging — tasks

## 1. 設定

- [x] 1.1 `server/utils/stroke/config.ts` のスキーマへ `claude.debugLogDir`（文字列・空を許す）を追加する
- [x] 1.2 `nuxt.config.ts` の `runtimeConfig` へ `claude.debugLogDir: ''`（既定 = 無効）を追加する

## 2. 実装

- [x] 2.1 `ClaudeRunOptions` に任意項目 `debugLogDir` を足す（`server/utils/stroke/claude.ts`。design.md Decision 2）
- [x] 2.2 `runClaude` の終了ハンドラで、`debugLogDir` が渡っていれば stdout 全文を `<debugLogDir>/<YYYYMMDD-HHmmss-SSS>-<セッション uuid>.json` へ書く。ディレクトリは `mkdir -p` で用意し、成否判定より先に結果へ影響させない（design.md Decision 3・4）
- [x] 2.3 書き出し失敗（mkdir・write）は呼び出し結果へ反映せず、サーバーログへ警告を1行出す
- [x] 2.4 呼び出しの端で設定を解決し `debugLogDir` を渡す（`invokeAi` の呼び出し経路。共有モジュールでは設定を引かない）

## 3. テスト

- [x] 3.1 未設定（空）ならログファイルが作られないテスト
- [x] 3.2 設定済みなら呼び出しごとに1ファイル作られ、中身が stdout 全文と一致するテスト（2回呼んで2ファイル・上書きなしを含む）
- [x] 3.3 失敗した呼び出し（非ゼロ終了）でもログが残るテスト
- [x] 3.4 出力先へ書けない場合でも呼び出しが成功として完了するテスト

## 4. ドキュメント

- [x] 4.1 `docs/specs/core/settings-reference.md` へ `claude.debugLogDir` を追記する（設定の正への追記。ユーザー承認を得てから反映する）

## 5. 検証・レビュー・締め

- [x] 5.1 `yarn typecheck` と `yarn test` が通ることを確認する
- [x] 5.2 実サーバーで設定を入れて1往復し、ログファイルの生成と中身を実測で確認する（確認後、作ったセッションと設定は片づける）
- [x] 5.3 'typescript-reviewer' エージェントに '/santa-method' でレビューを実行し、完全にパスするまで指摘対応を続ける
- [x] 5.4 この change の成果物を commit する
- [ ] 5.5 ユーザーから完了承認を得る
