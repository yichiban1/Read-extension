# DeepRead — Project Guidance

## What DeepRead is

DeepRead is a student interaction-design prototype built as a Chrome
Manifest V3 extension.

Its purpose is to explore a specific idea:

AI should help people understand a webpage while they are still reading
the original webpage.

DeepRead is not a chatbot, a generic summarizer, or a replacement reader.

The original webpage remains the primary reading surface.
DeepRead adds a visible, reversible assistance layer around it.

## Core interaction principle

The most important relationship is:

ORIGINAL WEBPAGE <-> DEEPREAD ASSISTANCE

AI output should connect back to real content on the webpage whenever
possible.

DeepRead should feel closer to an immersive reading / annotation layer
than to a separate AI application.

Visible interaction quality is more important than backend sophistication.

## Current product scope

DeepRead currently demonstrates four source-linked reading behaviours within one lightweight layer:

1. Page Guide / Reading Atlas + Structure
   - Help the user understand what the page is about and how it is organised.
   - Structure items should connect back to real source passages.
   - Clicking a structure item should navigate to and visibly identify its source.

2. Smart Lens
   - Offer a few useful comprehension aids for difficult concepts, terms, or background.
   - Keep each aid linked to its original passage through the Spine and margin trace.
   - Zero findings is valid; do not fill the page with trivial suggestions.

3. Critical Lens
   - Optionally identify genuinely noteworthy passages that may deserve closer inspection.
   - Examples include evidence, assumptions, causal claims, uncertainty,
     missing counterpoints, or value judgements.
   - Frame findings as questions for the reader, not verdicts or automatic fact checks.
   - Cite supplied Source IDs. It is acceptable to return no findings.
   - Do not manufacture criticism just to populate the interface.

4. Select Text -> Explain
   - The user selects difficult text on the original webpage.
   - DeepRead explains it in simpler language and may use an analogy.
   - The explanation should stay visually connected to the selected source.
   - This is explanation, not translation.

Do not add more primary behaviours unless the user explicitly asks for them.

## Source-linked interaction

The same source-mapping system should support all four behaviours.

Useful webpage content should be mapped to stable DeepRead source IDs.

AI requests and responses should preserve these IDs where useful so that
DeepRead can navigate, highlight, annotate, or explain the real source
content rather than creating disconnected AI output.

## Design direction

DeepRead should feel like a designed reading tool.

Prefer:
- direct interaction with the webpage
- clear visual hierarchy
- contextual UI
- scrolling and highlighting
- subtle motion when it improves understanding
- immediately visible cause and effect

Avoid:
- generic chat interfaces
- dashboards
- unnecessary settings
- decorative complexity
- fake AI content
- repeated AI labels or annotations everywhere
- features whose main purpose is to make the prototype look more complex

The original prototype is the starting point, not an interface that must
be preserved unchanged.

You may simplify, replace, or restructure existing implementation when it
clearly improves the current source-linked reading experiences.

## Technical direction

This is a university prototype, not production infrastructure.

Prefer the simplest implementation that produces a convincing,
understandable interaction.

Use:
- understandable JavaScript
- minimal dependencies
- real webpage content
- real source references
- one simple AI provider when AI is needed

Avoid:
- provider abstraction layers
- unnecessary frameworks
- authentication systems
- production backend architecture
- complex state systems
- abstractions created only for hypothetical future features

Refactoring is allowed when it makes the implementation simpler or enables
the core interaction more cleanly.

Do not preserve old code merely because it already exists.

## Working with the project

Before substantial implementation:
- inspect the current code and understand the existing interaction
- identify what is useful and what can be replaced
- keep changes aligned with the four current reading behaviours

After implementation:
- test the actual extension behaviour
- explain what changed
- explain how the user can test it

Do not invent additional product requirements.

If several implementation approaches are possible, favour the one that
makes the interaction easiest to see, understand, demonstrate, and explain
in a Digital Design assessment.
