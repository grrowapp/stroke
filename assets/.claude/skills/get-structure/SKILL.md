---
name: get-structure
description: content of structure.md for the steering document by the spec-workflow
user-invocation: false
allowed-tools:
  - Bash(jq -r *)
  - Bash(xargs *)
  - Bash(curl -sSf *)
---

structure.md: ```!
jq -r '.mcpServers.specworkflow.env.SPEC_WORKFLOW_HOME // empty' "${CLAUDE_PROJECT_DIR}/.mcp.json" | xargs -r -I {} jq -r --slurpfile m "${CLAUDE_PROJECT_DIR}/.mcp.json" '.[] | select(.workflowRootPath == ($m[0].mcpServers.specworkflow.env.SPEC_WORKFLOW_SHARED_ROOT // empty)) | .projectId' {}/activeProjects.json | xargs -r -I {} curl -sSf "http://localhost:5000/api/projects/{}/info" | jq -r '.steering.documents.structure'
```

```!
jq -r '.mcpServers.specworkflow.env.SPEC_WORKFLOW_HOME // empty' "${CLAUDE_PROJECT_DIR}/.mcp.json" | xargs -r -I {} jq -r --slurpfile m "${CLAUDE_PROJECT_DIR}/.mcp.json" '.[] | select(.workflowRootPath == ($m[0].mcpServers.specworkflow.env.SPEC_WORKFLOW_SHARED_ROOT // empty)) | .projectId' {}/activeProjects.json | xargs -r -I {} curl -sSf "http://localhost:5000/api/projects/{}/steering/structure" | jq -r '.content'
```

