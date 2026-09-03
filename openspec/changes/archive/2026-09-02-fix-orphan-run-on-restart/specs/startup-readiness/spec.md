## REMOVED Requirements

### Requirement: 前提が欠けていてもサービスは起動する

**Reason**: `startup-readiness` が正しい specs の分類ではない。この capability は「起動時に確かめる」という実装の置き場を単位にしており、振る舞いの単位になっていない。

**Migration**: 移さない。前提の欠けが外から観測できるのは `api/session/invoke-agent`「前提が欠けている間は起動を受け付けない」であり、そちらは残る。

### Requirement: 欠けている前提を起動時に伝える

**Reason**: `startup-readiness` が正しい specs の分類ではない。加えて、起動時に確かめる対象として挙がっている3点はいずれも起動時に見る理由が無い。保存先が絶対パスかと `claude` の起動定義は `nuxt.config.ts` の直書きの定数で、書き間違い以外では変わらない。実際に発行される `claude` の起動引数は呼び出しごとに組み立てが変わるため、起動時の静的な検査では捕まえられない。書き込み権限だけが実行時に変わるが、それは使う直前に見るべきものである。

**Migration**: 移さない。起動時のログは運用の助けであって、外から観測できる契約ではない。

### Requirement: 前提の充足は必要になった時点で判定する

**Reason**: `startup-readiness` が正しい specs の分類ではない。加えて `api/session/invoke-agent`「前提が欠けている間は起動を受け付けない」が同じことを規定しており、重複している。同 Requirement は「前提が満たされた後は、同じ対象に再び起動を要求できる」と述べ、判定が要求のたびに起こることを既に含む。

**Migration**: `api/session/invoke-agent` の Requirement「前提が欠けている間は起動を受け付けない」を参照する。
