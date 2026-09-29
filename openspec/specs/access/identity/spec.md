# access/identity Specification

## Purpose
リクエストごとに、それがどの利用者のものか、管理者かどうかを判定する。ログインの手順を持たず、Cloudflare Access を通ったときに届く token と、token が無いときの接続元から決める。

## Requirements

### Requirement: 利用者と管理者を token と接続元で判定する

システムは、リクエストの利用者と管理者を次の規則で判定しなければならない（SHALL）。

- token（`Cf-Access-Jwt-Assertion`）があれば、token のメールアドレスがそのリクエストの利用者である。管理者に指名されたメールアドレスなら管理者とする
- token が無ければ、登録された接続元ネットワークまたは登録されたホスト名からの接続を管理者とする

token は、署名・有効期限・対象の application の検証に通ったものだけを使う SHALL。メールアドレスは大文字と小文字を区別せずに照合する SHALL。ログイン画面・ログアウトの操作を持ってはならない（MUST NOT）。

#### Scenario: 登録されたゲストが開く

- **WHEN** Cloudflare Access を通った `guest@example.com` の利用者が画面を開く
- **THEN** そのリクエストは `guest@example.com` の利用者として扱われる

#### Scenario: 管理者に指名されたメールアドレス

- **WHEN** 管理者に指名された `admin@example.com` の token を持つリクエストが来る
- **THEN** そのリクエストは管理者として扱われる

#### Scenario: LAN から直接開く

- **WHEN** `192.168.1.0/24` が登録されている状態で、`192.168.1.20` から token 無しで画面を開く
- **THEN** そのリクエストは管理者として扱われる

#### Scenario: 登録されたホスト名で開く

- **WHEN** `xxx.grrow.app` が登録されている状態で、`xxx.grrow.app` の URL を token 無しで開く
- **THEN** そのリクエストは管理者として扱われる

### Requirement: エージェント向けの MCP は判定の対象にしない

システムは、エージェントが使う MCP の endpoint を、利用者と管理者の判定の対象にしてはならない（MUST NOT）。MCP の endpoint は、それ自身の token による保護のまま扱う SHALL。

#### Scenario: エージェントが MCP のツールを呼ぶ

- **WHEN** 起動されたエージェントが、有効な MCP の token を付けて MCP のツールを呼ぶ
- **THEN** 呼び出しは利用者の判定で拒否されない
