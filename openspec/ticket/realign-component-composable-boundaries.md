# realign-component-composable-boundaries

component のリファクタ。仕様書 `file-components`（spec-workflow、2026-08-24 承認）の**条件付き承認の条件**として起票。

**順序の前提**: `separate-composable-responsibilities`（composables の責務分離）である程度整理が進んでから着手する。その時点で component と composables の**両方をまたいで切り方を再度整理**する（片側だけで切らない）。

関連: `reorganize-components`（置き場の再編）・`flatten-composables`（置き場の平置き）とは別軸。page component / MarkdownComponent の定義は承認済み仕様書 `file-components` が持つ。
