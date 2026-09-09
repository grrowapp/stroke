## MODIFIED Requirements

### Requirement: 呼び出しは起動単位で識別され、文脈が混ざらない

同時に複数の claude が接続していても、各ツール呼び出しは自分の起動の接続文脈（工程種別と、flontier 工程ではセッション、steering 工程ではプロジェクト）でだけ解決される SHALL。他の起動の文脈で解決されてはならない（MUST NOT）。

#### Scenario: 2つのセッションが同時に動いても混ざらない

- **GIVEN** stroke-board が起動済みである
- **WHEN** 互いの主題が重ならない概要を2つ投稿してセッションを2つ作り、それぞれで AI を起動し、双方のストロークが進むのを待つ
- **THEN** `GET /api/sessions/:id/strokes` で読んだ各セッションの記録（`question` の `header` / `detail` / `question` / `options` 全文）が、**自分の概要に由来する要件だけ**を扱っており、他方の概要にしか現れない語が1回も現れない

判定を概要へ埋めた識別子の出現で行ってはならない（MUST NOT）——エージェントは製品名を復唱せず要件の中身で議論するため、自分の識別子も現れないことがある（実測 2026-08-30）。混在の有無は、問いが扱っている文脈で判定する。

#### Scenario: flontier と steering が同時に動いても混ざらない

- **GIVEN** stroke-board と本家の dashboard が起動済みで、把握完了に達し proposal が提出されたセッションが存在する
- **WHEN** `POST /api/sessions/:id/approve` でそのセッションを承認して steering 工程を開始し、並行して `POST /api/sessions`（概要以外の文脈に出現しない識別子 C を含む概要）と `GET /api/sessions/:id/invoke-agent` で別セッションの flontier 工程を起動し、双方が進むのを待つ
- **THEN** `GET /api/sessions/:id/strokes` で読んだ flontier セッションの記録に識別子 C が現れ、承認したセッションのプロジェクト名（`GET /api/sessions` の応答が持つ昇格後の名前）以外の識別子は現れない。かつ `GET /api/projects/:projectId/steering/:name`（`projectId` は承認で生成されたプロジェクトのもの）が 200 を返す
