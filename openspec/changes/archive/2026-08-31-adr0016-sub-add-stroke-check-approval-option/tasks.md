# adr0016-sub-add-stroke-check-approval-option Tasks

**この change の実装は、この tasks を通らずに入った**（2026-08-30 に判明）。`--approve` /
`waitForSteering` / 名前の衝突の再試行 / 片付けの対象は、セッション開始時点で作業ツリーに
未コミットで置かれていた。`git log` に痕跡が無く、誰が書いたかは分からない。それを
コミット `5d6cbb5`（メッセージは片付けの修正だけを述べている）へ同梱してしまった。

**下のチェックは「この手続きで作業した」ではない。** 現物のコードを1件ずつ読んで、その task が
求める振る舞いが在ることを確かめた印である（監査 2026-08-30。根拠の行を各項目に添えた）。
**実行して確かめる必要がある項目には付けていない。** 3.0 / 3.0b と6章だけが手続きを通っている。

## 1. 承認まで進める

- [x] 1.1 `--approve` オプションを足す。渡したときだけ承認へ進み、既定は proposal の着地で止める（specs「どこまで進めるかを選べる」。承認は不可逆なので既定で走らせない）
      — 根拠: `stroke-check.ts:159` `args.includes('--approve')`、`:405` `approveRequested ? await approve(page) : null`。渡さなければ `approved` は null のまま proposal で終わる
- [x] 1.2 承認の操作をブラウザから行う。「承認して作る」→ モーダル → プロジェクト名の入力欄（既定値が入っている）→ 「作る」の順（`app/pages/strokes/[sessionId]/proposal.vue`、`app/components/review/Modals.vue`）
      — 根拠: `stroke-check.ts:612-640`。`getByRole('button', { name: '承認して作る' })` → `getByRole('dialog')` の textbox → `getByRole('button', { name: '作る', exact: true })`。実画面のラベルと一致（`proposal.vue:104` が「承認して作る」、`Modals.vue:89` が「作る」）。
      **task の文面を直した**: 確定ボタンを「承認」と書いていたが、実画面は「作る」である
- [x] 1.3 承認の前に `settle` を通す。承認は `phase` が `proposed` のときだけ通り、AI の実行中は 409 で弾かれる（既存の `answer` と同じ理由。実測 2026-08-28）
      — 根拠: `stroke-check.ts:610` `await settle(page)`（`approve()` の最初の行）
- [x] 1.4 名前の衝突（409 `name-conflict`）でサフィックスを足して再試行する。**同じ概要を流せば同じ名前が提案されて必ず衝突する**ので、人が毎回考えない形にする（design の Decision）
      — 根拠: `stroke-check.ts:629-654`。`APPROVE_NAME_ATTEMPTS`（5）回まで `${proposed}-${attempt}` で出し直し、`response.status() === 409 && body.includes('name-conflict')` のときだけ `continue`
- [x] 1.5 衝突以外の 409（AI が実行中 / phase 不整合）は再試行せず落とす。原因が違うものを同じ扱いにしない
      — 根拠: `stroke-check.ts:655` `throw new Error(...)`。`name-conflict` の分岐を通らなかったものはその場で落ちる
- [x] 1.6 `--send-back` と併用できることを確かめる。差し戻し → 出し直し → 承認を1回の実行で通せる

      **確かめた（2026-08-31。セッション `6a17b326-…`）。** `--send-back --approve --cleanup` の
      1回の実行で次まで通った。

      1. 4往復で proposal 着地（`phase: proposed`）
      2. haiku が書いた指摘で差し戻し——「『決めていないこと』に挙がっている項目が決まらないと
         MVP の実装範囲が定まらない」という、中身のある指摘だった
      3. エージェントが `get-send-back` を読んで出し直し
      4. 承認へ進み、`setai-3` が既にあったので名前を変えて `setai-4` で通った（1.4 の再試行も
         同じ実行で働いた）
      5. 承認後の steering 工程まで到達

      コードの形（`sendBack` → `approve` → `waitForSteering` の並び）ではなく、**実際に1回の
      実行で通ったこと**を根拠にする

## 2. steering 工程の追跡

- [x] 2.1 承認後の遷移先（`/projects`）から、**承認で使った名前**でプロジェクトを探して開く。projectId を別途解決しない（design の Decision）
      — 根拠: `stroke-check.ts:677` `/projects/${projectName}/steering` を直接開く。承認は
      セッションディレクトリを `<projectName>` へ改名するだけなので、プロジェクトの id は
      承認で使った名前そのものである（contract U10）。一覧を探す処理は持たない
