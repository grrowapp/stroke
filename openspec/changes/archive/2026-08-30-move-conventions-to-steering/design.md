# move-conventions-to-steering — design

## Context

動機は `proposal.md` の Why を参照。ここでは手を動かすときに効く制約だけを書く。

- **steering はリポジトリの外にある。** 実体は `/opt/projects/stroke-board/.spec-workflow/steering/` の3本（`product.md` / `tech.md` / `structure.md`）で、git 管理下ではない。この worktree（base2）に `.spec-workflow/` は存在しない。
- **`.spec-workflow/` へ直接書けない。** `openspec/specs/upstream-connection/spec.md`（94行目）が、本家および各プロジェクトの `.spec-workflow/` への直接の書き込み・更新・削除を MUST NOT で禁じている。ファイルに触れるのは本家で、stroke-board は API を呼んで依頼するだけ。
- **本家の保存先は `projectPath`。** `PUT /api/projects/:projectId/steering/:name` は `join(project.projectPath, '.spec-workflow', 'steering', '<name>.md')` へ書く（本家 `src/dashboard/multi-server.ts:1005-1006`）。承認 content の読み取りと違って `workspacePath` を見ないので、base2 側に `.spec-workflow/` のコピーが生まれることはない。
- **stroke-board 自身が steering の編集画面を持つ。** `app/pages/projects/[projectId]/steering/[name].vue` が `DocumentEditor` を載せ、保存は `saveSteeringDocument` → `server/api/projects/[projectId]/steering/[name].put.ts` → 本家 API と流れる。`can-save` は `upstreamConnected` のときだけ真。

## Goals / Non-Goals

**Goals:**

- コーディング規約の実体を steering に一本化し、`docs/` 側は steering への参照だけを持つ状態にする
- 「構造」と「規約」の線引きを spec に固定し、次に規約を書く人が置き場を迷わないようにする

**Non-Goals:**

- `nuxt.config.ts` へ `imports: { autoImport: false }` を入れる実装（`align-coding-conventions` の担当）
- `README.md` のテスト節の移動。利用者向けの実行手順であって規約ではない
- steering に残る食い違い・欠落の是正 — 本家の基準（`tech.md` は v2.2.5、`docs/adr/0008` は 2.2.7）、ツリーの欠落（`test/` / `assets/` / `prompt/`）、スクリプト一覧の `test:live`。いずれも規約ではないので、この change では触らず報告に留める（D3）

## Decisions

### D1. 線引きは「置き場そのもの」対「置き方の取り決め」

`test/` というディレクトリが在ることは**構造**なので `docs/specs/core/system-structure.md` のツリーに残す。「単体テストはソースと同居させない / `test/` にソースの構造をそのまま写す / 固定データは `__fixtures__/` / E2E は `e2e/`」は**規約**なので steering へ移す。

退けた案: テスト関連を丸ごと steering へ移す。→ `system-structure.md` のツリーから `test/` が消え、`architecture-docs` の Requirement「資料は層・配置・依存・流れを示す」が要求する「ディレクトリツリーと、各ディレクトリが何を持つか」を満たせなくなる。

### D2. steering の書き分け — 置き場は `structure.md`、通す門番は `tech.md`

置き場の規約は `structure.md`（Naming Conventions / File Organization Principles の並び）に、通す門番の規約は `tech.md` の Testing Requirements に置く。

根拠は既存の分担。`structure.md` は「どこに何を置き、どう名付けるか」を扱い、テストのファイル名規約（`対象と同じ名前に .test.ts`）も既にそこにある。`tech.md` は「何を使ってどう検証するか」を扱い、Testing Requirements には既に「ロジックは Vitest」「導線は Playwright」がある。門番の規約はその続きになる。

退けた案: テスト関連を全部 `tech.md` に寄せる。→ 置き場の話が命名・配置の規約から離れ、`structure.md` を読んでも置き場が分からなくなる。

### D3. steering へ移すのは規約だけで、事実は移さない

D1 の線を steering 側にも同じく引く。steering に入れるのは取り決めだけで、次のものは入れない。

| 対象 | 分類 | 扱い |
| --- | --- | --- |
| 単体テストの置き場・`__fixtures__/`・E2E は `e2e/` | 規約 | steering へ移す |
| 型チェック・ユニット・E2E の3つを通す / `test:live` は `test` から外す | 規約 | steering へ移す |
| steering のツリーに `test/` が無い | 構造の欠落 | 触らない。報告に留める |
| `tech.md` のスクリプト一覧に `test:live` が無い | 事実の欠落 | 触らない。報告に留める |
| どのコマンドが何を実行し本家の起動が要るか | 事実 | `README.md` のテスト節が持つ。移さない |

