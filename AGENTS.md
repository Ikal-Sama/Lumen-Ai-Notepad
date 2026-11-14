<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent Rules

The following rules apply to any AI agent working on this codebase:

1. **Branch per feature/fixed**: Always create a new branch off `main` for any feature or bug fix. Use a descriptive name (e.g., `feature/ai-note-editing`, `bugfix/update-note-tool`). Never commit directly to `main`.

2. **Quality gate before merge**: Before pushing a commit or merging a pull request, run `npm run lint`, `npm run typecheck`, and `npm run build`. Resolve all lint errors, type errors, and build failures. The branch must pass all checks with zero warnings/errors.

3. **Documentation**: For every change (new file, modified file, or bug fix), update the relevant documentation. Add or update `README.md`, `AGENTS.md`, or code comments as appropriate. If a new API endpoint or tool is added, document it in `README.md` under the appropriate section.

4. **Plan before build**: Before writing any code, create a short plan describing the problem, the proposed solution, the files to be modified, and the testing approach. This plan can be a brief bullet list or a markdown file in `docs/`. Do not start implementation until the plan is agreed upon (or documented in the PR description).

5. **Benefiting suggestions**:
   - Keep changes minimal and focused; avoid touching unrelated files.
   - If a change affects the AI note editing flow, run the smoke test script to verify the end‑to‑end flow still works.
   - Use conventional commit messages (`git commit -m "feat: add updateNote tool"`).
   - When in doubt, ask the user for clarification rather than guessing.