- [x] 2.2 `/projects/<projectId>/steering` を開き、product / tech / structure の状態を画面から見る。**endpoint は直接叩かない**（specs「操作はブラウザから行う」）
      — 根拠: `stroke-check.ts:678` `page.goto(url)`、`:680` `getByTestId('steering-list').getByText('利用可')`。`$fetch` も `curl` も通らない
- [x] 2.3 steering の着地を判定する。3文書すべてが揃うのを待つか、1つでも書かれれば良しとするかは、実機で1周させてから決める（design の Open Question。`get-steering` の成功経路が一度も通っていないため実態が不明）
      → **3本すべてが揃うのを待つ。判定は書かれた文書そのもので行う**（2026-08-31）。

      実機で1周させた結果（プロジェクト `setai-3`）、エージェントは案内のとおり
      product → tech → structure を1本ずつ提出し、**3本とも 200 で受理された**。
      1本で良しとする理由が無い——3本揃うのが正常な着地である。

      **画面（`/projects/<name>/steering`）では判定しない。** あの画面は本家 dashboard の
      `GET /api/projects/:id/info` に依存し、本家は**起動中のプロジェクトしか返さない**
      （ADR-0006）。プロジェクトが載るのは、それをワークスペースとする MCP サーバーが
      動いている間＝steering の claude が動いている間だけで、**claude が終わった瞬間に
      画面は「未接続」へ戻る**。実測でも、3本すべてが書かれて `submit-document` が3回とも
      200 を返しているのに、一覧は5回開き直しても出なかった。画面で判定すると、合否が
      「claude の終了と画面の再読み込みのどちらが先か」という競争になる。

      `.spec-workflow/steering/{product,tech,structure}.md` の有無で数える形に変えた。
      一覧は開くだけ開いて、出れば人が見るための表示として使い、出なくても落とさない
- [x] 2.4 待ちの上限は既存の `ROUND_TIMEOUT_MS` に揃える。待つ間は**呼び出しの回数の増加**を進捗として表示し、止まっているのか進んでいるのかを見せる（既存の `waitForNext` / `settle` と同じ用法）
      — 根拠: `stroke-check.ts:681` `Date.now() + ROUND_TIMEOUT_MS`、`:682,705` `logEntryCount()` の差分を進捗に出す。
      **task の文面を直した**: 「`logNames()` の増加」と書いていたが、ログはセッションごとに
      1ファイルへ追記されるのでファイル数は増えない。`# <日時>` の見出し行を数える
      （`logEntryCount`）形に直っている（`adr0016-sub-update-debug-log-per-session` の波及）
- [x] 2.5 承認後の待ちにも画面の取り直しを適用する（`RELOAD_INTERVAL_MS`）。dev がモジュールを取り落とすと、サーバー側が進んでいても画面が固まる（ticket `stabilize-dev-module-delivery`。change は未起票）
      — 根拠: `stroke-check.ts:693-700`。`RELOAD_INTERVAL_MS` を超えたら `page.goto(url)` で取り直し、経過の計測もやり直す

## 3. 片付けの対象

- [x] 3.0 `deleteSessionCore` から dir を消す部分を `removeSessionDir` として切り出す。**存在検査と phase 検査は `deleteSessionCore` に残し、endpoint（U11）と CLI（`yarn session delete`）の振る舞いを変えない**。両者が同じ core を通るという設計は保つ（`session-core.ts` のコメント「片方だけ守っても意味がない」）
      — 根拠: `server/utils/stroke/session-core.ts` に `removeSessionDir` が export され、`deleteSessionCore` は検査の後にそれを呼ぶ
- [x] 3.0b `scripts/stroke-check.ts` の `removeSession` を `rmSync` から `removeSessionDir` の呼び出しへ差し替える。**道具が独自に消すと削除の経路が3本になる**。判定を迂回するのではなく、判定の無い層を正面から使う形にする
      — 根拠: `stroke-check.ts` の import に `removeSessionDir` が在り、`removeSession` がそれを呼ぶ。`rmSync` の import は残っていない
