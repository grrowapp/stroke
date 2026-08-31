# adr0016-sub-add-timeout-to-config — design

## Context

動機は proposal.md の Why を参照。設計の前提になる事実は次の通り（すべて実装コードで確認したもの）。

- 打ち切りは `runClaude` の中で `setTimeout` 1本が担い、超えたら `SIGKILL` を送る
  （`server/utils/stroke/claude.ts:149-152`）。長さは同じファイルの定数
  `CLAUDE_TIMEOUT_MS = 180000` で、`close` の中の失敗メッセージ（`:214`）も同じ定数を読む
- `claude.ts` は core 側であり、設定を引かない。値は引数で受け取る決まりである
  （`docs/specs/core/settings-reference.md`「設定を引くのは端だけである」）。
  タイムアウトだけが定数として core の内側に居る
- 設定を引く端は `buildRun`（`server/utils/stroke/invoke.ts:98`）で、`readStrokeConfig()`
  から `claude.maxRetries` を含む値を引き、`AiRun` に詰めて `invokeAi` へ渡す。
  `buildRun` は `retries`（これまでに起こし直した回数）も引数で受け取っている
- 上限の判定は `invokeAi` の先頭（`server/utils/stroke/ai.ts:82`）で、`retries > maxRetries`
  で `error` へ倒す。**`retries` を読む場所は現状ここ1箇所だけである**
- `runtimeConfig` の検証は `server/utils/stroke/config.ts` の zod スキーマ1本を通る。
  資料に載っている設定はここに列があり、載っていない値はここに無い
- `scripts/stroke-check.ts:51` は待ちの上限（`ROUND_TIMEOUT_MS = 4分`）の根拠として
  `CLAUDE_TIMEOUT_MS = 3分` を doc コメントで名指ししている

## Goals / Non-Goals

**Goals:**

- 打ち切りまでの時間を設定へ出し、`maxRetries` と同じ置き場・同じ手続き（ADR-0004）に載せる
- 起こし直すたびに長くする刻みを持ち、初回は短く保ったまま重い実行を拾えるようにする
  （`specs/agent/invocation/spec.md`）
- core（`claude.ts`）が設定を知らない線引きを保つ。時間は端から渡ってくる1つの値になる

**Non-Goals:**

- 打ち切りシグナル（`SIGKILL`）を設定にすること。proposal の Impact のとおり据え置く
- `maxRetries` の意味・上限判定の位置を変えること
- 起こし直しの巡回（`server/plugins/02.retry-failed.ts`）の間隔を設定にすること。
  こちらは「設定ではないもの」の表に残る
- 用途（ストローク / steering）ごとに別のタイムアウトを持つこと。値は1組で、
  用途の違いは渡す値の違いだけで表す既存の線引き（`agent/invocation`）を崩さない

## 流れ

```
nuxt.config.ts runtimeConfig.claude
  ├─ timeoutMs      基準の長さ
  └─ timeoutStepMs  起こし直し1回ぶんの刻み
        │  readStrokeConfig()（端 = buildRun）
        ▼
AiRun { timeoutMs, timeoutStepMs, retries, maxRetries, … }
        │
        ▼
invokeAi  ── retries > maxRetries なら起動せず error（既存）
        │
        └─ timeoutMs + timeoutStepMs × retries  ← ここで今回の長さが決まる
                 │
                 ▼
runClaude({ …, timeoutMs })  ── setTimeout 1本。超えたら SIGKILL（既存）
```

## Decisions

### Decision 1: 刻みは加算（`timeoutStepMs`）で持つ

**選択肢**: (a) 加算 `timeoutMs + timeoutStepMs × retries` / (b) 倍率
`timeoutMs × factor ^ retries` / (c) 回数ごとの長さを配列で並べる。

(a) を採る。proposal が加算を軸に置いた理由——`0` が「伸ばさない」を素直に表し、現在の
固定の振る舞いと地続きになる——をそのまま採る。倍率は単位元が `1` で、「伸ばさない」を
表す値が `0` ではなくなる。設定を読む人が `0` を入れると打ち切りが即座に起きる形になり、
事故の向きが悪い。

(c) は回数ごとの長さを直接書けるが、`maxRetries` と要素数の整合を人が保つ必要が出る。
`maxRetries` を増やしたときに配列の末尾が足りない状態が作れてしまい、設定が2つの値の
組から「2つの値の組 + 長さの一致」へ複雑になる。得られるのは表現力だけで、実運用で
要る形は「一定の幅で伸ばす」である。

