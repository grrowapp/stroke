# api/project/generate Specification

## Purpose
プロジェクトの**生成**——昇格したプロジェクトを本家 spec-workflow に存在させること——を受け持つ endpoint（P2 `POST /api/projects`）を規定する。昇格したプロジェクトのリソース（`projects/`。削除は P1）の作成にあたる。ユーザーが叩く endpoint ではなく、サーバーが承認の後の実行の準備として叩く。生成は本家への登録の依頼であり、AI の起動とは別のアクションである。

## Requirements

### Requirement: P2 POST /api/projects — プロジェクトの生成を本家へ依頼する

システムは `POST /api/projects` を公開する SHALL。作成なので対象を id で指さない。本文は `{ projectPath: string }` とし、`projectPath` は昇格したプロジェクトのディレクトリの絶対パスとする SHALL。成功は受理だけを返す SHALL。

**メソッドで振り分けなければならない（SHALL）。** パスに `generate` のような動詞を置いてはならない（MUST NOT）。

受理したとき、システムは本家 spec-workflow のプロジェクト登録の REST（`POST /api/projects/add`）へ `projectPath` をそのまま依頼する SHALL。本家がその依頼を受理して初めて、この endpoint は受理を返す SHALL。本家が既に同じパスを登録済みであっても受理する SHALL——本家は登録済みのパスに同じ `projectId` を返し、依頼を重ねても登録は増えない。

この endpoint は AI を起動してはならず（MUST NOT）、対象を改名してはならず（MUST NOT）、phase を書いてはならず（MUST NOT）、`invocation` を書いてはならない（MUST NOT）。上層へ `project-creation` を配信してもならない（MUST NOT）——生成中か完了かは phase だけで決まり（`project/generation`）、登録は phase を動かさない。対象の `state.json` を読んで振る舞いを変えてもならない（MUST NOT）——受け取ったのはパスであり、判定はその形だけに掛ける。

#### Scenario: 昇格したプロジェクトのパスで依頼する

- **GIVEN** 昇格したプロジェクト `<name>` が `<projectShareRoot>/<name>` に在り、本家 dashboard が動いている
- **WHEN** `POST /api/projects` へ `{ projectPath: '<projectShareRoot>/<name>' }` が届く
- **THEN** 本家の登録の REST へ同じ `projectPath` で1回依頼され、本家の一覧にそのプロジェクトが載る。要求した相手へ 204 が返り、本文は無い

#### Scenario: 受理しても対象は変わらない

- **GIVEN** phase が `approved`・`invocation` が `running` のプロジェクトが在る
- **WHEN** そのパスで生成が受理される
- **THEN** ディレクトリ名・phase・`invocation` はいずれも受理の前と同じで、AI は起動されず、上層へ `project-creation` は流れない

#### Scenario: 登録済みのパスで依頼する

- **GIVEN** 本家の一覧に `<projectShareRoot>/<name>` が既に載っている
- **WHEN** 同じパスで生成が要求される
- **THEN** 204 が返り、本家の一覧の件数は増えない

### Requirement: 受け付けるパスは親の直下だけ

システムは、`projectPath` が**セッションとプロジェクトを置く親（`projectShareRoot`）の直下1階層**の絶対パスであるときにだけ受理する SHALL。それ以外——本文に無い・文字列でない・空・相対パス・親そのもの・親の外・2階層以上下——は 400 で断り、本家へ何も依頼しない SHALL。親の外を本家に登録させない。

#### Scenario: 本文に projectPath が無い

- **WHEN** 本文が空、または `projectPath` を持たない
- **THEN** 400 が返り、本家へは何も依頼されない

#### Scenario: 相対パスで依頼する

- **WHEN** `projectPath` が `made-app` のような相対パスである
- **THEN** 400 が返り、本家へは何も依頼されない

#### Scenario: 親の外のパスで依頼する

- **WHEN** `projectPath` が `/home/vagrant/work/made-app` のように `projectShareRoot` の外を指す
- **THEN** 400 が返り、本家へは何も依頼されない

#### Scenario: 親そのもの、または深い階層で依頼する

- **WHEN** `projectPath` が `projectShareRoot` そのもの、または `<projectShareRoot>/<name>/docs` のように2階層以上下を指す
- **THEN** 400 が返り、本家へは何も依頼されない

### Requirement: 本家に届かない・本家が断ったときは受理しない

システムは、本家の URL が設定されていない、本家に届かない、または本家が登録の依頼をエラーで返したとき、受理してはならない（MUST NOT）。要求した相手には、環境か設定を直すまで通らない要求として 503 を返す SHALL（`api/contract` の約束——409 は待てば通る、503 は直すまで通らない）。本家が 2xx で応答したが本文が想定の形と違うときは 502 を返す SHALL。

いずれの失敗でも、システムは何も変えない SHALL。同じパスで生成を再び要求できる。

#### Scenario: 本家が停止している

- **GIVEN** 本家 dashboard が起動していない
- **WHEN** 親の直下のパスで生成が要求される
- **THEN** 503 が返る。対象のディレクトリ名・phase・`invocation` は変わらない

#### Scenario: 本家の URL が設定されていない

- **GIVEN** 本家の URL が設定されていない
- **WHEN** 親の直下のパスで生成が要求される
- **THEN** 503 が返り、本家へは何も発行されない

#### Scenario: 本家が登録をエラーで返す

- **GIVEN** 本家 dashboard は動いているが、登録の依頼に 500 を返す
- **WHEN** 親の直下のパスで生成が要求される
- **THEN** 503 が返る。対象は変わらない

#### Scenario: 本家の応答の形が違う

- **GIVEN** 本家が登録の依頼に 200 で応答するが、本文が `projectId` を持たない
- **WHEN** 親の直下のパスで生成が要求される
- **THEN** 502 が返る。対象は変わらない

#### Scenario: 失敗の後にやり直す

- **GIVEN** 本家が停止していて生成が 503 で終わった
- **WHEN** 本家が起動した後、同じパスで生成が要求される
- **THEN** 204 が返り、本家の一覧にそのプロジェクトが載る

### Requirement: 生成はファイルシステムに書かない

システムは、生成にあたって `.spec-workflow/` 配下に自分でファイルやディレクトリを作ってはならない（MUST NOT）。作るのは登録を受けた本家である。

#### Scenario: 本家が停止していれば内部構造はできない

- **GIVEN** 本家 dashboard が起動しておらず、対象のプロジェクトは `.spec-workflow/` を持たない
- **WHEN** そのパスで生成が要求されて 503 で終わる
- **THEN** そのプロジェクトのディレクトリに `.spec-workflow/` は無いままである
