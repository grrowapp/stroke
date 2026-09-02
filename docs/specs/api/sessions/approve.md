# 承認 — `POST /api/sessions/:id/approve`

**承認**（`CONTEXT.md`）の判断を受理して記録する。共通の約束は [contract.md](../contract.md)。

- input: `{ projectName: string }`
- output: 本文なし（204）

## 判断を記録するだけ

改名しない・`phase` を動かさない・起動しない。昇格は [promote.md](./promote.md)、steering の起こしは昇格の成功を見た側の [invoke-agent.md](./invoke-agent.md) が行う。

判断が記録されている間もセッションは `proposed` のままで、一覧に生成中としては出ない。

## 前提

`docs/proposal.md` が在ること。書くのは A7 で、`proposed` まで進んだセッションでは通常在る。外から消された場合は 409（proposal が見つからない）で止まる。**承認は proposal を書かず、既にあるものに触れない。**

既に判断があれば 409 phase。画面は判断を置き換えるとき、先に `DELETE` を1回送ってから `POST` する。

## 取り下げ — `DELETE /api/sessions/:id/approve`

記録した判断を取り下げる（204）。取り消すのは判断だけで、proposal・往復の記録・ディレクトリには触れない。判断が無ければ何も変えず 204。昇格の後は 409 phase（そこから先はプロジェクトの削除）。

## エラー

| status | 状況 |
|---|---|
| 400 | 形式不正 |
| 404 | セッションが無い |
| 409 | name-conflict（記録の時点でも衝突を確認） |
| 409 | phase |
