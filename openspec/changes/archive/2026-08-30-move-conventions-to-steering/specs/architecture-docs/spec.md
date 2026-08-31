## ADDED Requirements

### Requirement: コーディング規約は steering が持つ

コーディング規約の実体は steering 文書（`.spec-workflow/steering/` の `structure.md` / `tech.md`）に置かなければならない（SHALL）。ここでいうコーディング規約とは、コードをどう書き、テストをどこに置き、何を通すかの取り決めを指す — 命名、import の書き方、テストの置き場、通す門番（どのテストを実行の条件とし、どれを外すか）、書き方の原則。この5つが規約であり、これ以外の置き場（components / composables をどう切ってどこへ置くか）は構造として `docs/specs/core/system-structure.md` が持つ。

`docs/` 配下の資料は同じ規約を書き写してはならない（MUST NOT）。規約に触れる必要があるときは steering への参照だけを置かなければならない（SHALL）。

#### Scenario: 規約を引く

- **WHEN** 人間またはエージェントが、テストをどこに置くか・どのテストを通すか・import をどう書くかを知ろうとする
- **THEN** steering を読めば決まり、`docs/` 側には steering への参照しか無い

#### Scenario: 規約を新たに書く

- **WHEN** コードの書き方についての取り決めを新たに書く必要が生じる
- **THEN** `docs/` ではなく steering へ書く

#### Scenario: 規約に実装がまだ従っていない

- **WHEN** steering が定める規約に対して、実装がまだ従っていない
- **THEN** 規約そのものは steering にあり、従っていないという事実は現状の記録として `docs/specs/plan/structure-migration.md` にある。規約の文面が `docs/` 側へ複製されることはない

## MODIFIED Requirements

### Requirement: 既存ドキュメントと役割を分ける

`docs/specs/core/system-structure.md` は「今どう組まれているか」だけを扱わなければならない（SHALL）。次のものを持ってはならない（MUST NOT）。

- ドメイン用語の定義 — `CONTEXT.md` が持つ
- なぜその選択をしたかという決定の記録 — `docs/adr/` が持つ
- これから何を作るかという計画 — `openspec/changes/` が持つ
- コーディング規約 — steering（`.spec-workflow/steering/`）が持つ

ここでいうコーディング規約は、Requirement「コーディング規約は steering が持つ」が列挙するものを指す。層の構成、部品の切り方、依存の向き、各ディレクトリが何を持つかは**構造**であり、引き続き `docs/specs/core/system-structure.md` が持つ。ディレクトリツリーに `test/` が在ることは構造、単体テストをそのどこへ置くかは規約である。

決定の理由に触れる必要があるときは、該当する ADR または change を参照しなければならない（SHALL）。理由そのものを資料に書き写してはならない（MUST NOT）。規約に触れる必要があるときも同じく、steering への参照だけを置かなければならない（SHALL）。

#### Scenario: 配置の理由を知りたい

- **WHEN** 資料を読んでいて、なぜその配置なのかを知りたくなる
- **THEN** 資料から該当の ADR または change への参照が辿れ、理由はその参照先にある

#### Scenario: 決定が変わった

- **WHEN** ある技術的決定が新しい ADR で覆される
- **THEN** 理由が1箇所にしか無いため、資料側に古い理由が取り残されることがない

#### Scenario: 規約が変わった

- **WHEN** コーディング規約が steering で更新される
- **THEN** `docs/specs/core/system-structure.md` は参照しか持たないため、古い規約が資料側に取り残されることがない
