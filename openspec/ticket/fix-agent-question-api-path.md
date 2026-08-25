# fix-agent-question-api-path

`useAgentQuestion.ts:58` の API 基底が `/api/<id>` で、実ルート `/api/strokes/<id>` と食い違い、問い返しの回答送信が 404 になるバグの修正
