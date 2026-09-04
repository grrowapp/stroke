---
status: Wait-for-archive
change: fix-idle-stuck-on-run-build-failure
origin: agent
triage:
  - bug
tags:
  - proposal
  - specs
  - design
  - tasks
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
  - fix-orphan-run-on-restart/42b86225-851f-4ec5-a58e-60a291d1877e
order: -6.0
date: 2026-09-04
---

# fix-idle-stuck-on-run-build-failure

`buildRun` が同期 throw すると、`kick` は token を消して reject を返すが **`invocation` を
誰も `failed` にしない**。U13 は 200 を返すので呼び出し側の `.catch` も走らず、巡回は
`failed` しか拾わない。**設定が読めない限りセッションは永久に `idle` のまま止まり、
サーバーログ1行しか残らない。**

`mcpConfigFor` が `readServerConfig()` を読むようになったことで、この経路に入る条件が
1つ増えている。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。

対応する change: `fix-idle-stuck-on-run-build-failure`

---

## この ticket は起票自体が誤りである — 整理必須（2026-09-04 判定）

**archive するが、これは解決の記録ではなく失敗した残骸の記録である。** 上の概要が述べる
症状は実在せず、実装された修正は起票理由と対応していない。**上の概要を単独で引用しないこと。**

### 起票時に書いた症状は成り立たなかった

| 上の概要の記述 | 判定 |
| --- | --- |
| `buildRun` が同期 throw すると `invocation` を誰も `failed` にしない | 起票時は真。実装で解消 |
| U13 は 200 を返すので呼び出し側の `.catch` も走らない | 起票時は真。実装で解消（503） |
| 巡回は `failed` しか拾わない | 真 |
| **設定が読めない限りセッションは永久に `idle` のまま止まる** | **起票時から偽。** U13 は `beginRun` の手前で `missingPrerequisites()` を呼び、`readStrokeConfig()` の失敗を 503 で止める（`server/utils/readiness.ts`） |
| **`mcpConfigFor` が `readServerConfig()` を読むので条件が1つ増えた** | **起票時から偽。** `server/utils/config.ts` に `throw` が1つも無い。未設定は既定値へ落ちる |

proposal.md はこの2点が偽であることを自ら認めている（「Why」節）。

### 置き直した理由も誤りだった

proposal は上の2点が崩れたあと、change を畳まずに性格を
**「今日再現する不具合ではない。構造の穴」**へ書き換えて続行した。これも誤りである。

**`buildRun` には今日 throw する枝が実在する。**

```
server/utils/stroke/invoke.ts:124   const apiBaseUrl = currentApiBaseUrl()
server/utils/stroke/listen-address.ts:180
    throw new Error('dev サーバーの待ち受けポートがまだ分からない（listen より前に呼ばれた）')
```

`listen-address.ts:168-173` の docblock が到達経路まで名指ししている——
`server/plugins/01.retry-failed.ts` の**起動直後の巡回は内部 `$fetch` でソケットの listen を
経由せず** U13 を叩くため、listen 前に到達しうる。`provide-operations-via-mcp` が入れた
もので、前提チェック（`missingPrerequisites`）の外にある。

**そしてその経路の入口は `idle` ではない。** 巡回が拾う対象は既に `failed` なので、
`failed` → 組み立て throw → `failed` のループになる。「`idle` のまま止まる」は起こらない。

change 名・上の概要・proposal・delta（`agent/invocation` の Scenario「記録が `idle` のまま
据え置かれない」）が揃って、**実在しない症状を記述している。**

### 混入した修正

**コミット単位** —— `c086907e fix: 実行まわりの欠陥7件を直す` に7本の change の apply が
まとめて入っている（`fix-rename-during-running-session` / `fix-orphan-run-on-restart` /
`fix-steering-empty-completion` / 本 change / `adr0016-sub-fix-upstream-mcp-allowance` /
`adr0016-sub-fix-direct-write-allowance` / `adr0016-sub-fix-project-id-lookup`）。
**この change だけを revert できない。** `invoke-agent.get.ts` には本 change の 503 と
`fix-rename-during-running-session` の `runKey` が同居し、`ai.ts` には本 change の
`{ built, settled }` と `fix-steering-empty-completion` の `didWork` が同居している。
`reap-gate.ts`（41行）もこのコミットで追加され、次の change `remove-startup-reap-ordering`
で削除された。

**スコープ内** —— 起票理由と対応しない修正が5点入っている。

1. `invokeAi` / `kick` のシグネチャ変更（`AiRun` → `build: () => AiRun`、戻り値 `Promise` →
   `{ built, settled }`）。記録を残すために必須ではなく、全呼び出し側の契約が変わる規模
2. A8 を叩くコードが2本になった（`AiRun.setInvocation` と `server/utils/stroke/ai.ts` の
   `writeInvocation`）。design D1 の「書き手を1つに保つ」は関数の粒度でしか守られていない
3. `recordBuildFailure` が独立して `readStrokeConfig()` を呼ぶ。設定の読み出し口が1つ増えた
4. **「組み立ての失敗も起こし直しの回数に数える」（design D3）。** 上の概要にも起票理由にも
   無く、design が「無限ループになる」と判断して足した。**実在する唯一の throw 経路
   （listen 前、数秒で自然に解消）には有害** —— retries を消費し、上限で `error`（終端）へ
   倒す。`listen-address.ts:172-173` 自身が「60秒ごとの巡回が拾い直すころには listen は
   済んでいる」と書いている
5. U13 の応答契約の変更（常に 200 → 200 / 503）。`docs/specs/api/sessions/invoke-agent.md`
   の書き換えまで波及した

### 経緯

出どころは上のとおり `provide-operations-via-mcp` の santa-method レビュー 9周目
（2026-08-31）。同 change の範囲外として記録していたが、範囲外の扱いは不正だった
（ユーザー指摘 2026-09-01）ため change を立てた。**症状をソースで確かめないまま起票し**、
proposal 段で2点が偽と分かった後も change を畳まず、性格を「構造の穴」へ書き換えて続行した。

### 畳む方向

**この ticket ではもう畳めない。** 実装が他6本と1コミットに同居しており、この change だけの
切り戻しができない。残っている問題は次の3点で、**それぞれ別の ticket として起票し直すこと。**

1. `currentApiBaseUrl()` が listen 前に throw する実在の経路。待てば直る失敗を retries に
   数えて `error` へ倒す現在の扱いが妥当かを判断する（上の「混入した修正」4）
2. `docs/specs/architecture/session-workflow.md` の状態遷移図に `idle --> failed` /
   `idle --> error`（起動の材料を組み立てられない）が無い。実装は `running` を書かずに
   `idle` から直接倒れる（`server/utils/stroke/ai.ts` の `recordBuildFailure`）
3. `ai.ts` の A8 書き手が2本になっている（上の「混入した修正」2）

### specs への影響

**無い。** delta（`agent/invocation`・`api/session/invoke-agent`）は archive の前に削除し、
`.openspec.yaml` に `skip_specs: true` を立てた。canonical `openspec/specs/` は1文字も
動かない。**実在しない症状を規定にしないための措置である。**
