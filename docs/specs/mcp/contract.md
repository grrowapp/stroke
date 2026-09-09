# MCP ツール共通の契約

stroke-board 自身が提供する MCP サーバー（route `/mcp`）の全ツールに共通する約束。個々のツールの引数・結果・代行先は [tools.md](./tools.md)、画面・エージェントとサーバの境界は [../api/contract.md](../api/contract.md)、claude プロセスを起動して終了まで管理する側の責務は [../architecture/invoke-agent.md](../architecture/invoke-agent.md) にある。

## ツールは工程の中でだけ存在する

MCP ツールは特定の工程（flontier / steering）の中でだけ存在する。接続ごとに公開されるのはその工程のツールだけで（[tools.md](./tools.md)「工程ごとの公開」）、工程の外——起動していない claude、画面、サーバー内部の別の処理——から呼ばれることはない。

ツールが工程を判定して振る舞いを変えることもない。どの工程の接続かは起動側が `--mcp-config` で決め、ツールは決められた工程の中で代行するだけである。工程の食い違い（steering の接続から `type: flontier` を投げるなど）は代行先を決められない失敗として平坦に返す。

## 代行以外の固定の処理を受け持たない

**ツールの責務は、対応する endpoint（または本家 REST）へ要求を発行し、その応答だけから結果を作ることに限る。** ツールに固定の処理を持たせない。次はいずれもツールが受け持ってはならない。受け持つ側は表のとおりで、大半は invoke-agent である。

| ツールが受け持たないもの | 誰の責務か |
|---|---|
| 作業が行われたかの判定と、その材料の記録 | invoke-agent。実行の終わりに代行先へ問い合わせて判定する |
| phase の遷移 | endpoint（U10 / U14 / U15）。呼ぶのは画面と invoke-agent |
| 実行の記録（`invocation`）への関与 | invoke-agent が A8 を通して書く |
| 完成の記録（U15） | invoke-agent が作業の判定の後に叩く |
| 起動・終了の検知 | invoke-agent が子プロセスの output stream で検知する |

ツールが「提出が受理された」という事実をサーバーのメモリやファイルに残すことも、この禁止に含まれる。提出の受理は代行先が持つ事実であり、要る側（invoke-agent）が代行先に問い合わせれば得られる。ツールがコピーを持つと、記録する者・捨てる者・実行が終わった後に届く応答の扱いがツールの側に生え、ツールが工程の進行を知る側になる。

`submit-document` の責務は、文書を代行先（flontier は A7、steering は本家 `PUT /api/projects/:projectId/steering/:name`）へ登録することのみである。結果は代行先の応答だけから作り、登録の成否以外を結果に載せない。

## 接続 token はツールが発行しない

接続 token（`x-stroke-token`）の発行・登録・失効は invoke-agent が担う（[../architecture/invoke-agent.md](../architecture/invoke-agent.md)「接続 token」）。ツールはヘッダの token を接続表で解決し、その接続文脈（flontier ならセッション id、steering ならプロジェクトパス）で代行先を決めるだけである。

ツールが token を発行することも、接続表に登録・削除することも、接続がまだ有効かを自分で調べて振る舞いを変えることもない。token が解決できなければ 401 `unauthorized` を平坦に返す（[tools.md](./tools.md)「接続の担保」）。

## 本家 spec-workflow の MCP との関係

steering 工程には、stroke-board の MCP サーバーに加えて**本家 spec-workflow の MCP を配線し、承認依頼のツール `approvals` を許可する**。steering 文書の承認依頼を作る手段が本家 REST に無く、作成は本家 MCP の `approvals`（`action: request`）で行うためである。

本家のツールは stroke-board のこの契約の外にある。結果の形（平坦な `status` / `errorCode` / `error`）を揃えず、stroke-board のツールとして数えない。工程の手順（`get-steering-guide`）が承認依頼の出し方を案内する。

## 関連

- 個々のツールの契約 — [tools.md](./tools.md)
- サーバ API の契約 — [../api/contract.md](../api/contract.md)
- claude プロセスを起動して終了まで管理する側の責務 — [../architecture/invoke-agent.md](../architecture/invoke-agent.md)
- 起動フラグと定型 — [../core/settings-reference.md](../core/settings-reference.md)
