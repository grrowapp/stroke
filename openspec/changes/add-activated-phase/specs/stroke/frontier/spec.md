## MODIFIED Requirements

### Requirement: セッションの状態を保持する

システムはセッションごとに phase（`stroking` / `proposed` / `approved` / `activated`）と、履歴に出す記録——問いと回答のペア、および proposal の初提出のマーカー——を保存する SHALL。問い返しの往復もペアとして保存する。会話の全文は保存しない。

`approved` と `activated` は昇格後のプロジェクトが持つ局面であり、セッションの画面が扱うのは `stroking` と `proposed` だけである。

#### Scenario: ブラウザをリロードする

- **WHEN** ユーザーがブラウザをリロードする
- **THEN** システムは保存された phase に対応する画面を表示し、履歴も同じ内容で開ける
