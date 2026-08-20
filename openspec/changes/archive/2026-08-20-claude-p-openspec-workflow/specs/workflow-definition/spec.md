# workflow-definition Delta Specification

## Purpose

セッション（ストローク〜proposal の起案）を進めるワークフローを、openspec の schema.yaml / config.yaml / template 群による定義ファイルとして外に置き、コード変更なしのワークフローカスタマイズを可能にする。

## ADDED Requirements

### Requirement: 定義の変更はコード変更なしで反映される

ワークフロー定義（schema.yaml / config.yaml / template 群）の変更は、アプリのコード変更・再ビルド・再起動なしに、次回の claude プロセスの呼び出しから反映される SHALL。

#### Scenario: instruction の変更が次の提出物に現れる

- **WHEN** 運用者が stroke 段の instruction に「detail の冒頭に『前提:』と書く」と追記し、その後にストロークの呼び出しが起こる
- **THEN** 提出された質問の detail は「前提:」で始まっている
- **AND** アプリのコード変更・再ビルド・再起動は行っていない

#### Scenario: template の変更が次の proposal に現れる

- **WHEN** 運用者が proposal 段の template に見出し「## Non-goals」を追加し、その後に proposal が起案される
- **THEN** 起案された proposal に「## Non-goals」の見出しが含まれている

#### Scenario: 実行中の呼び出しには変更が現れない

- **WHEN** claude プロセスの起動後に運用者が proposal 段の template へ「## Non-goals」を追加し、その呼び出しが proposal を起案する
- **THEN** その proposal に「## Non-goals」は含まれない
- **AND** 次回の呼び出しで起案される proposal には「## Non-goals」が含まれている
