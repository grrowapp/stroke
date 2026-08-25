# separate-composable-responsibilities

app/composables/ の責務分離リファクタ。仕様書 `file-composables`（spec-workflow、2026-08-24 承認）の**条件付き承認の条件**として起票。「責務分離が全くできていない」が条件の内容。

症状（仕様書化の過程で実測済み）:
- `useProposalReview`（412行・return 39プロパティ）が画面2の表示・注釈編集・差し戻し・承認・問い返しを全部1本で持つ
- `Modals.vue` が useProposalReview の戻り値を丸ごと受ける（他の部品と結合の仕方が違う）
- HTTP エラー解体の純関数が `useProposalReview` と `useAgentQuestion` にほぼ逐語で重複
- 色定数を `CommentModal.vue` が composable から逆向き import（色は CSS へ寄せる方向が別途ある）

関連: `flatten-composables`（置き場の平置き）とは別軸。切り口の設計は本 change の design で決める。
