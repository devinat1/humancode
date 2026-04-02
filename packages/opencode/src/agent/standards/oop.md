# Elegant Objects (OOP)

Based on the principles from Elegant Objects by Yegor Bugayenko.

## Objects
Treat objects as living organisms with behavior, not passive data bags.
Make objects immutable by default. Use final/readonly fields.
Make objects fully formed at construction time. Everything they need comes through the constructor.

## Naming
Name classes as nouns representing what they are (Invoice, HttpRequest, ParsedFile).
Don't use "-er" names (Manager, Controller, Helper, Validator, Processor).

## Constructors
Use constructors as the sole way to configure and initialize objects.
Don't use static factory methods, builders, or setter-based initialization.
Keep constructors simple — store dependencies, don't do heavy work.

## Getters and Setters
Don't expose internal state through getters.
Don't allow external mutation through setters.
Provide behavior methods instead. Follow "tell, don't ask."

## Static Methods
Don't use static methods. They are procedural code in OOP disguise.
Don't create utility classes (StringUtils, FileUtils, DateUtils).
Use object instances with interfaces so dependencies can be swapped and composed.

## NULL
Don't return null from methods.
Fail fast — throw a meaningful exception if something is genuinely wrong.
Use Null Objects that implement the interface with safe no-op behavior.
Return empty collections instead of null.

## Error Handling
Fail fast and loud. Throw exceptions with clear messages.
Don't return error codes or special sentinel values.
Keep exception handling close to where the error originates.

## Class Design
Keep classes small and focused with a single clear responsibility.
Don't create deep inheritance hierarchies. Prefer composition and decorators.
Program to interfaces, not implementations.

## Encapsulation
Hide all internal representation.
Don't break encapsulation for convenience.
Make it possible to change internal representation without affecting callers.

## General
Don't write code that is clever. Write code that is simple and readable.
Prefer many small objects composed together over few large objects.
Don't use reflection, annotations, or runtime magic.
Make dependencies explicit — if a class needs something, it should be in the constructor.