### Decision 2: 今回の長さを決めるのは invokeAi で、claude.ts は渡された1つの値で打ち切る

**選択肢**: (a) `invokeAi` が `retries` から算出して `runClaude` へ1つの値を渡す /
(b) 端（`buildRun`）が算出し、`AiRun` には算出済みの1つの値だけを載せる /
(c) `runClaude` が `timeoutMs` / `timeoutStepMs` / `retries` の3つを受け取り、内側で算出する。

(a) を採る。`retries` の意味——「これまでに起こし直した回数」であって初回のキックは
数えない——を解釈しているのは `invokeAi` の上限判定であり、同じ意味を2箇所で解釈させない。
上限判定と長さの算出が隣にあれば、片方だけが `retries + 1` を見るような取り違えが起きない。

(b) も成立するが、`buildRun` は「設定を引いて詰める」役であり、判断を持たない形に保ちたい。
算出をここへ置くと、`AiRun` を組み立てる側が `retries` の意味に依存し始める。

(c) は core（`claude.ts`）に「起こし直しの回数」というアプリ側の概念を持ち込む。
`claude.ts` は claude を起こして出力を読むだけの層であり、設定も文脈も知らない
（`docs/specs/core/settings-reference.md`）。この線引きは崩さない。

`CLAUDE_TIMEOUT_MS` は廃す。`ClaudeRunOptions` に必須の `timeoutMs` を足し、`setTimeout`
と失敗メッセージ（`タイムアウト (Nms)`）の両方がその値を読む。省略可能にして既定値を
core 側に持たせない——持たせた時点で「資料に無い設定値」が復活する（ADR-0004）。

### Decision 3: 既定値は `timeoutMs` = 180000、`timeoutStepMs` = 0

**既定では現在の振る舞いを変えない**（ユーザー決定 2026-08-30）。

`timeoutMs` は現行の定数と同じ 180000（3分）を据え置く。現行の実測（2026-08-28: 8回の
呼び出しで 28.5〜64.7 秒）に対して最大値の3倍近い余裕があり、初回の長さを動かす理由は
今のところ無い。

`timeoutStepMs` の既定は `0`、すなわち「伸ばさない」である。既定の `maxRetries: 2` では

| 起動 | `retries` | タイムアウト |
|---|---|---|
| 1回目 | 0 | 3分 |
| 2回目 | 1 | 3分 |
| 3回目 | 2 | 3分 |

で、`error` へ達するまでの総待ち時間は 9分——**現行と同じ**になる。

この change が入れるのは**刻みという箱**であって、刻みの効かせ方ではない。固定の
タイムアウトが初回とリトライで要る長さの違いを解けないこと（proposal.md Why）は変わらないが、
どれだけ伸ばすのが妥当かを決める実測がまだ無い。既定を `0` にしておけば、この change の
入れ替えは振る舞いを変えず、値を入れる判断は実測が出た時点で設定の変更として行える。

`0` が「伸ばさない」を素直に表せることは Decision 1 で加算を選んだ理由でもある。その
表現がそのまま既定値になる。

**この2件の追加と既定値はユーザーの承認を得ている（2026-08-30。ADR-0004）。**

### Decision 4: 検証は `config.ts` の zod スキーマに列を2つ足すだけにする

`timeoutMs` は `z.number().int().positive()`、`timeoutStepMs` は `z.number().int().min(0)`。
基準の長さに `0` を許すと、起動した瞬間に打ち切る設定が書けてしまう。刻みの `0` は
「伸ばさない」という意味を持つので許す（`specs/agent/invocation/spec.md`）。

上限は設けない。`maxRetries` にも上限を設けていないのと同じ扱いで、資料に載った値を
運用者が承認の上で決める。

### Decision 5: `settings-reference.md` は3箇所を直す

1. `runtimeConfig` の一覧表に `claude.timeoutMs` / `claude.timeoutStepMs` の2行を足す
2. `claude.maxRetries` の節の総待ち時間の式を、刻みを含む形へ改める。
   「タイムアウトは10分（設定ではない）」「既定の `2` では最大30分」という
   現行の記述は、実装（3分）とも食い違っており、ここで落とす
3. 「設定ではないもの」の表の行「子プロセスのタイムアウトと打ち切りシグナル」から
   タイムアウトを外し、「子プロセスを打ち切るシグナル」だけを残す

