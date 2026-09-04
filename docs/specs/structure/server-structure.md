# server/utils の棚卸し

`server/utils/` の現状の実態と、規範（`docs/specs/structure/system-structure.md` の区切り）への対応。

## 規範への対応 — 全34本

規範は**関心単位**の4区分。現在の34本をこの区切りへ写すと:

| 関心 | モジュール（現在の置き場 →） |
| --- | --- |
| 本家接続 | `rest` `socket` `schema` `scan` `registry`（upstream/） |
| 監視・通知 | `monitor` `diff` `notify` `board` `directory` `creating` `upstream-proxy`（control/） |
| セッション | `session-core` `session-store` `session-param` `paths` `ai` `invoke` `claude` `config` `log` `running` `sweep` `reap` `activate-approved` `submission-path` `request-schemas` `question` `conflict` `project` `openspec` `ws-channels`（stroke/） |
| 設定・起動 | `config` `readiness`（直下） |

移動の実施は `docs/specs/plan/structure-migration.md`。
