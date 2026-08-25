# move-conventions-to-steering

コーディング規約（auto-import 不使用・明示 import、テスト4種の役割、画面は判断しない）を docs から steering へ移す。
docs/specs/core/system-structure.md が「規約は steering が持つ」と定義しており、その定義に実体を合わせる。

触るファイル:
- 更新 .spec-workflow/steering/structure.md（/opt/projects/stroke-board/ 配下。dashboard API 経由・承認フロー。ファイル直接編集はしない）
- 更新 docs/specs/core/system-structure.md（§5 規約の節を削除し、steering への参照に置き換える）
- 更新 docs/specs/plan/structure-migration.md（該当行を消す）

新規ファイルは作らない。