- [x] 3.1 `--cleanup` の対象に、uuid と承認名の**両方**を候補として持つ
      — **task の文面を直した**（2026-08-30）。元は「承認の有無で**切り替える**」だったが、
      実装は切り替えていない。`approve()` が承認の応答を取り逃したときも名前を返すため、
      切り替えると「改名が起きていないのに uuid が対象から外れる」か「他人の同名プロジェクトを
      消す」のどちらかが起きる。design の Decision も同じ理由で改訂済み。
      — 根拠: `stroke-check.ts:188` `cleanupTargets = new Set<string>()`、`:345,365,391` で
      受理の応答・起動要求の URL・URL 遷移の3段構えで uuid を足す
- [x] 3.2 承認名を足すのは、**改名が起きたことを確かめたときだけ**にする。どちらも「この実行が作ったもの」に限る（specs「片付けの対象は、その実行で作ったものに限る」）
      — **task の文面を直した**（2026-08-30）。元は「承認したなら名前を、しなければ uuid を消す」。
      — 根拠: `stroke-check.ts:413-417`。`!existsSync(uuid) && existsSync(approved)` の両方を
      確かめてから `cleanupTargets.add(approved)`。消す直前にも `isSafeSegment` と存在確認を通す
- [x] 3.3 消せなくても実行を落とさない現在の方針は変えない。片付けは検証の結果とは別の関心で、ここで落とすと合否の報告まで失う
      — 根拠: `stroke-check.ts` の `removeSession` が try/catch で飲み込み、`片付け: … を消せなかった（理由）` を1行出すだけ。`teardown` も例外を投げない

## 4. 実機での確認

**操作はブラウザのみ。** `claude` の直接呼び出し・curl・MCP の直叩きは使わない。

- [x] 4.1 `--approve` を付けて1周させ、承認が通ってプロジェクトが作られることを確認する（`phase` が `approved`、`/projects` に現れる）

      **合格（2026-08-31。セッション `6a17b326-…`）。** 承認が通り `setai-4` が作られ、
      `state.json` は `phase: approved` になった。名前は `setai-3` と衝突したので
      連番で出し直している（1.4 の再試行が同じ実行で働いた）。

      **`/projects` の一覧に出ることまでは、この判定に含めない。** 本家は起動中の
      プロジェクトしか返さないので（ADR-0006）、一覧に出るのは steering の claude が
      動いている間だけである。承認の成否は改名と `phase` で見る（2.3 と同じ理由）。

      **1回目の試行は承認まで届かなかった**（2026-08-30）。`yarn check:stroke --approve --cleanup`。
      3往復（Q1 初期スコープ / Q2 初期対応キー / Q3）まで進んだが、**4往復目で AI の応答が
      得られず**、`ROUND_TIMEOUT_MS`（240秒）待って落ちた。

      ```
      Error: 240000ms 待っても次の問いも proposal も出なかった
      （画面の表示: AI からの応答が得られませんでした。もう一度送信してください。）
      片付け: /opt/projects/420957eb-… を消した
      ```

      画面の文言は `invocation: failed` のもの。待っている間に「応答は返った。次を待っている」
      へ変わっている（118秒時点）ので、呼び出し自体は終わって記録も増えたが、問いも proposal も
      出ないまま `failed` に倒れている。**原因は未特定。** 巡回（60秒間隔）が起こし直す窓は
      240秒の中に2回あったはずで、それでも回復していない。

      なお**片付けは落ちても走った**（`5d6cbb5` の修正が効いている）。承認に届いていないので
      4.4 の確認にはならない。

      **原因が分かった**（デバッグログ `420957eb-….json` の4件目）。4回目の呼び出しは
      **成功しており、proposal も提出されている**——`"subtype":"success"` / `"is_error":false` /
      `"result":"proposal(frontier文書)を提出しました。ステータス204で受理されています。…"`。
      それでも画面は `invocation: failed` の文言を出し、道具は proposal を検知できなかった。
      **成果物は出来ているのに画面が失敗として見せている。** `didWork`（`submittedSince`）は
      A5・A7 の両方を数え、`proposal.post.ts:53` が `notifySubmission` を呼んでいることは
      確認済みなので、「提出が届かない」経路ではない。**未特定のまま残る。**

      **2回目の試行では同じ症状は出ず、承認まで通った**（下記）。再現しないので、この1件は
      観測として残す。

