## 1. 定義の文書化

- [x] 1.1 `docs/feature/overview.md` を作成する。内容: 2レーン（feature / 仕様書）の全体像、`__` 命名規則、器の構造（フラット・入れ子禁止）、名前とパスの1対1対応、工程の全体像と sync の定義、requirements と openspec spec の概念の対応、未決事項（中身の正の最終形・成果物の持ち方・sync の発火と担い手）の明記。検証: specs の4 capability（`feature/naming` / `feature/structure` / `feature/workflow/overview` / `feature/workflow/sync`）の要件と読み合わせて食い違いが無い
- [x] 1.2 `docs/adr/0013-feature-name-encodes-capability-path.md` を作成する。内容: `__` エンコードの決定、セグメント名の `__` 禁止、入れ子禁止の実測根拠（`docs/specs/reference/upstream-observations.md` 参照）。検証: 既存 ADR の体裁（状態・日付・決定・背景）に揃っている
- [x] 1.3 CLAUDE.md の Docs 節に `docs/feature/overview.md` を追記する。検証: 一覧に追加され、既存の記述形式と揃っている

## 2. 整合の確認

- [x] 2.1 `openspec validate define-feature-workflow --strict` が通ることを確認する
- [x] 2.2 依存 change（`create-feature` / `create-spec-document`）の proposal の完全準拠の記述と、定義文書の未決事項が矛盾しないことを読み合わせで確認する

## 3. 承認

- [ ] 3.1 `docs/feature/overview.md` のユーザー承認を得る
