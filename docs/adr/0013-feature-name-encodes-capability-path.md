# ADR-0013: feature の名前は openspec 側のパスを `__` でエンコードしたものである

- **状態**: 採用
- **日付**: 2026-08-26

## 決定

feature の spec 名（本家 `.spec-workflow/specs/` 直下のディレクトリ名）は、openspec 側の対応するパス（`openspec/specs/` からの相対）のセグメントを `__`（2重アンダーバー）で連結したフラット名とする。

- `openspec/specs/api/session/` ↔ `.spec-workflow/specs/api__session/`
- パスの各セグメントはアンダースコアを含まない kebab-case（英小文字・数字・ハイフン）とする。これにより `__` は常に区切りとしてのみ現れ、変換は可逆になる
- パスと spec 名は1対1に対応する。同名の feature は存在しない
- `.spec-workflow/specs/` 配下に入れ子ディレクトリを作らない

## 背景

openspec の specs は階層を持てるが、本家 spec-workflow の specs はフラット必須である。稼働中の 2.2.7 に実際に入れ子を置いて確かめた結果（2026-08-26、[upstream-observations](../specs/reference/upstream-observations.md)）:

- 入れ子は書き込め、URL 直叩きで読めるが、一覧に現れない（`getAllSpecs` が1階層しか読まない）
- 本家のファイル監視はパス位置決め打ちのため、入れ子の文書更新が**親 spec の存在しない文書の更新イベント**として飛ぶ。見えないだけでなく隣に害が出る

この差異を吸収するため、階層をフラット名にエンコードして両者を同期する。

## 影響

- feature の名前が一度使われ始めると、規則の変更には既存名の変換が要る。覆すのは難しい
- 命名の定義の正は `docs/feature/overview.md`。機能的 specs は change `define-feature-workflow` の sync で `openspec/specs/feature/` 配下に入る
- 依存 change（`create-feature` ほか）はこの規則への完全準拠で進める