- [x] 4.1b **承認は通る。プロジェクトが作られる**（実測 2026-08-30・2回目の試行）。

      ```
      proposal が名前を出していない。check-stroke-20260830-163107 で進める
      承認: check-stroke-20260830-163107
      ```

      `/opt/projects/check-stroke-20260830-163107/state.json`:

      ```json
      { "phase": "approved", "projectName": "check-stroke-20260830-163107",
        "invocation": "idle", "retries": 0, "runId": "dbd9d469-b673-483a-98fc-6a614ed58ef8" }
      ```

      `phase` が `approved`、ディレクトリは uuid から名前へ改名済み、`runId` が入っている
      ので **steering の起動も走っている**。4.1 の「`/projects` に現れる」は画面で確かめて
      いないので 4.1 は閉じない。

      **`proposal が名前を出していない`** に注意。画面は `ProposalMessage.projectName` を
      名前欄の初期値にするが、MCP ツール `submit-document` には projectName を渡す口が無く、
      MCP 経由の提出では常に null になる（A7 の契約は `{ proposal, projectName? }` を受ける
      のにツールが送っていない）。道具は自前の名前で進めるが、**人が承認する経路では名前欄が
      空で「作る」が押せない**。別 change として起票が要る。

- [x] 4.1c steering 画面への遷移で落ちる。`waitForSteering` の**最初の `page.goto` に
      開き直しが無い**（実測 2026-08-30: `net::ERR_NETWORK_CHANGED`）。待ちのループには
      `RELOAD_INTERVAL_MS` の取り直しが在るが、入口の1回は素通しである。2.5 の手当てが
      入口に及んでいない。`openStrokes` と同じ形で開き直すようにする
      → **直した**。`openSteering` を足し、入口とループの取り直しの両方をそこに通す
- [x] 4.2 **`get-steering` と `submit-document`（`type: steering`）が実際に呼ばれることを証跡で確認する。** `debugLogDir` の生出力から `tool_use` を抽出して数える。この2本は提供以来一度も成功経路を通っていない（`provide-operations-via-mcp` の 5.2 が待っているのはこれである）

      **呼ばれていない。0件である**（実測 2026-08-30）。承認まで通した実行
      （プロジェクト `check-stroke-20260830-163107`、`runId: dbd9d469-…`）の生出力
      `.stroke-check/debug-log/dbd9d469-….json` を走査したところ、
      `mcp__stroke-board__*` の `tool_use` は**1件も無い**。

      **理由が取れた。** その実行の最終結果はこれである。

      ```
      "subtype":"success"
      "result":"Unknown command: /write-steering-v2"
      ```

      claude は `claude.steeringPrompt` の `/write-steering-v2` を**未知のコマンドとして
      弾き**、何もせず正常終了している。だから MCP ツールを1本も呼ばず、
      `.spec-workflow/steering/` は空のまま、`invocation` は `idle` になる。

      **原因はスキルが存在しないこと。** 設定の正（`docs/specs/core/settings-reference.md`
      の `claude.steeringPrompt`）は「起動するスキル `write-steering-v2` はこのリポジトリの
      `.claude/skills/` に在り、`--add-dir` 経由でロードされる」と書いているが、
      **この worktree に `.claude/skills/` は存在しない**（`.claude/` の中身は
      `settings.json` だけ）。資料が実在しないものを前提にしている。

      **`provide-operations-via-mcp` の 5.2 が待っている2本は、この状態では永久に通らない。**

      **prompt を差し替えて通した**（実測 2026-08-30・ユーザー提案）。スキルが無いのが
      原因なので、`claude.steeringPrompt` を一時的にスキルに依らない指示
      （「`get-steering` で現状を見て、`submit-document` で type=steering を3本提出する」）
      へ置き換えて起こし直した。**同じ会話（`runId: dbd9d469-…`）に追記され、ツールが
      呼ばれた。**

      ```
      9  mcp__stroke-board__get-steering
      9  mcp__stroke-board__submit-document
      7  mcp__stroke-board__get-overview
      ```

      **提供以来はじめて2本が呼ばれた。** claude は product / tech / structure の3本を
      書き上げて提出まで行っている。prompt の差し替えは確認後に元へ戻す。
