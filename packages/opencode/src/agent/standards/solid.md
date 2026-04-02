# SOLID Principles

## Single Responsibility (SRP)
A class or module should have one reason to change. If a class handles both user authentication and email formatting, split it. When you describe what something does and use the word "and," that's a hint.

## Open/Closed (OCP)
Code should be open for extension but closed for modification. Add new behavior through new code (new classes, new implementations) rather than editing existing, tested code. Polymorphism, strategy patterns, and plugin architectures all serve this.

## Liskov Substitution (LSP)
Subtypes must be substitutable for their base types without breaking correctness. If a function accepts a base class, any derived class should work without surprises.

## Interface Segregation (ISP)
Don't force clients to depend on methods they don't use. Prefer small, focused interfaces over large, general-purpose ones. If implementers routinely leave methods as no-ops or throw NotImplemented, the interface is too wide.

## Dependency Inversion (DIP)
High-level modules should not depend on low-level modules — both should depend on abstractions. Your business logic shouldn't import a specific Postgres driver directly; it should depend on a repository interface that a Postgres implementation satisfies.
