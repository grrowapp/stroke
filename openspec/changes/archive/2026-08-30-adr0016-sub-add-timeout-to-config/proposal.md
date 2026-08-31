# adr0016-sub-add-timeout-to-config

## Why

`claude -p` の子プロセスタイムアウトがコードのハードコード定数で、同じ式を作る `claude.maxRetries` と置き場が揃っていない。

```
server/utils/stroke/claude.ts:21   export const CLAUDE_TIMEOUT_MS = 180000
nuxt.config.ts（runtimeConfig）     maxRetries: 2
```

`docs/specs/core/settings-reference.md` は総待ち時間を1つの式で定義している。

```
総待ち時間 = (maxRetries + 1) × タイムアウト
```

**同じ式の因子が別の手続きに属している。** `maxRetries` の変更は change 起票とユーザー承認が要る（ADR-0004）が、タイムアウトは定数を書き換えるだけで変えられる。

さらに `settings-reference.md` は同じ資料の中で二枚舌になっている。タイムアウトを「設定ではないもの」の表（`:149`）に載せながら、設定の説明にその値を使っている（`:84` の式、`:86` の「既定の `2` では最大30分」）。

**この値は運用の実測で調整されてきた。** 180 秒では初回が必ず時間切れになり10分へ延ばし（実測 2026-08-25）、操作が MCP ツールへ移って所要が減ったので3分へ戻した（実測 2026-08-28: 8回の呼び出しで 28.5〜64.7 秒）。設定の性質そのものである。

加えて、**固定のタイムアウトは初回とリトライで要る長さが違う**という問題を解けない。短くすれば重い初回が落ち、長くすれば失敗の検知が遅れる。上の「180秒 → 10分 → 3分」の往復は、1つの値で両方を賄おうとして起きている。

## What Changes

**設定は2件を増やす。**

| 設定 | 意味 |
|---|---|
| `claude.timeoutMs` | 打ち切るまでの時間。1つのターンの `retries` が 0 のときの値 |
| `claude.timeoutStepMs` | 同じターンでリトライを重ねる間、`retries` 1つにつきタイムアウトへ足す刻み |

**伸びるのは1つのターンの中だけである。**

```
今回のタイムアウト = timeoutMs + timeoutStepMs × retries
```

`retries` は `state.json` が持つ「そのターンでこれまでに起こし直した回数」で、`maxRetries` の上限に達すればそこで終わる。**次のターンでは `retries` が 0 に戻り、タイムアウトも `timeoutMs` へ巻き戻る。** 上限に達して `error` で終わったターンの後でも同じである。ターンをまたいで積み上がらない。

- **変更**: タイムアウトを `runtimeConfig.claude.timeoutMs` へ昇格させ、`maxRetries` と同じ場所に揃える。`CLAUDE_TIMEOUT_MS` の定数は廃す
- **新規**: `runtimeConfig.claude.timeoutStepMs` を足す。初回は短く保って失敗を早く検知し、同じターンで起こし直す間だけ長くする。`0` を入れれば現在と同じ固定の振る舞いになる
- **変更**: `settings-reference.md` の総待ち時間の式を、刻みを含む形へ改める。あわせて「設定ではないもの」の表からタイムアウトの行を落とす（`:149`）

刻みを**加算**（`timeoutStepMs`）にするか**倍率**にするかは design で確定する。加算を軸に置くのは、`0` が「伸ばさない」を素直に表せて現在の振る舞いと地続きになるためである。倍率だと `1` が単位元になり、値の意味が読み取りにくい。

## Capabilities

### Modified Capabilities

- `agent/invocation`: 呼び出しの打ち切りまでの時間が設定から決まり、起こし直すたびに伸びること。総待ち時間が「回数 × 一定値」ではなくなる。

## Impact

- **影響コード**: `server/utils/stroke/claude.ts`（定数の廃止と、渡された値での打ち切り）、`server/utils/stroke/ai.ts`（リトライ回数から今回の長さを決めて渡す）、`nuxt.config.ts`（`runtimeConfig.claude` への追加）
- **影響資料**: `docs/specs/core/settings-reference.md`（式の改訂・表からの削除・新しい設定2件の記述）。**ADR-0004 によりユーザー承認が要る**
- **影響しないもの**: 打ち切りシグナル（`SIGKILL`）は設定にしない。リトライの上限（`maxRetries`）の意味も変えない
- **手続きの補足**: 現在の2つの記述（`claude.ts` の「設定ではない」、`settings-reference.md` の「タイムアウトは10分（設定ではない）」）は、いずれも feat / chore のコミットで入っており **ADR-0004 の手続きを経ていない**。この change でその手続きに載せ直す
