# fix-session-cli-url

## Why

`yarn session create` が出力する URL が `http://…/s/<uuid>` だが、この経路は存在せず 404 になる。実ルートは `/strokes/<uuid>`。統合後の実測（`align-settings-conventions` tasks 10.18、2026-08-24）で発見した。画面のルートが `/s/` から `/strokes/` へ移った際に、CLI の出力だけが取り残された形。

## What Changes

- `scripts/session.ts` の `create` が出力するパスを `/s/${sessionId}` から `/strokes/${sessionId}` へ直す
- 値の解決（`DEFAULT_API_BASE_URL`）は正しいことを実測済みで、触らない
- `list` / `delete` は URL を出力しないため対象外

## Capabilities

なし。CLI の出力パスはどの capability も規定しておらず、画面ルート `/strokes/<uuid>` 自体は既存の `stroke-session` の規定どおり。壊れていた出力を実ルートへ合わせるだけで、spec レベルの振る舞いは変わらない（schema `apply-tasks-flow`、`skip_specs: true`）。

## Impact

- `scripts/session.ts` — 1行（32行目）
- 確認は `yarn session create` の出力 URL を実際に開いて 200 を見る
