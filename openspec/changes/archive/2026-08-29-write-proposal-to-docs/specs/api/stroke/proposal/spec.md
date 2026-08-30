## ADDED Requirements

### Requirement: 受理した proposal は残る

システムは受理した proposal を残す SHALL。受理が成立した後は、提出の瞬間に繋いでいたかどうかによらず、同じ proposal が得られなければならない。繋ぎ直した画面でも、承認の時点でも同じものが得られる。

残せなかった場合、システムは受理を成立させてはならない（MUST NOT）。提出は失敗として返し、phase も進めない。受理したのに残っていない状態を作らない。

出し直された proposal は前のものに取って代わる。得られるのは常に最後に受理された1件とする。

#### Scenario: 提出した後に繋ぎ直す

- **WHEN** proposal が受理された後、画面が繋ぎ直す
- **THEN** 受理された proposal がその画面に届く

#### Scenario: 提出の瞬間に誰も繋いでいない

- **WHEN** proposal を受け取る接続が1つも無い状態で proposal が受理される
- **THEN** その後に繋いだ画面へ、受理された proposal が届く

#### Scenario: 承認の時点で proposal が要る

- **WHEN** 受理された proposal を持つセッションが承認される
- **THEN** 承認は proposal が無いことを理由に拒まない

#### Scenario: 出し直す

- **WHEN** 差し戻しの後に proposal が出し直されて受理される
- **THEN** 以後に得られるのは出し直された方だけで、前のものは得られない

#### Scenario: 残せない

- **WHEN** 受理しようとした proposal を残せない
- **THEN** システムは提出を失敗として返し、phase を進めない。以後もその proposal は得られない
