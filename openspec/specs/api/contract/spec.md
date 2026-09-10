# api/contract Specification

## Purpose

正常に成立した要求へ返す応答コードの規約を定める。受理で完結する操作が 204 を返すこと、読み取りが 204 を返さないことを規定し、個別 endpoint の spec が自分の入出力だけを持てるようにする。

## Requirements

### Requirement: 受理で完結する操作は本文を持たない応答を返す

システムは、受理と記録で完結する操作が成立したとき、要求した相手へ本文を持たない応答を返す SHALL。応答のステータスは 204 とする。

204 は「操作を受理し、返す本文が無い」ことを表す。

対象は次の操作である。回答（U7）・差し戻し（U9）・承認（U10）・問い（A5）・proposal（A7）・実行の記録（A8）・生成（P2）。

受理が成立した応答に本文を載せてはならない（MUST NOT）。

#### Scenario: 画面が回答を送る

- **GIVEN** phase が `stroking` のセッションが在り、答えるべき問いが 1 件出ている
- **WHEN** 画面が `POST /api/sessions/:id/answer` へ `Answer`（`{ kind: 'free', value: '<回答の本文>' }`）を送る
- **THEN** 画面へステータス 204 が返り、応答に本文は無い

#### Scenario: 画面が差し戻しを送る

- **GIVEN** phase が `proposed` のセッションが在る
- **WHEN** 画面が `POST /api/sessions/:id/send-back` へ 1 件以上の指摘を持つ `SendBackPayload` を送る
- **THEN** 画面へステータス 204 が返り、応答に本文は無い

#### Scenario: 画面が承認を送る

- **GIVEN** phase が `proposed` のセッションが在り、`docs/proposal.md` が在り、昇格先の名前が使える
- **WHEN** 画面が `POST /api/sessions/:id/approve` へ `{ projectName: '<名前>' }` を送る
- **THEN** 画面へステータス 204 が返り、応答に本文は無い

#### Scenario: エージェントが問いを送る

- **GIVEN** phase が `stroking` のセッションが在る
- **WHEN** エージェントが `POST /api/strokes/:id/question` へ `Question`（`header` / `detail` / `question` / `options[]`）を送る
- **THEN** エージェントへステータス 204 が返り、応答に本文は無い

#### Scenario: エージェントが proposal を送る

- **GIVEN** phase が `stroking` のセッションが在り、`docs/proposal.md` へ書き込める
- **WHEN** エージェントが `POST /api/strokes/:id/proposal` へ `{ proposal: '<本文>' }` を送る
- **THEN** エージェントへステータス 204 が返り、応答に本文は無い

#### Scenario: invokeAi が実行の記録を送る

- **GIVEN** 対象の id を持つセッションが保存されている
- **WHEN** invokeAi が `POST /api/strokes/:id/submission` へ `{ invocation: 'running' }` を送る
- **THEN** invokeAi へステータス 204 が返り、応答に本文は無い

#### Scenario: サーバーが生成を送る

- **GIVEN** 昇格したプロジェクトが `projectShareRoot` の直下に在り、本家 dashboard が動いている
- **WHEN** 承認の後の実行の準備が `POST /api/projects` へ `{ projectPath: '<そのディレクトリ>' }` を送る
- **THEN** ステータス 204 が返り、応答に本文は無い

### Requirement: 読み取りの応答に 204 を使わない

システムは、GET に対する応答に 204 を使ってはならない（MUST NOT）。成立した GET は要求した相手へ 200 を返す SHALL。

これは副作用を持つ GET——AI の起動（U13）——にも当てはまる。起動要求を受理したときは 200 を返す SHALL。

#### Scenario: 画面が AI の起動を要求する

- **GIVEN** 対象の id を持つセッションが保存され、`invocation` が `running` でない
- **WHEN** 画面が `GET /api/sessions/:id/invoke-agent` を cwd 付きで読む
- **THEN** 画面へステータス 200 が返る。204 は返らない

#### Scenario: 画面がセッションの状態を読む

- **GIVEN** 対象の id を持つセッションが保存されている
- **WHEN** 画面が `GET /api/sessions/:id` を読む
- **THEN** 画面へステータス 200 が返り、phase と `invocation` が本文で返る

### Requirement: endpoint の責務は1つの軸を持つ

システムは、1つの endpoint に責務の軸を**1つだけ**持たせる SHALL。2つ目の軸を持たせてはならない（MUST NOT）。

軸とは、その endpoint が受け持つ1つの事である。「完成を記録する」「実行の記録を書く」「要求を受けて AI を起動する」がそれにあたる。

#### Scenario: 記録する endpoint に判定を持たせない

- **GIVEN** 完成を記録する endpoint（`api/session/activate`）が在る
- **WHEN** 「完成したかどうか」を決める処理を置く場所を選ぶ
- **THEN** それは記録とは別の軸なので endpoint には置かず、呼び手が持つ

#### Scenario: 値を書く endpoint に意味づけを持たせない

- **GIVEN** 実行の記録を書く endpoint（`api/stroke/submission`）が在る
- **WHEN** 渡された値から次の状態を導く処理を置く場所を選ぶ
- **THEN** それは書くこととは別の軸なので endpoint には置かず、呼び手が持つ

### Requirement: 責務範囲は軸を起点に前後の幅を持つ

責務範囲は、軸を起点として**前後に幅を持つ** SHALL。軸の成立に不可分な前と後——要求を受理してよいかの検証、受理したことの記録、受理に続く配信——は、責務範囲の**内**である SHALL。

責務範囲を**点**として捉え、「軸そのもの以外は責務外」と判定してはならない（MUST NOT）。これは責務判定の誤用である。点で判定すると、検証も記録も配信も責務外になり、endpoint はその軸を成立させられなくなる。

**責務外の判定は軸の数で行う** SHALL。ある処理がその endpoint の責務外かどうかは、それが2つ目の軸に属するかどうかで決める。軸が1つのまま前後へ広がっているものを責務外と判定してはならない（MUST NOT）。

#### Scenario: 受理の前の検証は責務範囲の内

- **GIVEN** 受理で完結する endpoint が在る
- **WHEN** 受け取った本文の形と、いまの局面がその操作に当てはまるかを確かめる
- **THEN** それは軸の成立に不可分な前であり、責務範囲の内である

#### Scenario: 受理の後の配信は責務範囲の内

- **GIVEN** 完成を記録する endpoint（`api/session/activate`）が受理した
- **WHEN** 記録に続けて上層へ決着を配信する
- **THEN** それは軸の成立に不可分な後であり、責務範囲の内である

#### Scenario: 別の軸に属するものは責務外

- **GIVEN** 起動を要求されて AI を起動する endpoint（`api/session/invoke-agent`）が在る
- **WHEN** 起動したプロセスの終了を待って結果を返そうとする
- **THEN** それは「起動する」とは別の軸であり、責務外である。endpoint は受理で完結する

#### Scenario: 点で捉えた責務外判定を退ける

- **GIVEN** ある endpoint の軸が「記録する」ことだと分かっている
- **WHEN** その endpoint が受理の前に局面を確かめていることを「責務外」と判定しようとする
- **THEN** その判定は成立しない。軸は1つのままであり、確かめることは責務範囲の内である
