## Context

動機は proposal「Why」。ここは形を決めるのに要る現状だけを書く。

- **phase の書き手は段ごとに1つ。** U14 が `approved` を書き、U10 は書かない（`api/session/promote`）。完成の記録も同じ形で U15 を1本置く（proposal「誰が、いつ、どう書くか」）
- **`invocation` の書き込みは A8 の1本に集まっている。** `writeInvocation`（`session-store.ts`）が唯一の実体で、A8 の endpoint も invokeAi の書き手（`invoke.ts` の `setInvocation`・`ai.ts` の組み立て失敗経路）もここを呼ぶ。上層への合図 `creationOutcomeOf` もここに付いている
- **invokeAi の成功経路は既に「作業が行われたか」（`didWork`）で分岐している**（`ai.ts` の `runBuiltInvocation`、`fix-steering-empty-completion` で steering にも渡った）。判定は呼び出し側（`invoke.ts`）が渡し、`invokeAi` は渡された関数を呼ぶだけ
- **phase の値と読みが散っている。** 値の集合は `shared/stroke.ts` の型と `session-store.ts` の zod に、生読みは `handler/phase.ts`・`session-core.ts`・`creating.ts` の3箇所にある（proposal「phase の値がばら撒かれている現状」）
- **承認依頼はファイルとして残る。** 本家 `request-approval` が `<project>/.spec-workflow/approvals/<category>/<id>.json` を書く（実測。steering のものは `approvals/steering/`）。本家の REST は起動中しか答えない（ADR-0005）
- **`server/plugins/` には起動時に1回だけ走るプラグインの前例がある**（`01.reap-running.ts`）。参照は U12、書き込みは A8 と、API を通す作りになっている
- **U 系の endpoint は実装では `server/api/strokes/[id]/` に在る**（ticket「見つけた課題」、[[fix-session-api-path]]）。削除の2本だけが `server/api/sessions/[id]/`・`server/api/projects/[projectId]/` に在る
- 制約: ADR-0014（暗黙の状態分岐を持たない。責務の不成立は対象外）・ADR-0005（本家のデータから導出しない）・`portal/batch`（巡回の条件を変えない）
- **`.scratch/stroke-board-frontier/decisions.md` は親にも worktree にも存在しない**（config が指す資料が無い）。本 design は `CONTEXT.md`・`docs/specs/`・`docs/adr/`・`openspec/specs/` だけを根拠にした

## Goals / Non-Goals

**Goals:**

- `approved` と `activated` の2点で生成中の区間を挟み、行（一覧）も配信（決着）も phase だけを見る
- 成功の決着の出どころを A8（`writeInvocation`）から U15 へ移す
- phase の値の集合を1箇所に置き、`activated` を落とす分岐（proposal の Impact・ticket「落ちる分岐」）を全部通す
- 生読みの `readPhase` を減らす。`handler/phase.ts` を没にする
- 既存の `approved` な `state.json` を起動時に書き上げる

**Non-Goals:**

- U 系 endpoint の path を `/api/sessions/` へ揃えること（[[fix-session-api-path]]）。U15 だけは docs の定義に従い `server/api/sessions/[id]/` に置く
- `didWork` の判定そのものを変えること（`fix-steering-empty-completion`）
- 画面の変更。知らせる面・モーダル・やり直す・破棄する・入場のガードは既にあり、`creation` / `connection` の値の集合も変えない
- 本家との接続（アクティブ判定）の仕組みを変えること。生成中の行をその判定から外すだけ

## Decisions

### D1. phase の値は `shared/stroke.ts` の定数1つから導く

`PHASES = ['stroking', 'proposed', 'approved', 'activated'] as const` を置き、`Phase` はそこから導く。`session-store.ts` の zod も、`session-core.ts` の一覧用の読みも、この定数を見る。**イコール比較の連鎖をどこにも書かない。**

「昇格済みか」（`approved | activated`）は各所で要る。`isPromotedPhase(phase)` を `shared/stroke.ts` に1つ置く。`handler/phase.ts` の `isAfterApproval` と違い、**読みを含まない純関数**で、endpoint の外に「どの局面を許すか」の判断を置くものではない（各 endpoint は自分の受理範囲を自分の literal で書く。D5）。

