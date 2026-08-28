# specs/project-generation（旧・フラット）— delta

## REMOVED Requirements

### Requirement: 承認時にプロジェクトのトップディレクトリを作る

**Reason**: プロジェクトの作り方が「新規生成」から「セッションディレクトリの改名による昇格」に変わった（ADR-0011・承認済み requirements 2026-08-25）。capability は `project/generation` へ畳む。
**Migration**: `project/generation` の「承認はセッションディレクトリをプロジェクト名へ改名して昇格させる」が引き継ぐ。

### Requirement: 承認された proposal を配置する

**Reason**: proposal はセッションの時点から AI 自身が `docs/proposal.md` に書き、承認時にシステムが書き出す対象ではなくなった。
**Migration**: `project/generation` の「proposal はセッションの時点から docs 配下にある」が引き継ぐ。

### Requirement: 生成の直前に既存名との衝突を確認する

**Reason**: capability の畳み込み。確認の対象が生成先から昇格先に変わる。
**Migration**: `project/generation` の「昇格の直前に既存名との衝突を確認する」が引き継ぐ。

### Requirement: 生成に失敗したら承認を確定させない

**Reason**: capability の畳み込み。失敗の対象が生成から改名に変わる。
**Migration**: `project/generation` の「昇格に失敗したら承認を確定させず、宙吊りの状態を作らない」が引き継ぐ。

### Requirement: セッションディレクトリは承認後も残す

**Reason**: 昇格はセッションディレクトリそのものの改名であり、セッションとプロジェクトは同一の実体になった。「承認後もセッションディレクトリが別に残る」という状態が存在しない。
**Migration**: 中身が失われないことは `project/generation` の「中身はそのまま引き継がれる」が保証する。
