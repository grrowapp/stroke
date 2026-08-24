# remove-project-name-length-limit

## Why

プロジェクト名に最大 100 文字の上限が入っているが、**この数値には根拠が無い**。

- `openspec/specs/proposal-review/spec.md` の「プロジェクト名を提案し、ユーザーが確定する」は、AI が kebab-case で提案すること、ユーザーが編集して確定すること、既存名と衝突させないことだけを規定している。長さには触れていない
- `openspec/specs/project-generation/spec.md` にも長さの規定は無い
- `.scratch/stroke-board-frontier/decisions.md` にあるのも「AI が kebab-case で提案し、ユーザーが承認画面で確定する。既存名との衝突を確認する」だけである

名前を決めるのはユーザーであり、その確定はプロジェクト生成の唯一の引き金になる。そこにアプリが独自の数値を割り込ませ、根拠なく弾いている。

さらに同じ 100 が2箇所に別々に直書きされている（`server/utils/request-schemas.ts:20` の `PROJECT_NAME_MAX` と `server/utils/session-store.ts:41` の `projectNameSchema`）。片方だけ変えると、受理はされるが保存を読み戻せない状態が生まれる。

## What Changes

- **プロジェクト名に製品側の長さ制限を持たない。** 受理と保存のどちらでも、長さを理由に拒否しない
- 実行環境が受け付けない長さ——ディレクトリ名として作れない——は環境の制約として扱い、その失敗が起きた場所で伝える。アプリが先回りして独自の数値を決めない
- 上限の二重定義を解消する

kebab-case の判定と、`/opt/projects/` の外へ出られる形になっていないかの検査は変えない。前者は仕様が定めた候補採用の条件であり、後者は書き込み先を閉じ込めるための検査で、どちらも根拠がある。

## Capabilities

### Modified Capabilities

- `proposal-review`: 「プロジェクト名を提案し、ユーザーが確定する」に、確定する名前を長さで拒否しないことを加える
- `project-generation`: 実行環境がディレクトリ名として受け付けない名前が確定されたとき、生成の失敗として扱われ、承認が確定しないことを明らかにする

## Impact

- `server/utils/request-schemas.ts` — `PROJECT_NAME_MAX` と、それを使う2箇所
- `server/utils/session-store.ts` — `projectNameSchema` の上限
- `server/utils/project.ts` — 生成の失敗の伝え方
- `docs/api-contract.md` — 400 の条件から長さを外す
- `openspec/changes/externalize-hardcoded-settings/proposal.md` — 外出しの対象一覧からプロジェクト名の上限を外す（撤廃するので外出しの対象ではなくなる）

この change は他の3件と独立していて、着手の順序に縛られない。