代替: 各所に `=== 'approved' || === 'activated'` を足す。値が5つ目に増えたとき同じ事故が起きるので採らない。

### D2. `state.json` の昇格後の形は `approved` と `activated` で同じ

`SessionState` の昇格後の分岐を `PromotedState`（`phase: 'approved' | 'activated'`、`projectName`・`invocation`・`retries`・`runId`）として1つにまとめ、zod は同じフィールド定義を2つの literal 分岐で共有する（`z.discriminatedUnion` は分岐ごとに literal が要る）。

`activated` への書き込みは `writeState(name, { ...state, phase: 'activated' })` の1行で、他のフィールドを触らない。`runId` を保つのは、完成後の steering の起こし直しが会話の続きから始まるためである（`agent/invocation`「完成した対象も記録を持つ」）。

### D3. U15 は phase と承認依頼の有無だけを見て、`invocation` に触れず、busy を見ない

`server/api/sessions/[id]/activate.post.ts`。判定の順序と応答:

| 順 | 判定 | 通らないとき |
| --- | --- | --- |
| 1 | 対象が在る（`requireSessionId`） | 404 |
| 2 | `readState` が読める | 409 `phase`「state.json を読めない」（壊れたものを書き換えない） |
| 3 | phase が `approved` | `stroking` / `proposed` → 409 `phase`「まだ昇格していない」、`activated` → 409 `phase`「既に完成している」 |
| 4 | `.spec-workflow/approvals/` 配下に承認依頼のファイルが1件以上在る | 409 `phase`「まだ完成していない」 |
| 5 | `writeState` で `activated` を書く | 500 |
| 6 | `broadcastProjectCreation(name, 'done')` | 配信の失敗は応答に関わらない（U14 と同じ） |

**承認依頼の有無は `approvals/` の直下と1段下のディレクトリの中の通常ファイルを数えるだけで決める。** 中身を読まず、状態（保留・承認・却下）を問わない（`api/session/activate`「完成の根拠は承認依頼の存在とする」）。本家の REST を呼ばない（ADR-0005）。category を `steering` に限らないのは、完成の意味が「レビューできる状態に達した」であって「steering の承認依頼が在る」ではないためと、category の名前は本家の都合で変わりうるためである。

**busy ガードを持たない。** U15 は invokeAi が `invocation` を `idle` に変える**前**に叩く（D4）。その時点で対象の実行はまだ占有中なので、busy を見ると自分の実行に弾かれる。`invocation` を書かないのは spec の規定で、書く理由も無い——実行の記録は invokeAi が U15 の応答を見てから書く。

**409 はすべて `phase` の kind で返す。** 画面は 409 を「待てば通る」と読む（`utils/conflict`）。U15 を叩くのは invokeAi と起動時の書き上げだけで、どちらも 409 を「今は完成でない」と読んで `failed` にする／飛ばす。

ADR-0014 との関係は proposal「U15 と ADR-0014 の関係」。引数を取らないので契約から読める判定は「id の対象がその責務（完成の記録）を成立させるか」だけである。

代替: U14（昇格）に `{ phase }` を足す。U14 は本文を取らない契約で、名前を引数で受ける余地を開くので採らない。A8 に `activated` を書かせる。A8 は `invocation` の口で、phase を書き始めると「値をそのまま書くだけ」の契約が崩れるので採らない。

### D4. invokeAi は「完成の記録」を `didWork` と同じ形で呼び出し側から受け取る

`AiRun` に `recordCompletion?: () => Promise<boolean>` を足す。`runBuiltInvocation` の成功経路:

```
result.ok
  └ recordCompletion が在る（生成中の steering）
       └ 呼ぶ。true → idle / false → failed      ※ didWork は見ない
  └ recordCompletion が無い（ストローク・完成済みの steering）
       └ didWork が false → failed
       └ それ以外        → idle
```

