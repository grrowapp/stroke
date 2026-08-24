## Why

作りたいシステムの説明を投げても、詰めきる前に実装へ入ってしまい、黙って仮定された決定が後から破綻する。概要を起点にストロークを重ね、把握完了に達するまでの進行と状態を保持する場が要る。

## What Changes

- セッションの開始・往復・把握完了の判定・状態保持を追加する。

## Capabilities

### New Capabilities

- `stroke-session`: この change で新設する。

## Impact

`server/utils/session-store.ts` `views.ts` `apply-outcome.ts`。
