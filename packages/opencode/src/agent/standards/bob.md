# Clean Code (Robert C. Martin)

## Core Philosophy
Code is read far more often than it is written. Optimize for readability.
Leave the code cleaner than you found it (Boy Scout Rule).

## Functions
Keep functions small. Under 20 lines is a good target.
A function should do one thing, do it well, and do it only.
Operate at one level of abstraction per function.
Minimize arguments. Zero is ideal, one or two is fine, three is suspicious.
Don't use flag arguments (booleans that make a function do two different things).
Prefer exceptions over return codes.

## Naming
Names should reveal intent. `elapsedTimeInDays` over `d`.
Classes get noun names. Functions get verb names.
Don't use encodings or prefixes like Hungarian notation.
Use consistent vocabulary. Pick one word per concept.

## Comments
A comment is a failure to express yourself in code.
Acceptable: legal headers, TODOs, warnings, clarification of intent.
Never commit commented-out code. Delete it.

## Error Handling
Use exceptions, not return codes.
Don't return null. Return empty collections or a sensible default.
Don't pass null as a function argument.
Create informative error messages with context.

## Classes and Objects
Classes should be small in responsibility, not just line count.
Single Responsibility Principle: one reason to change.
High cohesion: methods should use most of the class's instance variables.
Prefer composition over inheritance.

## SOLID Principles
SRP: One actor/stakeholder per class.
OCP: Add behavior by adding code, not editing existing code.
LSP: Subtypes must be substitutable without surprises.
ISP: Small, focused interfaces.
DIP: Depend on abstractions. Inject dependencies via constructor.

## Formatting
Files should read like newspaper articles: headline, synopsis, then details.
Keep related code vertically close.
Be consistent with team conventions.

## Boundaries
Wrap third-party APIs in your own thin abstraction layer.
Write learning tests for third-party code.

## Law of Demeter
A method should only call methods on: its own object, its parameters, objects it creates, and its direct collaborators.
Avoid train wrecks: `a.getB().getC().doThing()`.

## DRY
Every piece of knowledge should have a single, unambiguous representation.
Duplication applies to logic, not just literal text.

## Tests
Follow TDD: failing test first, minimal code to pass, refactor.
Tests should be F.I.R.S.T.: Fast, Independent, Repeatable, Self-validating, Timely.
One concept per test. Tests are documentation.
