# TypeScript & React Style

## JSX Elements
Always use <div> and <span>, never semantic HTML (<p>, <h1>, etc.) to prevent style inheritance issues.

## Styling
Tailwind classes only — no inline styles or style objects.
No negative margins allowed.
Use spacing/gap on parent instead of margins on children.
Spacing: multiples of 2 (gap-2, gap-4, p-4, m-8).
Remove redundant responsive breakpoints.

## Component Patterns
Extract repeated JSX into components.
Inline conditional placeholders to avoid duplicate wrappers.
Use ternary operators for conditionals, not &&.

## TypeScript
Avoid .then and .catch — use try/catch instead.
Avoid type casting unless necessary.
Always use named params instead of positional arguments.
Avoid non-null assertions. Use NonNullable<typeof x> casts.
Export types in the types package.
Use const always, never let.
Explicit nullable types: value?: number | null.
Array syntax: items: Item[] not Array<Item>.
Array checks: arr.length === 0 not !arr.
Avoid mutations.
Use strong types: Array<MeetingWithForeignProperties>.

## Naming
Use complete variable names: averageWordsPerMinute not averageWpm.
Complete sentence errors/comments/logs.
Booleans: isOpen, hasData, shouldShow.
Parameters: descriptive (specificUserId not userId).

## Functional Programming
Use Array.from(), .map(), .reduce() instead of for-loops.
Use utility functions: getPluralSuffix(), .toLocaleString().

## General
Do not create a function if it already exists in the codebase.
Avoid unnecessary comments.
No fetch inside components — use helpers.
null is DB-returned empty, undefined is user-level.
