## MODIFIED Requirements

### Requirement: 本家に書き込まない

システムは、本家および各プロジェクトの `.spec-workflow/` に対して、直接の書き込み・更新・削除を行ってはならない（MUST NOT）。ファイルに触れるのは本家であり、stroke-board はその API を呼んで依頼するだけでなければならない（SHALL）。

本家の状態を変える操作は、本家が公開している API を通してのみ行わなければならない（SHALL）。現在それに当たるのは次の3つで、いずれも stroke-board のサーバーを経由する。

- 承認と却下 — `POST /api/projects/:projectId/approvals/:id/:action`
- 仕様書の文書の保存 — `PUT /api/projects/:projectId/specs/:name/:document`
- ステアリングの文書の保存 — `PUT /api/projects/:projectId/steering/:name`

これ以外に本家の状態を変える口を持ってはならない（MUST NOT）。タスクの状態変更は持たない。

認証も認可も未実装で、この口は認証を通らない。到達できる者は誰でも本家の文書を書き換えられる。現在の想定する到達範囲は localhost に限り、広げる段階でこの口の認証・認可を設計に入れる。

#### Scenario: 通知の対象を開く

- **WHEN** 利用者が通知の行から対象を開く
- **THEN** 本家側の状態は一切変化しない

#### Scenario: 文書を保存する

- **WHEN** 利用者が文書を直して保存する
- **THEN** stroke-board のサーバーが本家の `PUT` を呼び、ファイルに書くのは本家である

#### Scenario: `.spec-workflow/` を直接開く

- **WHEN** stroke-board がプロジェクトの `.spec-workflow/` を読む
- **THEN** 読み取りだけを行い、書き込み・更新・削除はしない
