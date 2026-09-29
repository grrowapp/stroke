# server/utils の棚卸し

`server/utils/` の現状の実態と、規範（`docs/specs/structure/system-structure.md` の区切り）への対応。

## 規範への対応 — 全33本

規範は**関心単位**の5区分（利用者の判定は見出しの全数に含めていない）。現在の33本をこの区切りへ写すと:

| 関心 | モジュール（現在の置き場 →） |
| --- | --- |
| 本家接続 | `rest` `socket` `schema` `scan` `registry`（upstream/） |
| 監視・通知 | `monitor` `diff` `notify` `board` `directory` `creating` `upstream-proxy`（control/） |
| セッション | `session-store` `session-param` `paths` `ai` `invoke` `claude` `config` `log` `running` `sweep` `reap` `activate-approved` `submission-path` `request-schemas` `question` `conflict` `project` `openspec` `ws-channels`（stroke/） |
| 設定・起動 | `config` `readiness`（直下） |
| 利用者の判定 | `source` `token` `identity` `store` `started-by` `request`（access/） |

`server/handler/` はこの棚卸しの対象外（`server/utils/` ではない）。api が呼ぶ実処理の置き場で、規範は `system-structure.md` §1・§4。

移動の実施は `docs/specs/plan/structure-migration.md`。
