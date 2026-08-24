## Why

ストロークの応答と proposal の作成はすべて AI に依存するが、呼び方を決めておかないと、スキルがロードされないまま走ったり、リトライで回復できた失敗がそのままユーザーに漏れたりする。AI 実行の契約をここで定める。

## What Changes

- `claude -p` の呼び出し、起動設定の外出し、セッション継続、失敗時のリトライを追加する。

## Capabilities

### New Capabilities

- `ai-invocation`: この change で新設する。

## Impact

`server/utils/claude.ts` `ai.ts` `prompt.ts` `claude-config.ts`。
