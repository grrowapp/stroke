# move-conventions-to-steering — tasks

steering は git 管理外なので、入れる文面をここに控えてから編集する（design D5）。docs の編集は worktree（`/home/vagrant/work/stroke-board/base2`）で行い、`wt/base2` へコミットする。

**この change の artifact だけ `/opt/projects/stroke-board/openspec/` 側にある。** base2 の `openspec/**` は `.claude/settings.json` の deny（`Edit(/openspec/**)`）で編集できず、allow されているのは `Edit(//opt/projects/stroke-board/openspec/**)` だけだった。propose の途中でこれに突き当たり、ユーザーが「artifact は /opt 側で ok」と決めた（2026-08-27）。他の active change は base2 側に artifact を持つので、この change だけ置き場が違う。

steering へ入れるのは**規約だけ**で、構造の欠落（ツリーの `test/`）と事実の欠落（スクリプト一覧の `test:live`）には触らない（design D3）。

## 1. 前提の確認

- [x] 1.1 本家ダッシュボード（`localhost:5000`）が動いていることを確かめる。`.spec-workflow/` へ書けるのは本家だけなので、停止していると保存の口そのものが無い（画面から入る場合は `DocumentEditor` の `can-save` が偽になる）
- [x] 1.2 `/opt/projects/stroke-board` に対応する projectId を確かめる — **画面ではなく registry を読んだ**（`$SPEC_WORKFLOW_HOME/activeProjects.json`）。dev サーバーは 3399 で既に起動していた
- [x] 1.3 編集前の全文を控える（git 管理外のため、戻すには控えが要る）— **画面ではなく `cat` でファイルを退避**した

**1章で確かめた事実**

| 項目 | 値 | 出どころ |
| --- | --- | --- |
| 本家ダッシュボード | `127.0.0.1:5000` で待ち受け中 | `ss -ltn` |
| stroke-board dev | `0.0.0.0:3399` で待ち受け中 | `ss -ltn` |
| projectId | `YRzzH6mvc1uUzZN3` | `/opt/projects/.spec-workflow-mcp/activeProjects.json`（`SPEC_WORKFLOW_HOME`） |
| projectPath（registry） | `/home/vagrant/work/stroke-board/base2` | 同上 |
| workflowRootPath（registry） | `/opt/projects/stroke-board` | 同上 |
| steering の保存先 | `/opt/projects/stroke-board/.spec-workflow/steering/<name>.md` | 稼働中の v2.2.5 で確認。`project.projectPath = translatePath(entry.workflowRootPath)`（`dist/dashboard/project-manager.js:88`）、`join(project.projectPath, '.spec-workflow', 'steering', ...)`（`dist/dashboard/multi-server.js:855-856`） |
| 編集前の控え | `/tmp/move-conventions-to-steering-backup/`（structure.md 8433B / tech.md 11198B） | `cat` で退避 |

## 2. steering `structure.md` にテストの置き場の規約を足す

- [x] 2.1 `### File Organization Principles` の既存2行の下に、3行足す

      - **単体テストはソースと同居させない。** `test/` にソースの構造をそのまま写した位置へ置く（`test/server/utils/control/notify.test.ts` ↔ `server/utils/control/notify.ts`）
      - テストが使う固定データは、そのテストと同じ位置の `__fixtures__/` に置く
      - E2E は `e2e/` に置く

- [x] 2.2 保存し、開き直して反映を確かめる（8433 → 8773 バイト。差分は上の3行のみ）

**保存の手段（2章・3章に共通）**: 本家 API へ `curl` で PUT する。差し込みはアンカーの一意性を確認するスクリプト（`/tmp/move-conventions-to-steering-backup/patch-*.mjs`）で行い、原本は読むだけにしている。design D4 は当初「stroke-board の steering 編集画面から」としていたが、apply 中にユーザーが `Bash(curl *)` の deny を外したため curl に切り替えた（D4 を更新済み）。呼ぶ API は同じで、`.spec-workflow/` へ直接書かない制約の満たし方は変わらない。