**完成の記録は作業の判定に代わる。** `didWork` を先に見る形にすると、起こし直しの実行が文書を出さず承認依頼だけを出したとき（文書は前の実行で済んでいる）に `failed` へ倒れ、承認依頼が在るのに誰も完成を記録できないまま上限まで落ちる（レビュー指摘 2026-09-02）。承認依頼が在れば作業は済んでいるので、生成中の steering では U15 の受理だけを見る。

`invokeAi` に新しい判定を作らない。「いつ叩くか」は関数が渡されているかどうかで決まり、それを決めるのは呼び出し側（`invoke.ts`）である——`didWork` と同じ置き方で、`agent/invocation`「起動処理は何の作業かを判定してはならない」を守る。

`recordCompletion` の実体は `invoke.ts` の steering 分岐に置き、`phase === 'approved'` のときだけ渡す。`$fetch(activatePath(id), { method: 'POST' })` が 2xx なら true、それ以外（409・404・不達）は false。**不達も false にする**のは、記録できていないものを完成と扱わないためで、`failed` に倒れれば巡回が起こし直し、次の実行の完了時にもう一度記録を試みる。例外は1つで、断られた時点で phase を読み直し **既に `activated` なら true** とする——起動時は巡回の初回と書き上げが同時に走るので、`approved` として起こした実行の完了時に U15 が「既に完成している」で断ることがある。目的は果たされているので `failed` に倒さない（レビュー指摘 2026-09-02）。判定は U15 の応答の文言ではなく phase の読み直しで行う。

そのために `kick` は `kind` の代わりに **phase を受け取る**。`kind`（`stroke` / `steering`）・`runId`・`recordCompletion` の3つはいずれも phase から導くので、導出を `invoke.ts` の1箇所に集める。U13 は `state.phase` を渡すだけになり、`invoke-agent.get.ts:61` と `:72` の `=== 'approved'` は消える。

`activatePath(id)` は `submission-path.ts` に並べる（`invoke.ts` と `server/plugins/` の両方から読む。循環 import を避ける置き場は A8 の path と同じ理由）。

代替: `runBuiltInvocation` が cwd の phase を自分で読んで U15 を叩く。起動処理が用途を判定することになり、spec に反するので採らない。

### D5. 削除の2本は `readState` で読み、受理範囲を自分の literal で持つ

`handler/phase.ts` を消す。

| endpoint | 受理する phase | 断る理由 |
| --- | --- | --- |
| U11 `DELETE /api/sessions/:id` | `stroking` / `proposed` | それ以外 → 409 `phase`「承認済みのものはここでは消せない」 |
| P1 `DELETE /api/projects/:projectId` | `approved` | `stroking` / `proposed` → 409「まだプロジェクトになっていない」、`activated` → 409「中身のあるプロジェクトはここでは消せない」 |

P1 の「本物は消さない」の根拠を `.spec-workflow/` の有無から `activated` へ移す（`api/project/delete` delta）。`hasSpecWorkflow` は消す。

**壊れた `state.json` は消さない。** 対象のディレクトリは在るが `readState` が失敗するとき、409 `phase`「state.json を読めない」で断る。`handler/phase.ts` の「分からないものを通さない」を引き継ぐ。存在の確認（404）は `readState` の前に置く（`sessionExists`）——無いものに「読めない」と言わない。

P1 は `projectId` から名前を引くのに保存先を走査する。走査はそのまま（`resolveName`）。

### D6. 生読みは `session-core.ts` の一覧用の1本だけ残し、値の集合は D1 から引く

| 場所 | いま | 後 |
| --- | --- | --- |
| `handler/phase.ts` `readPhase` | 生読み・literal 連鎖 | **没** |
| `creating.ts` `isApproved` | 生読み・`=== 'approved'` | `readState` を使い、`isPromotedPhase` で拾う。読めないものは飛ばす（今と同じ） |
| `session-core.ts` `readPhase` | 生読み・literal 連鎖・外れた値は `unknown` | 生読みは残す。値の判定を `PHASES` に含まれるかに変える。外れた値・読めないものは `unknown` のまま |

