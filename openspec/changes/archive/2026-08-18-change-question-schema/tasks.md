## 1. 型と検証

- [x] 1.1 `shared/types.ts` の `Question` を `header` / `detail` / `question` / `options` に組み替える
- [x] 1.2 `shared/types.ts` の `QuestionOption` から `rationale` を外し、`detail` を `description` に改名する
- [x] 1.3 `server/utils/question.ts` の zod スキーマを新しいキー名に差し替え、上限を `header` 12字 / `detail` 300字 / `question` 20字 / `description` 50字 / `options` 5件にする
- [x] 1.4 `label` に文字数の上限を置かないことを確認する（規定は形式の文言のみ・design.md 決定2）
- [x] 1.5 不変条件を「推奨は多くとも1つ」に縮め、根拠の有無で推奨を落とす処理を外す
- [x] 1.6 長さ・件数の超過が `parseQuestion()` で `null` になり、AI 応答ではリトライへ流れることを確認する

## 2. AI への形式の規定

- [x] 2.1 `server/utils/prompt.ts` の `RESPONSE_FORMAT` の JSON 例を新しいキー構成に差し替える
- [x] 2.2 各項目の上限（12字 / 300字 / 20字 / 50字 / 5件）を形式の規定として明記する
- [x] 2.3 `label` に「1〜5語」と明記する
- [x] 2.4 推奨に根拠を求める記述を消し、推奨の印だけを求める形にする
- [x] 2.5 形式の規定に、何を問うか・どう判断するかの指示が混ざっていないことを確認する（spec: AI は実際のスキルとして走る）

## 3. 画面

- [x] 3.1 `app/components/stroke/QuestionCard.vue` の並びを 話題タグ → 詳細説明 → 問い → 選択肢 → 自由入力 にする
- [x] 3.2 話題タグをチップとして出す
- [x] 3.3 詳細説明のブロックの見出しを「詳細説明」にする
- [x] 3.4 選択肢から根拠の表示ブロックを外し、推奨バッジは残す
- [x] 3.5 `app/components/review/FollowupModal.vue` を同じ並び・同じ見え方に揃える
- [x] 3.6 `app/components/StrokeBreadcrumb.vue` の粒を開いたときの表示が、新しいキー構成で壊れないことを確認する
- [x] 3.7 自由入力欄が選択肢の直後に常設されたままであることを確認する

## 4. 通し確認

- [x] 4.1 `yarn typecheck` が通ることを確認する
- [x] 4.2 概要の投稿から数往復し、新しい構造の問いが画面に出ることを手動で確認する
- [x] 4.3 規定を超える応答を AI が返した場合にリトライへ流れ、画面に出ないことを確認する
- [x] 4.4 差し戻し後の問い返しが、ストロークと同じ並びで出ることを確認する
- [x] 4.5 新しい規定より前に保存された既存セッションを開くと 500 になることを確認する（移行しない・design.md 決定4）
