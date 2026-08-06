# Strict MCP Context Enforcement

CRITICAL INSTRUCTION: Whenever the user provides a prompt related to the Betrix codebase (e.g., asking to modify code, fix bugs, or understand the architecture), the VERY FIRST action you MUST take is to call `search_graph` or `get_architecture` from `codebase-memory-mcp`.

- You are STRICTLY FORBIDDEN from writing any code, suggesting file edits, or making architectural assumptions before retrieving context via the MCP.
- Do not rely on file names or grep search as your primary discovery tool.
- Any code generated without prior MCP context retrieval is considered a critical failure.
