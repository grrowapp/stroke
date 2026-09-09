# server/session-management Specification

## Purpose
claude の起動と MCP 接続を結びつけるセッション管理の契約を定める。起動ごとに渡される一時 token（発行・受け渡しは invoke-agent の内部で行われる）により、ツール呼び出しを起動元の対象（セッション / プロジェクト）に結びつけ、それ以外の呼び出しを拒否する。

## Requirements

### Requirement: 呼び出しは起動単位で識別され、文脈が混ざらない

同時に複数の claude が接続していても、各ツール呼び出しは自分の起動の接続文脈（工程種別と、flontier 工程ではセッション、steering 工程ではプロジェクト）でだけ解決される SHALL。他の起動の文脈で解決されてはならない（MUST NOT）。

#### Scenario: 2つのセッションが同時に動いても混ざらない

- **GIVEN** stroke-board が起動済みである
- **WHEN** 互いの主題が重ならない概要を2つ投稿してセッションを2つ作り、それぞれで AI を起動し、双方のストロークが進むのを待つ
- **THEN** `GET /api/strokes/:id/strokes` で読んだ各セッションの記録（`question` の `header` / `detail` / `question` / `options` 全文）が、**自分の概要に由来する要件だけ**を扱っており、他方の概要にしか現れない語が1回も現れない

判定を概要へ埋めた識別子の出現で行ってはならない（MUST NOT）——エージェントは製品名を復唱せず要件の中身で議論するため、自分の識別子も現れないことがある（実測 2026-08-30）。混在の有無は、問いが扱っている文脈で判定する。

#### Scenario: flontier と steering が同時に動いても混ざらない

- **GIVEN** stroke-board と本家の dashboard が起動済みで、把握完了に達し proposal が提出されたセッションが存在する
- **WHEN** `POST /api/strokes/:id/approve` でそのセッションを承認して steering 工程を開始し、並行して `POST /api/strokes`（概要以外の文脈に出現しない識別子 C を含む概要）と `GET /api/strokes/:id/invoke-agent` で別セッションの flontier 工程を起動し、双方が進むのを待つ
- **THEN** `GET /api/strokes/:id/strokes` で読んだ flontier セッションの記録に識別子 C が現れ、承認したセッションのプロジェクト名（`GET /api/strokes` の応答が持つ昇格後の名前）以外の識別子は現れない。かつ `GET /api/projects/:projectId/steering/:name`（`projectId` は承認で生成されたプロジェクトのもの）が 200 を返す

### Requirement: 有効な token の無い呼び出しを拒否する

有効な token を持たないツール呼び出しは HTTP 401 で拒否する SHALL。有効な token は、現に実行中の起動に対して invoke-agent が発行したもののみとする SHALL——実行の終了（正常・異常とも）と stroke-board の再起動で無効になり、再起動をまたいで有効な token を作ってはならない（MUST NOT）。拒否で接続文脈を既定値で補ってはならない（MUST NOT）（docs/adr/0014 の原則に整合する）。

#### Scenario: token を持たない接続は拒否される

- **GIVEN** stroke-board が起動済みである
- **WHEN** token のヘッダを持たない MCP 設定で外部から `claude -p` を起動し、いずれかのツールの実行と呼び出し状況の報告を指示する
- **THEN** 報告に、ツールの呼び出しが認可エラーで失敗したことが示されている

#### Scenario: 発行されていない token は拒否される

- **GIVEN** stroke-board が起動済みである
- **WHEN** 発行されていない token をヘッダに設定した MCP 設定で外部から `claude -p` を起動し、いずれかのツールの実行と呼び出し状況の報告を指示する
- **THEN** 報告に、ツールの呼び出しが認可エラーで失敗したことが示されている

### Requirement: token の発行と失効は起動処理だけが行う

一時 token を発行・登録し、失効させるのは起動処理（invoke-agent）だけとする SHALL。token は起動ごとに1つ発行し、その実行の終了（正常・異常とも）で失効させる SHALL。MCP ツール・endpoint・画面のいずれも token を発行・登録・削除してはならない（MUST NOT）。

接続表は token と接続文脈（工程種別と、flontier 工程ではセッション、steering 工程ではプロジェクト）の対応だけを持つ SHALL。**接続表に、その起動で何が起きたかの記録を持たせてはならない（MUST NOT）**——起動の成果を知る手段は起動処理が持ち、接続表は誰の呼び出しかを答えるだけである。

#### Scenario: 実行の終了で token が失効する

- **GIVEN** 起動が実行中で、その token でツールの呼び出しが通っている
- **WHEN** その実行が終了する
- **THEN** 同じ token での呼び出しは HTTP 401 で拒否される

#### Scenario: 接続表は成果を持たない

- **GIVEN** steering 工程の起動が文書を提出して受理された
- **WHEN** 接続表のその token のエントリを見る
- **THEN** エントリには接続文脈だけが在り、提出の有無や数は記録されていない
