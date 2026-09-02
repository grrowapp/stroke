## Why

承認画面は、本文の右に指摘（コメント）の一覧を常に出している。文書を読むときや指摘を付けるとき、一覧は脇に要るが、表や長い行を含む markdown を読む間はその幅が本文を狭めている。一覧をしまって本文を広く読める口が無い。

あわせて、承認画面に編集の口が付いている。本家（spec-workflow-mcp の `ApprovalsAnnotator`）の承認画面は読んで判断し指摘を付ける場で、編集はできない。stroke-board が独自に付けた編集は本家と食い違っており、外す（ユーザー決定 2026-09-01）。

**対象は承認画面だけ。** 仕様書・ステアリングの画面は対象外。ストローク側の proposal 確認画面も対象外。

## What Changes

- **承認画面の指摘の一覧（コメント欄）をしまえるようにする。** しまうと一覧は 44px のつまみだけを残し、空いた幅は本文が取る。つまみを押すと一覧だけが戻る
- **開閉の口は4つ**（prototype で確かめた形）: コメント欄そのものを掴んで左右へ引く（放した位置が開いた幅の半分より狭ければしまう）／見出し帯のボタン／しまった帯のクリック／コメント欄の右辺に沿った全高の不可視のレール
- **左のナビゲーションとコメント欄は連動しない。** 左を畳んでもコメント欄は出たまま。コメント欄をしまっても左は動かない
- **コメント欄の幅は固定。** 左を畳んで空いた幅は本文だけが取り、コメント欄は広がらない。本文に固定幅（`max-width` や桁幅）は与えず、ビューポートに追従する。左右の余白は残ってよい
- **しまった状態は保存しない。** 開き直せば一覧は出ている。URL にも含めない
- **ヘッダー（上層へ戻る導線・プロジェクト表示）は常に見える**
- **BREAKING: 承認画面から編集の口を外す。** 対象文書は整形した本文で読むだけになる。直すのはその文書自身の URL（仕様書・ステアリングの画面）で行う。`document-editing` の「承認画面からも直せる」を落とす

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `project/ui`: 承認画面の指摘の一覧をしまえること、左のナビゲーションと連動しないこと、コメント欄の幅が固定で本文だけが広がることを加える（ADDED Requirement）
- `document-editing`: 「承認依頼の対象文書が6本のいずれかなら承認画面からも直せる（SHALL）」と「承認画面は…直すときは編集へ入る操作を挟む」を落とし、承認画面では編集しないと定める。Scenario「承認画面で対象文書を直す」「承認依頼の URL から直す」を落とす（REMOVED + ADDED。要件名が変わる）

## Impact

- `app/components/review/ApprovalAnnotator.vue` — コメント欄（`aside`）をしまう／戻す。開閉の口4つ。幅は固定値で持ち、`w-1/3` のような比率にしない
- `app/pages/projects/[projectId]/approvals/[approvalId].vue` — `MarkdownEditor` の差し込みをやめ、`MarkdownView` で読むだけにする。`saveTargetOf` / `save` は不要になる
- `app/layouts/workspace.vue` — 変更しない。左の畳みは既存のまま（cookie）。コメント欄との連動を持ち込まない
- `modules/markdown/` — 変更しない
- `test/e2e/document-editing.spec.ts` — 「承認依頼から対象文書を直す」の3本（`:143-190`）を落とす。承認画面は読むだけになる
- `test/e2e/approval-annotation.spec.ts` / `upstream-style.spec.ts` — 承認画面の構造（`grid` 1:2 → 幅固定の列）に合わせる。コメント欄の開閉と非連動を足す
- 状態は保存しない（cookie / localStorage / URL のいずれにも書かない）

## 他の change との関係

- `create-module-annotation` — 同じ `ApprovalAnnotator.vue` を触る。あちらは面の内側（どの面を出すか・塗り）、こちらは外側（コメント欄の開閉と幅）。承認画面から `MarkdownEditor` が消えるので、あちらが要していた「`MarkdownEditor` に位置の口を素通しさせる」例外は不要になる。**こちらが先**
- `update-ui-approval-review` — 同じファイル。差し戻しボタンの置き場と却下の追加で、コメント欄の開閉には触れない
- ADR-0017「委譲の内訳」の `add-full-width-markdown-editor`。完了判定はあちらが定める（2026-09-01 に本 change の意図に合わせて書き直した）