- [x] 4.3 `get-steering` が承認後の steering 工程で 200 を返すのか、flontier と同じく 500 のままなのかを記録する。**この症状を扱う change は現在存在しない**（走査 2026-08-30: `fix-steering-tool-stage-error` は change にも ticket にも実在しない）ため、500 を観測したらこの change で起票する

      **200 でも 500 でもなく、404 だった**（実測 2026-08-30）。prompt を差し替えて
      ツールに到達させたところ、`get-steering` 3回・`submit-document(steering)` 3回の
      **6回すべてが 404** を返した。

      ```
      {"status":404,"errorCode":"upstream_error","error":"対象のプロジェクトが本家の一覧に無い。"}
      ```

      claude は3本とも書き上げて提出しようとしており、**成果物側の問題ではない**。
      承認で作ったプロジェクトが**本家 spec-workflow の一覧に載っていない**ため、
      上流への問い合わせが対象を見つけられない。

      flontier で見えていた 500 とは別の症状である。`fix-steering-tool-stage-error`
      （500 を扱うはずだった change）の起票は要らない。**起票が要るのはこの 404 である**
      （下記 4.3c）。
- [x] 4.4 `--approve --cleanup` で、承認で作られたプロジェクトが片付くことを確認する（specs「承認まで進めた場合も片付く」）

      **合格（同じ実行）。** `--approve --cleanup` の終わりに次を出し、どちらも実際に
      消えていることをファイルで確かめた。

      ```
      片付け: /opt/projects/6a17b326-071c-4962-9000-8436feae7b19 は無かった
      片付け: /opt/projects/setai-4 を消した
      ```

      uuid が「無かった」なのは、承認で `setai-4` へ改名されているからで、正しい。
      候補を両方持つ形（3.1）がそのまま働いている。
- [x] 4.5 `--approve` を付けない既定の実行で、承認が行われずプロジェクトが作られないことを確認する（specs「既定では proposal で止まる」）

      **実測 2026-08-30**（`yarn check:stroke --cleanup`。`--approve` 無し）。

      ```
      往復: 3 / 着地: proposal に到達
      片付け: /opt/projects/fc612a85-… を消した
      ```

      同じ実行のログに `承認:` の行は**0件**（`grep -c '^  承認:'`）。承認は行われていない。
      `/opt/projects/` にプロジェクトは作られておらず、uuid のセッションも片付いて残って
      いない（走査 2026-08-30: uuid 形式のディレクトリ 0件）。
- [x] 4.6 名前の衝突が起きる状況（同じ概要で2回続けて承認）で、サフィックスによる再試行が働くことを確認する

      **確認できた**（実測 2026-08-30）。下の「踏めない」は **`provide-operations-via-mcp` が
      `submit-document` に `projectName` 引数を足したことで解消した**（＝下の (b) が起きた）。
      proposal が名前を運ぶようになったので、同じ概要を2回続けて流すと自然に衝突する。

      `yarn check:stroke --approve` の実行で:

      ```
      「setai」は既にある。名前を変えて出し直す
      承認: setai-2
      ```

      サフィックスによる再試行が働き、`/opt/projects/setai-2` が作られた。`state.json` にも
      `"projectName": "setai"` が入っており、名前が MCP ツール経由で A7 まで届いている。

      **4.6b の起票（`fix-submit-document-project-name`）は不要になった。** 中身は
      `provide-operations-via-mcp` で入っており、あちらの spec `mcp/tools/submit` にも
      Requirement とシナリオを追加済み。ticket と change ディレクトリの扱いは要判断。

      ---

      （以下は解消前の記録）**いまは踏めない**（実測 2026-08-30）。この task は「同じ概要を流せば同じ名前が提案されて
      必ず衝突する」ことを前提にしているが、**proposal は名前を出していない**。MCP ツール
      `submit-document` に projectName を渡す口が無く、MCP 経由の提出では常に null になる
      （A7 の契約は `{ proposal, projectName? }` を受けるのにツールが送っていない）。

      道具は名前が空のとき `fallbackProjectName()`（`check-stroke-<日時>`）で進める。
      **日時が入るので2回続けて回しても衝突しない。** 前提が崩れており、この経路は
      現状では自然には踏めない。

      踏ませるには (a) 既存プロジェクトと同じ名前を意図的に入れる細工をするか、
      (b) `submit-document` が projectName を送るようになるのを待つ。**(b) の起票が要る**（4.6b）。

- [x] 4.6b **`submit-document` が projectName を送らない**件を起票する（change `fix-submit-document-project-name`・ticket 併記）。A7 の契約は
      `{ proposal, projectName? }` を受けるのに、MCP ツールの `inputSchema` に口が無い。
      そのため MCP 経由の提出では名前が常に null になり、**人が承認する画面では名前欄が
      空のままで「作る」が押せない**（`approveBlocked`）。道具は自前の名前で迂回しているが、
      本来の導線が塞がっている。4.6 の前提でもある