退けた案: 規約が `test/` を名指しするので、参照先として steering のツリーにも `test/` を足す。→ D1 で「ディレクトリが在ることは構造」と引いた線を、同じ change のなかで越えることになる。steering `structure.md` は「詳細は `docs/specs/core/system-structure.md` を参照する」と既に委譲しており、`test/` の在処はその参照先で足りる。

なお、steering のツリーとスクリプト一覧の欠落は実在する。この change の範囲外というだけで、正しさの問題としては残る（proposal の報告に挙げた）。

### D4. steering の更新は本家の API を呼んで行う

`.spec-workflow/` を直接編集しないという制約（Context 参照）を満たす経路は、本家の `PUT /api/projects/:projectId/steering/:name` を呼ぶことである。`upstream-connection` spec が許す書き込み3口のひとつ。

**採った手段**: `curl` で本家 API へ PUT する。差し込みはアンカーの一意性を検証するスクリプト（`/tmp/move-conventions-to-steering-backup/patch-*.mjs`）で行い、原本は読むだけにする。手で全文を書き直すとドリフトが混ざるため。

当初この design は「stroke-board の steering 編集画面（`app/pages/projects/[projectId]/steering/[name].vue` の `DocumentEditor`）から保存する」としていた。`.claude/settings.json` の deny に `Bash(curl *)` があり curl が使えなかったためである。apply の途中でユーザーがその deny を外し、allow 側の `Bash(curl 'http://localhost:5000/api/projects/*/steering/*' *)` が生きたので、curl に切り替えた。呼ぶ API は同じで、制約の満たし方は変わらない。

画面からの保存も引き続き有効な手段で、本家ダッシュボードが動いていれば `can-save`（`upstreamConnected`）が真になる。

退けた案:

- **ファイルを直接編集する** — `upstream-connection` spec の MUST NOT に反する。permission でも `Edit(//opt/projects/**/.spec-workflow/**)` が deny されている
- **MCP ツールを使う** — `mcp__specworkflow__*` に steering を保存する口が無い（approvals / log-implementation / spec-status / spec-workflow-guide / steering-guide の5本）

### D5. 順序は steering が先、docs が後

docs の記述を先に参照へ置き換えると、まだ steering に無い規約を指す期間ができる。steering の2文書を確定させてから docs を薄くする。

ロールバックは、docs 側は git で戻せる。steering 側は git 管理外なので、**入れた文面を tasks 2.1 / 3.1 に全文で控える**。この change の追加は差し込みだけで削除が無いため、控えた行を消せば変更前に戻る。あわせて編集前のファイルを `/tmp/move-conventions-to-steering-backup/` へ退避するが、`/tmp` は揮発するのでロールバックの根拠はあくまで tasks 側の控えとする。

### D6. `docs/specs/core/file-composables.md` は規約文だけを抜き、実態の記録は残す

34行目・58行目のうち、「明示 import を維持する / auto-import は使わない」という**規約の文面**を steering への参照に置き換える。「`nuxt.config.ts` に `imports` の設定が無く auto-import は既定で有効のまま」「ストローク側は明示 import 無しで動いている」「統一は `align-coding-conventions`」という**現状の記録**は残す。規約ではなく事実であり、`architecture-docs` の Requirement「資料の記述は実装で裏が取れる」が求めている書き方でもある。

## Risks / Trade-offs

- **本家ダッシュボードが停止していると steering を保存できない** → 書けるのは本家だけなので、本家が落ちていれば保存の口そのものが無い（画面から入る場合は `DocumentEditor` の `can-save` が偽になる）。tasks の先頭で本家の起動と対象 projectId を確かめる
- **steering は git 管理外で、変更が worktree のコミットに残らない** → git に残るのは docs 側と spec 側の差分だけ。steering へ入れる文面を tasks に書き出し、何を入れたかが change から追える状態にする
- **steering の承認で差し戻される** → 差し戻しコメントの selectedText が現ファイルに見つからないときは、承認 content の読み取りが `workspacePath` 優先であることによる表示不整合を疑う。ただし base2 に `.spec-workflow/` が無いため、steering については /opt の実体がそのまま表示される
- **規約文を抜いた docs から、なぜ明示 import なのかが読めなくなる** → 参照を steering へ張る。D6 のとおり実態と引き継ぎ先は残す
- **steering の変更が本家の WebSocket 通知に出ない** → `tech.md` の Known Limitations が挙げるとおり、ステアリング文書の更新は payload が変化せず検出できない。保存できたかは保存後に読み直して確かめる（PUT の応答と、ファイルのバイト数・差分）
