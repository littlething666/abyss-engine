App is unreleased, so you can introduce breaking changes with no data migration or backward compatibility, etc.

- [ ] Remove @src/prompts/** and transfer responsibility for all llm requests to @backend.
- [ ] Introduce CLOZE and free form cards to the workflow.
- [ ] Remove static pre-generated @public/data/subjects deck json stubs.
- [ ] check if we can remove @src/features/subjectGeneration .
- [ ] Reduce LLM context workload
  - [ ] extract most important concepts and plan cards specifications based on theory
  - [ ] determine suitable card types and mini-game types for concept (there might be multiple cards for the same concept but questions should not repeat)
  - [ ] generate cards content based on the plan specifications
  - [ ] we must stop relying on LLM to generate ids, they should be generated deterministically by the backend
