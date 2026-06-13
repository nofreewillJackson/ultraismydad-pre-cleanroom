

> **System Directive: Legacy Architecture Extraction**
> You are analyzing a legacy codebase. Our goal is to perform a "Cleanroom Extraction." We are abandoning this architecture, but we need to extract the pure domain rules, the design system, and the user behaviors so we can rebuild them in a new, isolated repository using Vertical Slice Architecture.
> **CRITICAL GUARDRAILS:**
> * **DO NOT** propose an architecture for the new system.
> * **DO NOT** map out the current folders, components, or database adapters as things to replicate.
> * **DO NOT** write any code.
> * Your only job is to extract the *what* (rules and behaviors) and ignore the *how* (frameworks and implementation).
> 
> 
> Please read the entire codebase and generate the following three markdown documents. Output them clearly so I can save them.
> ### Deliverable 1: `TECH_STACK.md`
> 
> 
> Generate an inventory of the physical targets and dead code.
> 1. **Framework & Deployment Targets:** List the specific versions of the frontend/backend frameworks and the target deployment environment (e.g., Astro 4.0, Node, static HTML).
> 2. **Design Tokens:** Extract the literal CSS values. Give me the hex codes, font families, and core spacing variables so the new UI can be built completely blind to the old components.
> 3. **The Graveyard:** Identify "dead code" paths—features, endpoints, or UI components that exist in the codebase but are no longer active, reachable, or used.
> 
> 
> ### Deliverable 2: `DOMAIN_PRIMER.md`
> 
> 
> Extract the implicit business rules and fallbacks. Look deeply at how data is saved and processed.
> 4. **Data Shapes:** What are the exact fields on the core entities (Work Items, Product Lines, Logs)? Which ones are required vs. optional?
> 5. **Implicit Fallbacks & Inference:** Look for silent guessing. What happens if a work item is saved without a product line? How does the system currently guess relationships from text? List every default value and inference cascade you can find.
> 6. **Privacy/Visibility:** What are the exact rules that prevent an item from being seen publicly?
> 
> 
> ### Deliverable 3: `BEHAVIOR_INVENTORY.md`
> 
> 
> Create a flat, exhaustive list of observable user capabilities.
> 7. Write this as a strict checklist (e.g., `- [ ] User can publish a work item`, `- [ ] System generates a slug from the title`).
> 8. Include the "Happy Paths" and the "Trust Boundaries/Error Paths" (e.g., `- [ ] System rejects a work item with an invalid series`).
> 9. **IMPORTANT:** Do NOT list architectural behaviors (e.g., do not write "System calls the Postgres adapter"). Only list observable domain and user behaviors.
> 
> 

---

### What to do next:

Once Claude Code spits out those three documents, you literally close that terminal, open a fresh terminal in your brand-new empty repository, and drop these three files in alongside your `CLEANROOM_SPEC.md`, your `tdd-playbook.md`, and the `Roadmap` we just wrote.



## Vertical Slicing & Architecture

We use **Clean Architecture** (Ports and Adapters) to protect our domain rules. we build in **Vertical Slices** to prove those rules survive reality.


Instead, for every feature, we traverse the slice:

1. **Domain Test (Pure):** Prove the business rule in memory.
    
2. **Adapter Test (Integration):** Prove the infrastructure can store/retrieve it using an ephemeral test database.
    
3. **Use Case:** Wire the application boundary.
    
4. **UI/Delivery:** Hook it to the router or shell.