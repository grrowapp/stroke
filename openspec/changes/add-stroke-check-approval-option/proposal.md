# add-stroke-check-approval-option

## Why

`yarn check:stroke` が proposal の着地で終わるため、steering 工程を一度も通せていない。

そのため次の2つが**一度も成功していない**（2026-08-28 時点）。

- `mcp__stroke-board__get-steering`
- `mcp__stroke-board__submit-document`（`type: steering`）

`get-steering` が flontier 工程で 500 になる件（`fix-steering-tool-stage-error`）についても、承認後なら通るのかどうかが確かめられていない。提供した6ツールのうち2つが、実機で一度も動作を見られていない状態が続いている。

あわせて、検証で作ったセッションが `projectShareRoot` に残り続ける。何度も回す道具なので、片付けまで含めて手元で完結させたい。

## What Changes

- **新規**: 承認まで進めるかどうかをオプションで選べるようにする。既定は proposal で止める。承認はプロジェクトを生成する不可逆な操作であり、既定で走らせない
- **新規**: 承認まで進めた場合、steering 工程の進行も同じ枠組みで追い、着地の判定に含める
- **新規**: 検証で作ったセッションを最後に片付けるかどうかをオプションで選べるようにする

## Capabilities

### New Capabilities

- `tooling/stroke-check`: ストロークを実機で流す道具の振る舞い。どこまで進めるか（proposal で止める / steering まで）と、後始末をするかどうかを選べること。

## Impact

- **影響コード**: `scripts/stroke-check.ts`
- **影響しないもの**: アプリのコード。道具の側だけで完結する
- **前提**: 操作はブラウザのみで、サーバーを直接叩かない。実測 2026-08-28、`fetch` で起動を回復させたところ画面側の失敗状態が残り、着地しているのに画面が遷移しなくなった
- **注意**: 承認するとセッションディレクトリがプロジェクト名へ改名される。片付けの対象が uuid から名前へ変わる