`session-core.ts` に `readState` を持ち込まないのは、core が Nitro 無しの経路（script）から読まれる層で、`session-store.ts` は配信（`control/board`）を import しているためである。一覧は壊れた1件で全体を落とせず、`unknown` に倒す挙動も残す（`api/session/list`）。proposal の「読みは `readState` に1本化」は**サーバ層について**成り立ち、core 層に軽い読みが1本残る。

### D7. `creationOutcomeOf` は失敗だけを流し、成功は U15 が流す

```
creationOutcomeOf(phase, invocation)
  phase が approved でない → null
  invocation === 'error'  → 'failed'
  それ以外                → null       （idle → 'done' を消す）
```

`activated` の対象で `error` に達しても流さない。失敗のモーダルは「やり直す／破棄する」を出し、破棄は P1 を叩く。完成済みのプロジェクトは P1 が断る（D5）ので、モーダルを出しても選べない選択肢が並ぶ。完成済みの steering の起こし直しが `error` に達したときの知らせ方は、この change の外（`stroke/frontier`「実行が error に達したら画面が示し」の対象でもない）。

`writeInvocation` のコメント（「行の判定は `.spec-workflow/` の有無から導く」「`invocation` を合図の材料に使っても…」）は書き直す。proposal「Why」が指摘した半端な状態の追認を残さない。

### D8. 行の `creation` は phase から引き、生成中の行を接続の判定に掛けない

`listPromotedProjects` は `{ name, path, phase }` を返す（phase は `approved | activated`）。`directory.ts` の組み立て:

| 走査（`.spec-workflow` 有り） | 昇格の記録 | 行 |
| --- | --- | --- |
| 有 | 無（外から置かれた） | `creation: 'done'`、接続の判定に掛ける |
| 有 | `activated` | `creation: 'done'`、接続の判定に掛ける |
| 有 | `approved` | `creation: 'in-progress'`、`connection: 'disconnected'` 固定。**registry に載っていても `active` にしない** |
| 無 | `approved` | `creation: 'in-progress'`、`connection: 'disconnected'`（今と同じ） |
| 無 | `activated` | 起こりえない（承認依頼が在れば `.spec-workflow` も在る）。起きたら `done`・`disconnected` |

行の型（`ProjectSummary`）は変えない。`creation` と `connection` の値の集合は今のままで、画面の入場ガード（`connection !== 'active'` で弾く）はそのまま効く。生成中の行の `projectId` は今と同じく導出で埋める（決着の直後に承認画面を開くため）。`pendingApprovals` と `lastModified` は生成中の行では `null` のまま（今と同じ。走査で拾えても埋めない——生成中に本家の値を見せない）。

### D9. 起動時の書き上げは専用プラグインが U12 → U15 で行う

`server/plugins/01.activate-approved.ts`。起動のたびに1回:

1. U12（`/api/strokes`）を取る。取れなければ警告して何もしない
2. `phase === 'approved'` の各件に U15 を POST する
3. 2xx を「書き上げた」、409 を「まだ完成でない（生成中のまま残す）」として数え、件数を1行でログに出す。その他の失敗も件数だけ出して続ける

参照は API、書き込みも API（`01.reap-running.ts` と同じ作り）。判定の根拠は U15 の1箇所に閉じ、プラグインは判定を持たない（`project/generation`「判定の根拠は `api/session/activate` と同じとし、別の基準を持ってはならない」）。

`01.reap-running.ts`・`01.retry-failed.ts` との順序の取り決めは持たない。U15 は `invocation` に触れず busy も見ないが、**`state.json` は1ファイルで書き込みは丸ごと**なので、「読んで書く」の2手が後始末（A8）と重なると古い写しで互いを上書きしうる（レビュー指摘 2026-09-02）。そのため `session-store.ts` に `withStateLock(sessionId, run)` を置き、read-modify-write をセッション単位で直列化する。通すのは A8（`writeInvocation`）・U15・会話 id の記録（`invoke.ts` の `conversationWriter`）の3つで、書き手はすべて同一プロセスなのでプロセス内の待ち行列で足りる。

起動のたびに走らせても、`activated` になった対象は U12 で `approved` として出てこないので、2回目以降は何もしない。

### D10. U7（回答）は承認以降を1つの門で断る

