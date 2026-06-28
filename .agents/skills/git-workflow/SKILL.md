---
name: git-workflow
description: Git workflow guide covering Conventional Commits rules, rebase strategy, automatic commit message generation, and branch naming conventions. Applicable when committing code, merging branches, or generating commit messages.
---

# Git Workflow

This skill enforces Conventional Commits format and a rebase-based workflow.

## Commit Message Rules

### Format

```
<type>(<scope>): <description>

[optional body]
```

### Type

| Type       | Purpose                                     |
| ---------- | ------------------------------------------- |
| `feat`     | New feature                                 |
| `fix`      | Bug fix                                     |
| `docs`     | Documentation changes                       |
| `style`    | Formatting changes that don't affect logic  |
| `refactor` | Refactoring (not a new feature or bug fix)  |
| `perf`     | Performance improvement                     |
| `test`     | Test-related changes                        |
| `build`    | Build system or external dependency changes |
| `ci`       | CI configuration changes                    |
| `chore`    | Miscellaneous tasks                         |
| `revert`   | Revert a previous commit                    |

### Scope

Optional. Use the module, feature, or area name that best describes where the change lives. Omit scope if the change spans multiple areas.

### Description Rules

- Use English
- Start with lowercase
- No trailing period
- Keep it concise

### Examples

```
feat(auth): add OAuth2 login flow
fix(api): handle null response from upstream
refactor(utils): simplify date formatting logic
chore: update dependencies
test(cart): add unit tests for checkout calculation
docs: update README setup instructions
```

## Branch Strategy

- Feature branches: `feat/<description>` or `feat/<ticket-id>`
- Fix branches: `fix/<description>` or `fix/<ticket-id>`
- Prefer rebase over merge when integrating branches

## Rebase Workflow

Pull in main branch changes:

```bash
git pull --rebase origin main
```

Interactive rebase to clean up commits:

```bash
git rebase -i HEAD~n
```

Continue after resolving conflicts:

```bash
git rebase --continue
```

Abort a rebase:

```bash
git rebase --abort
```

## Generating Commit Messages

When the user asks to generate a commit message:

1. Run `git diff --cached --stat` and `git diff --cached` to review staged changes
2. Analyze the changes to determine the appropriate type and scope
3. Generate a message following the Conventional Commits format
4. If the changes span multiple concerns, add a body with details
5. Execute the commit with `git commit -m "<message>"` (use multiple `-m` flags if a body is needed)

### Determining the Type

- New files or features → `feat`
- Modifying existing logic to fix an issue → `fix`
- Restructuring code without changing behavior → `refactor`
- Test-only changes → `test`
- Documentation-only changes → `docs`
- Dependency updates or build config → `build` or `chore`

### Determining the Scope

- Identify the primary module or feature directory affected
- If changes are concentrated in one area, use that as scope
- If changes span multiple areas, omit scope
