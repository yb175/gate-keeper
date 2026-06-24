---
name: software-architecture
description: Guidelines for maintaining clear module boundaries, separation of concerns, layered architectures, and loose coupling.
license: Complete terms in LICENSE.txt
---

# Software Architecture Guidelines

Always maintain clear module boundaries and prioritize a separation of concerns throughout the codebase.

## Architectural Principles

1. **Layered Responsibility**: Business logic should not be mixed inside transport routers, UI components, or controllers. When adding new functionality, determine which layer it belongs to:
   - **Transport Layer**: API endpoints, MCP handlers, routing logic.
   - **Service Layer**: Core business rules and domain logic.
   - **Repository Layer**: Data access queries and mapping logic.
   - **Persistence Layer**: Database schemas, migration scripts, ORM configuration.
   - **Orchestration Layer**: Coordination between service classes or external systems.
   - **Presentation Layer**: UI elements, styling, and visual rendering.

2. **Decoupling & Cohesion**:
   - Avoid tight coupling between modules.
   - Avoid giant files; break down complex code into smaller, focused files.
   - Prefer composition over inheritance to keep logic flexible and reusable.
