# server/utils の棚卸し

`server/utils/` の現状の実態と、規範（`docs/specs/core/system-structure.md` の区切り）への対応。

## 規範への対応 — 全31本

規範は**関心単位**の4区分。現在の31本をこの区切りへ写すと:

| 関心 | モジュール（現在の置き場 →） |
| --- | --- |
| 本家接続 | `rest` `socket` `schema` `scan` `registry`（upstream/） |
| 監視・通知 | `monitor` `diff` `notify` `board` `directory` `actions` `upstream-proxy`（control/） |
| セッション | `session-core` `session-store` `session-param` `paths` `ai` `claude` `claude-config` `prompt` `running` `submission-signal` `request-schemas` `question` `conflict` `project` `openspec` `ws-channels` `settings`（stroke/） |
| 設定・起動 | `config` `readiness`（直下） |

移動の実施は `docs/specs/plan/structure-migration.md`。
