---
tags:
  - enhancement
status: needs-triage
order: 2.0
---

# adr0018-sub-add-artifact-extension-system

拡張 artifact を扱う実体を作る。`adr0018-sub-update-artifact-extension-plan` で策定した仕様を実装する側の change であり、そちらが仕様、こちらが実装にあたる。

`create-feature` から切り出した（[ADR-0018](../../docs/adr/0018-delegate-create-feature.md)）。区分は**後続**。

触るファイル:
- 更新 `server/api/projects/[projectId]/specs/[specName]/documents.get.ts` — 返す形
- 更新 `shared/types.ts:156` — `SpecDocumentsDto`。現状は `Record<'requirements' | 'design' | 'tasks', …>` の**3キー固定**
- 更新 `app/pages/projects/[projectId]/specs/[specName]/index.vue` / `[document].vue` — 契約変更の波及先
- 新規 `server/utils/` の制御層 — 拡張 artifact を扱う層の置き場
- 参照 `test/server/utils/upstream/read-only.test.ts` — 本家領域への書き込み禁止の担保

## この change ですること

**plan で設計に落とした内容を実装する。**

`adr0018-sub-update-artifact-extension-plan` が、`docs/specs/plan/` にある発案（plan）を土台に、feature に適合する仕様を `docs/specs/` へ策定する。この change は、そこで設計に落ちた内容をコードにする側である。

したがって、この change が自分で方式を決めることはない。何を作るかは策定の結果で決まる。

## 起票時点で確認済みの事実

出発点として、現状で分かっていることを記録しておく。これらが対応の全量という意味ではない。

### 置いた文書を読み戻す口が無い

`create-feature` が feature を起こすとき `proposal.md` を置くが、本家の API に拡張分の本文を返す口は無い。`/specs/:name/all` は3キー固定で、汎用のファイル読み出しエンドポイントも無い。したがって拡張 artifact の本文だけは**ファイルシステムを直接読む**しかない。

読み取りは書き込み禁止に触れない。`read-only.test.ts` が禁じているのは `writeFile` / `mkdir` / `rm` などの書き込みと本家の書き込み API であって、読み取りは対象外である。FS 直読みには `server/utils/upstream/scan.ts` と `registry.ts` に前例がある。

### 契約が3文書に合わせて固まっている

`SpecDocumentsDto` が3キー固定で、画面2枚がその形に依存している。本家が知らない文書を1本増やすだけで、サーバの返す形と画面の両方に波及する。

### 層の置き場所に制約がある

接点層（`server/utils/upstream/`）は本家の形をそのまま扱う場所であり、本家が知らない概念を持ち込めない（`docs/specs/core/system-structure.md` の層の定義）。したがって拡張 artifact を扱う層は制御層になる。ただし FS 直読みをどちらの層に持たせるかは別途判断が要る。

### 本家に触る部分は変わらない

`UpstreamRestClient.getSpecDocuments()` の呼び出しも本家の `/all` も現状のままで、新しい層が既存の呼び出しを包む形になる（`artifact-extension-plan.md` の図）。

## 関連

`adr0018-sub-update-artifact-extension-plan` の結果に従う。あちらで併存方式を採らない決着になれば、この change は消える。

`create-feature` との前後は未確定。`create-feature` の完了条件に「置いた `proposal.md` が画面から読めること」を含めるなら、この change は後続ではなく前提になる。
