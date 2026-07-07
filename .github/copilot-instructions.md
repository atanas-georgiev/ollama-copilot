Always keep responses short and action-oriented.

When editing code:
- Do not output entire files unless explicitly requested.
- Do not repeat unchanged code.
- Prefer minimal unified diffs or direct edits.
- Keep chat responses under 120 lines.
- For large files, split work into small steps.
- First inspect structure, then propose a plan, then change one file at a time.
- For refactoring, preserve behavior and run/describe relevant tests.
- If the requested change is large, ask to continue in the next step instead of producing a huge response.
- Never generate full HTML/TS/JS files in chat unless asked.

Split this large HTML file safely.

Rules:
- Do not print the full HTML file.
- Do not output unchanged code.
- Work in one small step only.
- First identify logical sections/components.
- Then extract only the first component.
- Apply edits directly.
- Response max 80 lines.

Do not explain.
Do not print code.
Only apply the edit.
After edit, return:
- changed files
- 3 bullet summary
- next recommended step