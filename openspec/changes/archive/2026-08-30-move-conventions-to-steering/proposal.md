# move-conventions-to-steering

## Why

`docs/specs/core/system-structure.md` は冒頭で「コーディング規約（auto-import 不使用・テストなど）は steering が持つ」と宣言している。宣言はあるが、規約の実体は docs 側に残ったままのものがある。

- steering `structure.md` には **auto-import 不使用・明示 import**（Import Patterns）と **画面は判断しない**（Code Organization Principles 3）が既に入っている。この2つは着地済み。
- 一方 **テストの規約は steering のどこにも無い。** 「単体テストはソースと同居させない・`test/` にソースの構造をそのまま写す・固定データは `__fixtures__/`・E2E は `e2e/`」という置き場の取り決めは `system-structure.md` §2 が持ち、「型チェック・ユニット・E2E の3つを門番として通す」「`test:live` は本家の起動が要るので `test` から外す」という取り決めは `README.md` のテスト節に事実の説明として混ざっているだけで、規約としてはどこにも書かれていない。
- auto-import については `docs/specs/core/file-composables.md` が steering と同じ規約を独自に書いている（34行目・58行目）。同じ規約が2箇所にあり、どちらが正かは資料から読み取れない。

規約を引くエージェントが docs と steering のどちらを見ればよいか決められない。`docs/specs/plan/structure-migration.md` にも移行課題として残り続けている。

（`.openspec.yaml` の note は 2026-08-24 時点のもので、3項目すべてが未移設という前提で書かれている。現状は上のとおり2項目が着地済みで、実質の未移設はテスト規約のみ。）

## What Changes

**規約の所在を steering に一本化し、docs 側には参照だけを残す。**

steering（本家 API 経由で保存する。ファイルを直接編集しない）

- `structure.md` にテストの置き場の規約を足す — 単体テストはソースと同居させない / `test/` にソースの構造をそのまま写す / 固定データは同じ位置の `__fixtures__/` / E2E は `e2e/`
- `tech.md` の Testing Requirements に、通す門番の規約を足す — 型チェック・ユニット・E2E の3つを通す / `test:live` は本家の起動を要するため `test` から外す

移すのは規約だけで、事実は移さない。どのコマンドが何を実行し本家の起動が要るかの一覧は `README.md` のテスト節が持つ事実であり、steering は「何を通すか」だけを持つ。

docs

- `docs/specs/core/system-structure.md` §2 のテスト置き場の記述を、steering への参照に置き換える。ディレクトリツリーの `test/` 行は構造の記述なので残すが、その注記からは規約の語句（「ソースの構造をそのまま写す」）を落とす
- `docs/specs/core/file-composables.md` の auto-import 規約の記述（34行目・58行目）を、steering への参照に置き換える。「未実施」という実態と `align-coding-conventions` への引き継ぎは規約ではなく現状の記録なので残す
- `docs/specs/core/file-composables.md` 36行目・`docs/specs/core/file-components.md` 75行目の「単体テストはソースと同居させない」から規約の文面を抜き、テストの在処の事実だけ残す
- `docs/specs/plan/structure-migration.md` の該当行を削除し、11行目が `file-composables.md` を引用していた箇所を steering への参照に付け替える

**規約と構造の線引きを spec に書く。**

- 構造（層の構成・部品の切り方・依存の向き・各ディレクトリが何を持つか）は `system-structure.md` が持つ
- コーディング規約（命名・import の書き方・テストの置き場・通す門番・書き方の原則）は steering が持つ
- `system-structure.md` は規約そのものを持たず、steering への参照だけを持つ

**範囲外**

- `README.md` のテスト節は残す。利用者向けの実行手順であって規約ではない
- steering `structure.md` のディレクトリツリーに `test/` を足すこと、`tech.md` のスクリプト一覧に `test:live` を足すこと。どちらも構造・事実の欠落であって規約ではない
- `nuxt.config.ts` へ `imports: { autoImport: false }` を入れる実装は `align-coding-conventions` の担当。この change は資料の所在だけを動かし、コードには触れない
- 新規ファイルは作らない

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `architecture-docs`: Requirement「既存ドキュメントと役割を分ける」に **コーディング規約** を加え、その持ち主が steering であることを規定する。現状この Requirement が挙げる MUST NOT は ドメイン用語 / 決定の記録 / 計画 の3つで、規約の扱いが書かれていない。書かれていないため「宣言はあるが実体は docs 側」という今の状態を spec が咎めない

## Impact

| 対象 | 変更 |
| --- | --- |
| `.spec-workflow/steering/structure.md` | File Organization Principles にテストの置き場の規約を追加 |
| `.spec-workflow/steering/tech.md` | Testing Requirements に、通す門番の規約を追加 |
| `docs/specs/core/system-structure.md` | §2 のテスト置き場を steering 参照へ。ツリー42行目の注記から規約の語句を落とす |
| `docs/specs/core/file-composables.md` | 34行目・58行目の auto-import 規約、36行目のテスト置き場の規約を steering 参照へ |
| `docs/specs/core/file-components.md` | 75行目のテスト置き場の規約を落とす |
| `docs/specs/plan/structure-migration.md` | 該当行を削除。11行目の引用元を steering へ付け替える |
| `openspec/specs/architecture-docs/spec.md` | delta（`specs/architecture-docs/spec.md`） |

**steering の保存経路**: `.spec-workflow/` へ直接書かない。書くのは本家で、`PUT /api/projects/:projectId/steering/:name` を呼ぶ（stroke-board 側の中継は `server/api/projects/[projectId]/steering/[name].put.ts`）。本家ダッシュボード（`localhost:5000`）が動いていることが前提で、停止していると保存の口が無い。

**コードへの影響**: なし。`app/` `server/` `shared/` は触らない。画面の振る舞いも API の契約も動かない。

**別課題として報告（この change では触らない）**

- steering `tech.md` は本家の基準を **v2.2.5** と書いているが、`docs/adr/0008-baseline-is-2-2-7.md` は 2.2.7 を基準としている
- steering `structure.md` のディレクトリツリーは `test/` / `assets/` / `prompt/` を欠いている（`e2e/` は載っている）
- steering `tech.md` のスクリプト一覧は `test:live` を欠いている
- steering `structure.md` へ移したテスト置き場の例は `server/utils/control/notify.ts` を指しており、`structure-migration.md` が挙げる `server/utils/` の再編が実施されると腐る。steering は git 管理外で差分レビューに乗らないため、再編の change に追随項目として引き継ぐ必要がある
- `docs/specs/core/file-component.md` 5行目と `docs/specs/core/file-composables.md` 54行目が、archive 済みの `openspec/changes/restructure-app-directories/...` を参照しており、パスが存在しない（実体は `openspec/changes/archive/2026-08-24-restructure-app-directories/`）
