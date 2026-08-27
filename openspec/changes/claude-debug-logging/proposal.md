## Why

スポーンした claude の失敗を解析する手段が、現状はユーザーレベルの transcript（`~/.claude/projects/<セッション dir>/…jsonl`）を手で掘ることしかない。直近の question スキル障害の調査でも、サーバー側に呼び出し結果の記録が無いことが特定の遅れに直結した。呼び出しの生出力をサーバー側で残すデバッグの口が要る。

## What Changes

- 新規: `nuxt.config.ts` にデバッグログの出力先を指定する設定を追加する。**未設定なら機能ごと無効**（既定 OFF）とし、モードのフラグと置き場所を1つの設定で兼ねる
- 変更: AI 呼び出しが、スポーンした claude の `--output-format json` の生出力を、呼び出しごとに指定の出力先へ書き出す
- ログは調査用の複製であり、セッションの状態・画面の挙動・呼び出しの成否判定には一切影響しない（書き出し失敗で呼び出しを失敗扱いにしない）
- 設定はストローク側設定の正である `docs/specs/core/settings-reference.md` に追記する（ADR-0004。この change がその承認過程にあたる）

## Capabilities

### New Capabilities

- `debug/logging`: スポーンした claude の呼び出し結果（`--output-format json` の生出力）を、設定された出力先へ呼び出しごとに書き残す。出力先の指定・無効時の振る舞い・ファイルの単位と命名を規定する

### Modified Capabilities

なし。既存 capability の requirement は変えない（`ai-invocation` の呼び出し契約はそのままで、出力の複製を足すだけ）。

## Impact

- `server/utils/stroke/claude.ts` — 生出力の書き出し実装（呼び出し結果の収集箇所）
- `nuxt.config.ts` — 設定の追加
- `docs/specs/core/settings-reference.md` — 設定の正への追記（要ユーザー承認）
- 依存パッケージの追加なし。API・画面への影響なし
