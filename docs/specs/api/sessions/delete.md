# セッションの削除 — `DELETE /api/sessions/:id`

セッションを消す。承認**前**の局面のものだけを受け付ける。共通の約束は [contract.md](../contract.md)。

- input: 本文なし
- output: 本文なし（204）
- 消したときは、**セッションディレクトリ配下**（状態・生成物・そのセッションの openspec ルート）が残らない。
- **消せるのはセッションだけ。** 承認で昇格した対象（`phase` が `approved` / `activated`）はもう
  プロジェクトなので受理しない。対象の id は昇格でプロジェクト名に変わり、`:id` は形では
  絞れない（steering の起動と実行の記録がその名前で来る）ため、**削除の到達範囲を止めるのは
  この phase の判定だけ**である。判定は endpoint が自分の literal（`stroking` / `proposed`）で持ち、
  `readState`（zod）で読む。壊れた `state.json` は消さない。
## 振り分け

**削除はメソッドで振り分ける。** パスに `delete` という動詞を置かず、メソッドを絞らない handler も作らない。`delete.ts`（メソッド接尾辞なし）にすると `GET /api/…/delete` でも消えてしまう——Nitro がメソッドとして読むのはドットで続く接尾辞だけである。

## エラー

| status | 状況 |
|---|---|
| 404 | セッションが無い |
| 409 | phase（昇格後＝`approved` / `activated` は拒否。`state.json` を読めないものも拒否） |
| 409 | busy（実行中の呼び出しを持つ間は受理しない） |
