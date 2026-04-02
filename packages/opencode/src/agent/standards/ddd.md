# Domain-Driven Design

## Aggregate Rules
Reference other aggregates by identity only. Never hold direct object references.
One aggregate per transaction. Handle cross-aggregate consistency via eventual consistency and domain events.
The aggregate root is the sole entry point. External objects may only reference the root.
Enforce invariants within the aggregate boundary.
Keep aggregates small. Only group entities when a true transactional invariant requires it.

## Bounded Context Rules
Each bounded context owns its own ubiquitous language and model.
Models must not leak across context boundaries. Use anti-corruption layers.
A single team should own a bounded context.

## Domain Modeling Rules
Model the domain, not the database. The domain model drives design.
Ubiquitous language is non-negotiable. Code and conversation use the same domain terms.
Entities have identity; value objects do not. Value objects must be immutable.
Domain logic belongs in the domain layer. Avoid anemic models.
Repositories abstract persistence. The domain layer must not know about databases.
Factories handle complex creation.
Domain events capture side effects between aggregates.