`answer.post.ts:29` の `=== 'approved'` を `isPromotedPhase(state.phase)` に変え、メッセージは「承認済みのセッションには回答できない」のまま。`activated` が「答えるべき問いが無い」に落ちる経路を閉じる。

## Risks / Trade-offs

- **[archive の順序] `fix-steering-empty-completion` と同じ Requirement を MODIFIED している** → あちらを先に archive する（proposal「対象外」）。あちらの文はこの change の delta に含めてあるので、順序を守れば main は欠けない
- **[巻き戻し] `activated` を書いた `state.json` が残ったまま `Phase` から `activated` を外すと、`readState` が失敗して削除の2本がどちらも受理しなくなる** → 巻き戻すときは、`state.json` の `activated` を `approved` へ戻す一度きりの手順を先に踏む（D9 の逆）。この手順は docs の Migration に書く
- **[完成の判定が緩い] 却下済みの承認依頼だけでも完成になる** → spec の決め（状態を問わない）。完成の意味は「レビューできる状態に達した」であって「承認された」ではない
- **[U15 の不達] invokeAi から U15 に届かないと `failed` に倒れ、巡回が steering を起こし直す。起こし直しは会話の続きなので、承認依頼が既に在れば次の完了時に U15 が受理する** → 余分な実行が1回走るが、成果物は壊れない。不達を `idle` に倒す方が「完成の記録が無いのに完了」を作るので採らない。起こし直しが文書を出さなくても U15 の受理で完了になる（D4。`didWork` を先に見ない）
- **[U15 の承認依頼の数え方] 本家の `approvals/` の配置が変わると数え損なう** → 実物（2.2.7）で確かめた配置（`approvals/<category>/*.json`、隣に `.snapshots/`）を spec と handler に書いた。配置が変わればここを直す
- **[起動時の書き上げの取りこぼし] U12 に載らないもの（openspec ルートや `config.yaml` が壊れた昇格済みプロジェクト）は書き上がらず、生成中のまま並ぶ** → 一覧に載らないものは巡回の対象でもなく、今も扱いが定まっていない。この change では拾わない。件数をログに出すので気づける
- **[行の見え方] 既に `.spec-workflow` を持つ `approved` のプロジェクト（導入前に承認依頼まで至らなかったもの）は、導入後「アクティブ」から「生成中」に変わる** → 正しい表示である。中身が無いので入場しても 404 になっていた（ticket「追加の観測」）
- **[生読みが1本残る] `session-core.ts` の `readPhase`** → 値の集合は D1 から引くので、値が増えても直す場所は `shared/stroke.ts` だけである

## Migration Plan

1. `shared/stroke.ts`（D1）→ `session-store.ts`（D2・D7）→ `session-core.ts`・`creating.ts`（D6）の順に、`activated` を読める状態を先に作る
2. U15 を置く（D3）。`activatePath` を `submission-path.ts` に足す
3. `invoke.ts`・`ai.ts`・`invoke-agent.get.ts`（D4）
4. 削除の2本と `handler/phase.ts` の削除（D5）、`answer.post.ts`（D10）
5. `directory.ts`（D8）
6. 起動時の書き上げ（D9）。**起動して一度走らせ、実物の `/opt/projects` の `approved` が書き上がることを確かめる**
7. docs の整合反映（proposal「上位資料への整合反映」の表）。`CONTEXT.md`「生成中」の一文、`docs/specs/api/` の目録・契約・`ws/delivery.md`・`projects/delete.md`、`docs/specs/plan/portal-stroke-exit.md` の図

巻き戻し: 上の Risks のとおり、`state.json` の `activated` を `approved` へ戻してからコードを戻す。

## Open Questions

- ~~U15 が `.spec-workflow/approvals/` を読むとき、本家の `approvals/` 配下に category 以外のファイルが在るか~~ → 実装時に確認（2026-09-02）。category の直下に `approval_<ts>_<id>.json` が並び、隣に `.snapshots/` ディレクトリが在る。`approvals/` 直下にファイルは無い。category の中の隠しでない `.json` だけを数える（spec `api/session/activate`「完成の根拠は承認依頼の存在とする」に明記）
