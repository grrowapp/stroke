# Tasks

承認の要否で2つに分ける。1章は stroke-board のリポジトリだけで完結し、2章は本家の承認フローを通る。

## 1. main spec を実装に合わせる

- [x] 1.1 `openspec/specs/upstream-connection/spec.md` の Requirement「本家に書き込まない」を、この change の delta spec の内容に置き換える。archive 時に自動で反映されるため、手で書き換えるのは archive を待たない場合のみ
- [x] 1.2 `openspec validate --specs --strict` を通す
- [x] 1.3 `read-only.test.ts` が固定している書き込み口の一覧と、Requirement に列挙した3つが一致していることを確かめる。食い違っていたら Requirement 側を実装に合わせる（実装は変えない）

## 2. steering を実装に合わせる

本家の `PUT /api/projects/:projectId/steering/:name` で書き換え、ダッシュボードの承認を通す。ファイルには直接触れない。`implement-portal-mvp` の 11.8 と同じ手順。

`product.md` は2度に分けて通した。1度目で書き込みの原則と Open Questions を直し、2度目で認証・認可の書き方を直している。

- [x] 2.1 `product.md` の Project Principles を書き換える。`.spec-workflow/` へ直接書き込まないことと、状態を変えるときは本家の API を呼ぶことの2点が読める形にする
- [x] 2.2 `product.md` の Open Questions に「書き込み口の認可をどの方式で実装するか」を積む。Owner はユーザー、Deadline は「到達範囲を広げる段階」
- [x] 2.3 `product.md` の認証・認可の記述を「持たない」から「未実装」に改める。Target Users / Out of Scope / Future Considerations / Risks の4か所。「持たない」は恒久的な方針の宣言になっており、まだ作っていないだけの状態と食い違う
- [x] 2.4 `product.md` の Risks の Mitigation から「運用側の責任とする」を外し、到達範囲を広げる段階と認証・認可を実装する段階を同じ段階に置く。責任の所在を外へ投げるだけで、いつ誰が何をするかを決めていないため
- [x] 2.5 `product.md` を `PUT` で保存し、承認を通して依頼を削除する
- [x] 2.6 `tech.md` の Security Practices から「書き込み操作を一切持たない構成にする」を外す。認証・認可が未実装であること、書き込み口が3本あること、到達できる者は誰でも本家の文書を書き換えられることを書く
- [x] 2.7 `tech.md` に到達範囲の段階を書く。現在は localhost に限り、広げる段階で認証・認可を設計に入れる
- [x] 2.8 `tech.md` を `PUT` で保存し、承認を通して依頼を削除する

## 3. 仕上げ

- [x] 3.1 `vitest` と `nuxt typecheck` を通す。実装は変えていないため落ちないはずだが、確認する
- [x] 3.2 3か所（main spec / `product.md` / `tech.md`）の記述が互いに矛盾していないことを読み合わせで確かめる。main spec の末尾に「公開手段の制限は運用側の責任とする」が残っていたので、steering と同じくフェーズで区切る書き方に揃えた
