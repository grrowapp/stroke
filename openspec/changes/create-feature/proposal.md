## Why

feature（本家 spec-workflow の requirements / design / tasks の組）は本家側で作られるもので、ポータルからは読むだけであり、新しい feature を起こす口が無い。ポータルから feature を起こせるようにする。

内容を詰める工程には、統合済みの stroke フロー（概要 → ストローク → proposal → 承認）を導入する想定がある。ただし**本 change の範囲は feature の作成まで**とし、stroke フローによる内容の充填は後続の change で扱う。

**前提**: 本 change は `define-feature-workflow`（feature ワークフローの仕様定義）の確定を前提とする。specs / design の作成は、確定した仕様定義への**完全準拠**で進める。

## What Changes

- ポータルの画面から**新しい feature を作成**できるようにする。
- 作成はサーバ API 経由で行う。API が本家の `.spec-workflow/specs/<feature-name>/` 配下にファイルを作る。画面が直接ファイルを書くことはしない。
- 本家の領域（`.spec-workflow/` 配下）への**書き込み**を初めて行う。本家データの扱いはユーザー判断とする ADR 0005 の趣旨に対し、この change 自体がそのユーザー判断である。
- feature 名の付け方と既存 feature との衝突の扱いを定める。feature 名は `define-feature-workflow` の `__` 命名規則（openspec 側のパスのエンコード）に従う。

## Capabilities

### New Capabilities

- `feature-creation`: ポータルからの feature の作成。画面の口・API・本家 `.spec-workflow/specs/` 配下に作るものの範囲を定める。

### Modified Capabilities

- `project-workspace`: 「下層で状態を変えられるのは承認への応答（と文書の編集・保存）だけ。それ以外に本家の状態を変える操作を置いてはならない（MUST NOT）」の要件に、feature の作成を加える。

## Impact

- 画面: feature 一覧（現・仕様書画面、表示名は Feature）に作成の UI を追加。
- サーバ: 本家 `.spec-workflow/specs/` 配下への作成 API を `server/` に追加。
- 本家との境界: 本家が稼働中に外からファイルが増えたときの本家側の挙動（検出・一覧への反映）は未確認。design の前に実測が要る（ADR 0006 の流儀に従う）。
- 後続: 作成した feature の内容を stroke フローで詰める change を別途起こす想定。
- **`define-feature-workflow` の確定による影響**（2026-08-27 承認。正は `docs/feature/overview.md`）:
  - change の起票と同時に **ticket**（`openspec/tickets/<change名>.md`）が作られる。ticket は起票の概要のみを持ち、**以後追記しない**（capability 等の後書きをしない）
  - 器は `.spec-workflow/specs/<spec名>/` 直下の proposal.md / requirements.md / design.md / tasks.md。requirements.md は delta 形式を満たす
  - 配置時は **proposal.md も一緒に置く**。capability が複数のときは、分解された feature 全てに同じ proposal.md を置き、集合定義（change が対象とする capability の全量）の拠り所とする
  - change ↔ capability の対応の正は proposal の Capabilities 節。capability は proposal が作成されるまで確定しない