3 でシグナルの行を消さないのは、`SIGKILL` が Non-Goals のとおり設定にならないためである。
行ごと落とすと「資料に載っていない = 設定ではない」の裏付けが消える。

新しい2件の説明は `claude.maxRetries` の節の隣に置く。総待ち時間の式が両者を同時に読む
以上、離すと片方だけを見た改変が起こる。

### Decision 6: `scripts/stroke-check.ts` の待ちは設定から引き直す

`ROUND_TIMEOUT_MS` は `CLAUDE_TIMEOUT_MS` を根拠に 4分と置いている。定数が消えるので
コメントの追随が要るが、コメントだけ直すと「設定で 10分にしたのに実機確認は 4分で
諦める」という食い違いが残る。`stroke-check.ts` は既に `nuxt.config.ts` を import して
`runtimeConfig` を読んでいる（`:44-46`）ので、同じ経路で `claude` の2値を引き、
`timeoutMs + timeoutStepMs × maxRetries` に余裕を足した値を待ちの上限にする。

実機確認は1回のキックしか見ないが、待ちの上限は「最も長くなり得る打ち切り」より
短くしない。短いと、まだ動いている実行を待たずに諦める（元のコメントの趣旨）。

### Decision 7: 用途による分岐は作らない

steering（承認後の文書作成）も同じ `timeoutMs` / `timeoutStepMs` を使う。`buildRun` は
用途で分岐するが、そこで別の値を引くと設定が4件になり、資料の側で「どちらがどちらか」を
説明し続けることになる。steering の所要がストロークと大きく違うと分かった時点で、
別 change として起こす。

## Risks / Trade-offs

- [刻みが既定 `0` なので、伸びる経路が実運用では踏まれないまま残る] → 入れ替えの安全
  （既定で振る舞いが変わらない・Decision 3）と引き換えである。経路そのものは単体テスト
  （tasks 4.2）で固定するので、値を入れた時点から効く
- [運用者が刻みを入れたとき、総待ち時間が `maxRetries` との掛け合わせで伸びる] →
  `timeoutStepMs` に 3分を入れれば総待ちは 9分から 18分になる。伸びるのは**時間切れが
  続いたときだけ**で正常な呼び出しの体感は変わらないが、`error` に達するまでは遅くなる。
  式を `settings-reference.md` に書いて読めるようにする（tasks 1.3）
- [設定が2件増える] → ADR-0004 が言う「設定は気付いたら増えている状態を止める」に対し、
  増やす側の変更である。増やす根拠は proposal の Why（同じ式の因子が別の手続きに属している）
  で、片方だけが承認を要る状態のほうが資料の正しさを損なう
- [`retries` の意味の取り違え] → `retries` は「これまでに起こし直した回数」で、初回は 0。
  `retries + 1` を掛けると初回から刻みが乗る。Decision 2 で算出を上限判定の隣に置き、
  テストで初回＝基準の長さを固定する（tasks 4.1）
- [`error` で終わった対象を再実行したときの長さ] → `retries` はユーザーの再実行で 0 に
  戻る（`agent/invocation`「ユーザーが再実行する」）ので、基準の長さから始まる。
  伸びた長さは持ち越さない（spec の Scenario で固定）
- [実機で刻みの効きを見るのが難しい] → 時間切れを意図的に起こす必要があり、
  `yarn check:stroke` の通常経路では踏まない。単体テスト（渡された `timeoutMs` で
  打ち切ること・算出が `retries` に従うこと）で担保し、実機は退行が無いことの確認に留める

## Migration Plan

ADR-0004 の順序で進む——**design の承認 → `settings-reference.md` の編集 → コードの追随**。
資料より先にコードを入れない。

1. この design にユーザーの承認を得る（設定2件の追加と既定値が承認の対象）
2. `docs/specs/core/settings-reference.md` を Decision 5 のとおり直す
3. `nuxt.config.ts` の `runtimeConfig.claude` に2件を足し、`config.ts` の zod に列を足す
4. `claude.ts` の定数を廃し、`ai.ts` で算出して渡す
5. `scripts/stroke-check.ts` を追随させる

ロールバックは revert で足りる。`state.json` の形も API の契約も変わらないため、
入れ替えの前後でデータの読み替えは起きない。

## Open Questions

無し。既定値（Decision 3）は承認で確定する。
