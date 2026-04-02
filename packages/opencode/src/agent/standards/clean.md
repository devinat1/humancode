# Clean Code Foundations

## Naming
Use descriptive, intention-revealing names. A variable name should tell you why it exists, what it does, and how it's used.
Avoid abbreviations and single-letter names outside of tiny loop scopes.
Use consistent naming conventions across the codebase (e.g., camelCase for variables, PascalCase for types/classes).
Name booleans as predicates: isActive, hasPermission, shouldRetry.
Name functions after what they do, not how they do it.

## Functions
Keep functions short and focused on a single task. If you need a comment to explain a section, extract it into a well-named function.
Limit parameters. More than 3 usually means you should pass an object/struct.
Avoid side effects. A function named getUser should not also modify state. If it does, the name should reflect that.
Prefer pure functions where practical — same inputs, same outputs, no hidden state.
Return early to avoid deep nesting. Guard clauses up top, happy path below.

## Structure and Organization
Follow the Single Responsibility Principle at every level: functions, modules, and files should each have one reason to change.
Group code by feature/domain, not by technical layer, when the codebase is large enough to warrant it.
Keep files focused. If a file requires extensive scrolling or has multiple unrelated sections, split it.
Manage dependencies deliberately. Depend on abstractions where volatility is high; depend on concretes where stability is high.

## Error Handling
Handle errors explicitly. Don't swallow exceptions or ignore error return values.
Fail fast and fail loudly in development. Provide clear, actionable error messages.
Use typed/structured errors over raw strings when the language supports it.
Distinguish between recoverable errors (retry, fallback) and programmer errors (crash, fix the bug).

## Comments and Documentation
Code should be self-documenting through clear naming and structure. Comments explain why, not what.
Delete commented-out code. That's what version control is for.
Document public APIs, non-obvious design decisions, and known limitations.
Keep comments maintained. A stale comment is worse than no comment.

## Testing
Write tests that describe behavior, not implementation. Tests should survive refactors.
Each test should have a single reason to fail.
Use descriptive test names that read as specifications: rejects_expired_tokens, returns_empty_list_when_no_results.
Avoid testing private internals. Test the public interface.
Keep tests fast. Slow tests don't get run.

## General Discipline
Don't repeat yourself, but don't abstract prematurely either. Duplication is cheaper than the wrong abstraction.
Leave code cleaner than you found it (Boy Scout Rule).
Prefer immutability and const-correctness by default.
Optimize for readability first, performance second — unless profiling tells you otherwise.
Delete dead code. Unused imports, unreachable branches, vestigial functions — remove them.
Keep diffs small. Small, focused commits and PRs are easier to review, easier to revert, and less likely to introduce bugs.
