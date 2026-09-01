---
tags:
  - chore
status: Open
order: -6.0
---

# stabilize-dev-module-delivery

dev サーバーがモジュールを取り落とすと画面が固まる。サーバー側は進んでいるのに、検証が失敗として落ちる。

## 事実

dev は依存を個別のモジュールとして配る。数が多く、途中で1本でも落ちると Vue アプリがマウントされず、画面が白いまま何も出ない。

実測 2026-08-29。

```
net::ERR_NETWORK_CHANGED
  .../_nuxt/@fs/.../node_modules/reka-ui/dist/Menubar/MenubarPortal.js
TypeError: Failed to fetch dynamically imported module:
  .../_nuxt/@fs/.../node_modules/nuxt/dist/app/entry.js
```

これで `yarn check:stroke` が3回落ちた。落ち方が紛らわしい。

- **画面1 が出ない** — `stroke-modal` が 30 秒待っても出ず、道具が起動直後に落ちる
- **着地を検知できない** — セッション `40537566-…` は `state.json` が `phase: proposed` に達していた（AI は proposal まで完走）。それでも画面が更新されず、道具は「次の問いも proposal も出なかった」として 240 秒で落ちた
- **問い返しを取り逃す** — セッション `167cb9d2-…` は3問目が `send-question` で提出済み・`state.json` の `currentQuestion` にも入っていたが、帯が出ないまま時間切れになった

`node_modules/.vite` を消して dev を起動し直すと `[optimizer] scanning dependencies... / bundling dependencies...` が走り、症状が軽くなる。古いキャッシュがあると optimizer をスキップし、個別配信のまま走るように見える。

**これは stroke-board の欠陥ではない。** ただし検証がこれで落ちると、成果物の欠陥と環境の揺らぎを切り分けられない。

## 求めるもの

- dev で検証を回すときに、モジュールの取り落としで落ちない状態を作る
- 落ちた場合に、それが環境の問題だと判別できる形にする

## 前提

- 道具側には既に吸収を入れてある（2026-08-29）。根本の解決ではない
  - `openStrokes` — 画面1 が出なければ最大5回開き直す
  - `sendBack` — 60 秒変化が無ければ画面を取り直す（`RELOAD_INTERVAL_MS`）
- 検証の原則により、操作はブラウザのみ。サーバーを直接叩いて状態を確認する回避策は採れない
- `yarn clean` でキャッシュを作り直すと optimizer が走る。手順として固定するか、設定で解くかは未決