## 3. steering `tech.md` に通す門番の規約を足す

- [x] 3.1 Technical Requirements & Constraints > `### Testing Requirements` の既存5行に、2行足す

      - 門番は3つ。`yarn typecheck`（型チェック）・`yarn test`（ユニット）・`yarn test:e2e`（E2E）を通す
      - `yarn test:live` は門番に含めず、`yarn test` からも外す（本家の起動を要するため）

- [x] 3.2 保存し、開き直して反映を確かめる（11198 → 11516 → **11432** バイト。保存の手段は2章末尾の注記と同じ）

**3.1 の文面はレビュー後に削った。** 当初入れた「稼働中の本家へ実接続するため…本家が動いていない環境で落ちても実装の不具合ではない」は `README.md` 208〜210行とほぼ同文で、proposal が「事実は README が持つ」と引いた線を越えていた。規約だけを残す形に詰め直した（上の文面が最終）。

## 4. docs を steering 参照へ寄せる

- [x] 4.1 `docs/specs/core/system-structure.md` §2 の「単体テストはソースと同居させない…」の箇条書きを、steering への参照1行に置き換える。ディレクトリツリーの `test/` 行（42行目）は構造の記述なので残す（design D1）
- [x] 4.2 `docs/specs/core/system-structure.md` の冒頭の参照（9行目）と §5 参照テーブルに、steering が規約を持つことを載せる。テーブルには `.spec-workflow/steering/` の行を足す
- [x] 4.3 `docs/specs/core/file-composables.md` 34行目の「平置き後も**明示 import を維持する**（auto-import は使わない。`nuxt.config` の `autoImport: false` 前提）」を steering への参照に置き換える。「**この点は未実施** — `nuxt.config.ts` に `imports` の設定が無く、auto-import は既定で有効のまま。ストローク側は明示 import 無しで動いている」は現状の記録なので残す（design D6）
- [x] 4.4 `docs/specs/core/file-composables.md` 58行目の「auto-import の廃止はポータル側の規約だが…」から規約の文面を抜き、steering への参照にする。「ポータル側は明示 import で参照する」「ストローク側のコードがまだ依存しているため当面有効のまま」「統一は `align-coding-conventions`」は事実なので残す
- [x] 4.5 `docs/specs/core/file-composables.md` 36行目の「単体テストはソースと同居させない。`test/app/composables/useRelativeTime.test.ts` にある。」から規約の文面を抜き、置き場の事実だけ残す。**この行は tasks を書く段で見つけたもの**
- [x] 4.6 `docs/specs/plan/structure-migration.md` の「コーディング規約（auto-import 不使用・テスト・画面は判断しない） | steering へ移す」の行を削除する
- [x] 4.7 `docs/specs/core/file-components.md` 75行目の「単体テストはソースと同居させない。」を落とし、テストの在処の事実だけ残す。**4.5 と同じ重複で、5.2 の grep で見つけた**
- [x] 4.8 `docs/specs/plan/structure-migration.md` 11行目が `file-composables.md` を引用していた箇所を steering への参照に付け替える。4.3 で規約文を抜いたため引用が参照切れになっていた。自分の編集が生んだ不整合の調整
- [x] 4.9 4.8 の付け替えで steering の規約文を逐語引用してしまっていたのを、参照だけの形に直す（delta spec が `docs/` への複製を MUST NOT としている）。レビューの BLOCK-1
- [x] 4.10 `docs/specs/core/system-structure.md` 42行目のツリー注記から「ソースの構造をそのまま写す」を落とす。規約の語句が構造の記述に残っていた。レビューの HIGH-1