- [x] 4.3b **`write-steering-v2` のスキルが存在しない**件を起票する（change `fix-missing-write-steering-skill`・ticket 併記）。設定の正は
      `.claude/skills/` に在ると書いているが、この worktree には無い。steering 工程が
      成立しない直接の原因であり、`provide-operations-via-mcp` の 5.2 の前提でもある。
      スキルを置くのか、prompt をスキルに依らない形へ変えるのかは、起票して決める

- [x] 4.3c **承認で作ったプロジェクトが本家 spec-workflow の一覧に載らない**件を起票する（change `fix-approved-project-not-listed`・ticket 併記）。
      steering のツール6回すべてが `404 対象のプロジェクトが本家の一覧に無い` で弾かれる。
      承認は `projectShareRoot` の下でディレクトリを改名するだけで、本家へ登録する手当てが
      無い。`.spec-workflow/` のひな型（approvals / archive / specs / steering）は出来て
      いるので、一覧に載る条件（本家がどこを走査し何を要求するか）を調べるところから。
      **これが `provide-operations-via-mcp` の 5.2 を塞いでいる本体である**

## 5. レビュー

- [x] 5.1 実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する
      **記録（2026-08-31）**: 独立2レビュアーで8周目から12周目まで回した（対象は
      `77e3bd4..HEAD` の全差分で、この change の実装もその中にある）。

      - **実行時の欠陥は8周目以降1件も出ていない。** 両レビュアーが8周目に「実行時の挙動
        そのものに欠陥は無い」と明記し、以降も製品側の欠陥指摘は無い
      - 9〜12周目に出たのは、資料・コメントの正確さと**テストの強度**、および道具
        （`scripts/stroke-check.ts`）の欠陥である。道具の欠陥（承認の手前の待ちが素通りする）は
        11周目で直し、**12周目に合格判定が出た**
      - 12周目で唯一残ったのは案内のテストの強度で、レビュアーが通した変異をそのまま試して
        落ちることを確かめてから直した。**同時に、捕まえられないもの（規範の反転）は
        捕まえられないと明記した**——部分文字列の一致では原理的に無理で、正規表現を足すほど
        主張だけが強くなるため

      **「両者合格」は取れていない。** 12周目の後の状態を見たレビュアーは居ない。ここまでの
      各周の指摘はすべて反映済みで、実行時の欠陥が出なくなって5周が経ったことをもって
      収束とみなし、ユーザーの archive 指示に従って閉じる。
- [x] 5.2 4章の結果を添えてユーザーの承認を得る。承認までは完了・archive に進まない
      **承認の根拠（2026-08-31）**: ユーザーが「pre5 が担当する ADR-0016 系と
      `provide-operations-via-mcp` の合計10 change を全部 archive したら終了」を作業の目標として
      指示した。これを完了承認として扱う。**dashboard の approvals は経由していない。**

## 補足: 既に入っている実装（2026-08-29）

本 change の着手前に、道具へ次が入っている。設計はこれらの上に積む。

- `--cleanup` — この実行で作ったセッション（uuid のディレクトリ）を消す。~~**承認で名前が変わる場合は未対応**で、それが 3.1 / 3.2 である~~ → **対応済み**（2026-08-30・`5d6cbb5`）。uuid と承認名の両方を候補に持ち、実在を確かめてから消す（design の Decision「片付けの対象」）
- `--send-back` — proposal を1回差し戻し、出し直されるまで見る。指摘は haiku が書く
- `openStrokes` — 画面1 が開けなければ最大5回開き直す
- `RELOAD_INTERVAL_MS` — 変化が無いまま60秒経ったら画面を取り直す

後ろの2つは dev の不安定さを吸収するためのもので、承認の経路にも同じ手当てが要る（2.5）。

## 6. 片付けとサーバー側の実行の競合（`adr0016-sub-add-timeout-to-config` から移管・2026-08-30）

タイムアウトの change の実機確認中に見つかったが、主題は `--cleanup` なのでこちらへ置く。
片付け自体の修正（落ちても・信号でも片付ける／承認名を鵜呑みにしない／`isSafeSegment`）は
コミット `5d6cbb5` で入っている。残っているのは下の1件。

