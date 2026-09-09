# proposal の提出 — `POST /api/strokes/:id/proposal`

エージェントが proposal を提出する。共通の約束は [contract.md](../contract.md)。

- input: `{ proposal: string, projectName?: string }`（`projectName` は kebab-case のときだけ候補採用）
- output: 本文なし（204）

## 振る舞い

- **受理した本文を残す。** セッションの `docs/proposal.md` へ書き、以後に繋ぎ直した画面（W2 の接続時配信）でも承認（U10）でも同じ proposal が得られる。出し直しは上書きで、残るのは最後に受理した1件だけ
- **記録だけを行う。** phase を進めず、画面へも配信しない。局面の切り替えと配信は、この提出を
  行った実行の決着（A9。[settlement.md](./settlement.md)）で行われる
- **残せなければ受理しない。** 書けなかったときは失敗を返す。受理したのに残っていない状態を作らない
- 初提出は strokes にマーカー行として記録する
- `invocation` には触れない（実行の記録を書くのは A8 だけである）

## エラー

| status | 状況 |
|---|---|
| 400 | 本文が空 |
| 404 | セッションが無い |
| 409 `phase` | 承認以降（`approved` / `activated`）は拒否 |
| 500 | 残せなかった |