**4.5 / 4.7 の範囲判断について**: どちらも proposal を書いた時点の Impact には無かった行で、実施はエージェント判断。4.5 は propose 時点の tasks に「proposal の Impact には挙げていない。外すなら落とす」と断ったうえでユーザーが apply を指示したもの（その断り書きは、proposal を更新したいま偽になるので削除済み）。4.7 は apply 中に 5.2 の grep で見つけたもの。いずれも「規約の文面を `docs/` に残さない」というこの change の目的そのものに沿う最小の削除で、事実の記述は残している。proposal の What Changes と Impact は **4.5（`file-composables.md` 36行目）・4.7・4.8・4.10（`system-structure.md` 42行目の注記）** の4件を含む形に更新済み。**範囲を広げた判断なので、7.2 の完了承認で明示的に確認する。**

## 5. 整合の確認

- [x] 5.1 `grep -rn "auto-import\|autoImport" docs/` を実行し、残っているのが**現状の記録**だけで規約の文面が無いことを確かめる — 残る5箇所はいずれも事実（auto-import 名の説明・実態・別 change への引き継ぎ）
- [x] 5.2 `grep -rn "単体テストはソースと同居" docs/` を実行し、規約の文面が docs から消えていることを確かめる — 該当なし
- [x] 5.3 `docs/specs/core/system-structure.md` から steering への参照が辿れること、steering を読めばテストの置き場と通す門番が分かることを、実際に読んで確かめる
- [x] 5.4 steering に事実の記述を混ぜていないことを確かめる。ツリーの `test/`・スクリプト一覧の `test:live`・コマンド一覧の表のいずれも入れていないこと（design D3）
- [x] 5.5 `openspec validate move-conventions-to-steering --store stroke` が通ることを確かめる
- [x] 5.6 コードに差分が無いこと（`app/` `server/` `shared/` を触っていないこと）を確かめる — 変更したのは `docs/` 配下のみ（`.claude/settings.json` はユーザーが curl deny を外した変更で、この change の成果物ではない）

## 6. コミット

- [x] 6.1 base2 の docs の差分を `wt/base2` へコミットする。steering は git 管理外なので入らない。コミットメッセージに、steering の2文書へ何を入れたかを1行で残す

| コミット | 内容 |
| --- | --- |
| `b239826` | §4 の docs 4ファイル（+8 / -8） |
| `a9a1aa2` | 4.9 / 4.10（レビュー1周目の BLOCK-1 / HIGH-1）。docs 2ファイル（+2 / -2） |
| `000f6f9` | レビュー2周目の NEW-2。規約の語彙を spec と揃える（`system-structure.md` 9行目・94行目、+2 / -2） |

## 7. レビューと完了承認

- [x] 7.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行する。対象はこの change の成果物（steering の2文書・docs の4ファイル・delta spec）と、規約が steering に一本化され docs 側に重複が残っていないかの整合。レビューが完全にパスするまで続ける

| 周 | 判定 | 内訳 | 対応 |
| --- | --- | --- | --- |
| 1 | NAUGHTY | Block 2 / High 4 / Medium 5 / Low 2 | Block・High・Low を修正。Medium 3件は範囲外・ユーザー決定として報告に留めた |
| 2 | NAUGHTY | Block 0 / High 1 / Medium 3 / Low 2 | すべて artifact の記録精度。全件修正 |
| 3 | escalate | Block 0 / High 0 / Medium 2 / Low 2 | MAX 3周に到達。残4件（spec の傘の文言・proposal の語彙・tasks の参照2件）を修正 |
| 追加確認 | **PASS** | — | 4件すべて解消。語彙が proposal / design / spec / tasks / docs で一致することを確認 |

主な修正: 規約文の逐語引用の除去（`structure-migration.md`）、ツリー注記からの規約語句の除去（`system-structure.md:42`）、steering `tech.md` の追加行から README と重複する事実の除去、delta spec の線引きを ADDED の列挙に揃える、design D4 を実際に採った手段（curl）へ更新。
- [ ] 7.2 ユーザーから完了承認を得る