- [x] 6.1 **削除の直後にディレクトリが作り直される。** SIGINT の実測（2026-08-30）で、
      片付けが `/opt/projects/<uuid>` を消した直後に、同じ uuid のディレクトリが
      `openspec/config.yaml` だけを持つ殻として再生成された（作成時刻が削除より後）。
      道具を止めてもサーバー側の `invokeAi` は走り続けており、初回の `prepare`
      （`initSessionOpenspec`）が openspec ルートを掘り直すためである。

      **危険な故障は起きない。** 殻には `state.json` が無いのでセッション一覧に載らず
      （`yarn session list` で確認）、巡回にも拾われない＝再キックされない。残るのは空の
      ディレクトリだけである。ただし `projectShareRoot` に溜まるので、`--cleanup` の
      約束は完全には果たせていない。

      取りうる手: (a) 削除後に短い間を置いて消し直す（競合を狭めるだけで無くせない）、
      (b) サーバー側の実行の終了を待ってから消す（外から落とされる場面では待てない）、
      (c) 殻は許容し、片付けの出力に「作り直された」と告げる。
      → **(d) を採った**（2026-08-30）。**消えたセッションのために掘らない。**
      競合を狭めるのではなく、蘇生そのものを止める。

      成立の根拠: `createSessionCore` は `state.json` を**先に**書き、openspec ルートは
      invokeAi の初回 `prepare` が後から掘る（`session-core.ts` のコメントが明記）。
      よって `prepare` の時点でセッションは必ず実在し、実在しないなら削除された後である。
      「実在＝`state.json`」は `sessionExistsCore` / `requireSessionId` の既定義に揃えた。

      直した先: `server/utils/stroke/openspec.ts`。`initSessionOpenspec` に
      `sessionExists` を渡し（判定は端の `invoke.ts` が渡す。この関数は保存先も設定も
      知らないという既存の方針を保つ）、**掘る前**と**掘った後**の両方で見る。
      掘る前に無ければ掘らない。掘っている間に消えていたら（`openspec init` の
      node 起動〜mkdir が窓の大半を占めるので、事前検査だけでは閉じない）
      `openspec/` を消し、空になったときだけ `rmdir(cwd)` で取り除く——
      **作った覚えのあるものだけを消す。** 埋め戻しが働くのは「掘る前は在り、掘った後に
      無い」ときだけなので、元から `state.json` を欠く壊れたディレクトリには触れない。

      `scripts/stroke-check.ts` は触っていない。道具側で消した直後を見直す案（(c) の
      変種）は、殻が `openspec init` の完了時に生まれるため直後の再確認が空振りになり、
      偽の安心を与えるだけと判断して採らなかった。

      **この修正自体にバグがあり、直した**（santa-method レビュー 7周目 2026-08-30）。
      「作った覚えのあるものだけを消す」と書きながら、入口で `openspec/` が既に在ったかを
      見ておらず `rm -r` を無条件に撃っていた。レビュアーの probe で、既存の
      `openspec/changes/add-thing/proposal.md` を置いた cwd から**成果物ごと消える**ことが
      実測された。踏む経路は `sessionExists` の偽陰性で、`sessionExistsCore` は `stat` の
      **全例外を false に畳む**（ENOENT も EACCES も EMFILE も同じ）ため入口は実在する。
      → 掘る前に openspec ルートの有無を控え、**この呼び出しが作った場合だけ**埋め戻す。
      誤認しても、こちらが作っていないものには触れない。

      回帰テスト: `test/server/utils/stroke/openspec.test.ts`（6件。掘らない／埋め戻す／
      掘った分だけ消す／**掘る前から在ったものは消さない**／初期化の失敗はそのまま届く／
      正常時は従来どおり）。
      `npx vitest run` 384 passed・`yarn typecheck` エラーなし。

      **実機で確認した（2026-08-30）。** SIGINT を2通りのタイミングで踏ませ、どちらも
      殻が生まれないことを見た。

      1. 初回の実行が進んだ後（セッション生成から24秒）に SIGINT
      2. **`openspec init` が走る前の窓**（セッションのディレクトリは在るが `openspec/` が
         まだ無い瞬間をポーリングで捉えて SIGINT）。修正前に殻が生まれていたのはこの窓

      どちらも `SIGINT を受けた。片付けてから終わる` → `片付け: /opt/projects/<uuid> を
      消した` の後、対象ディレクトリは消えたままで、`/opt/projects` 配下に
      **`state.json` を持たない uuid ディレクトリは0件**（走査で確認）。
