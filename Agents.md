# DeepRead — Codex Project Instructions

## 1. Project identity

DeepRead is a student interaction-design prototype built as a Chrome Manifest V3 browser extension.

This is NOT intended to become a production-grade reading platform.

The goal of the project is to demonstrate a strong interaction concept:
AI should assist reading inside the original webpage, rather than replacing the webpage with a separate chatbot or summary screen.

The prototype should feel visually obvious, interactive, and suitable for a Digital Design university assignment.

## 2. Core design idea

The most important relationship is:

ORIGINAL WEBPAGE <-> DEEPREAD SIDEBAR / AI ANNOTATIONS

AI output should connect back to the actual webpage whenever possible.

The project should feel closer to an immersive browser layer, such as inline translation or annotation tools, rather than a conventional AI chat interface.

Do not over-engineer backend architecture at the expense of visible interaction quality.

## 3. Three core features

These three features are the heart of the project and should remain recognisable throughout development.

### A. Introduction + Structure Tree

DeepRead gives the user an overview of the current article and visualises its structure.

Desired interaction:
- show a short introduction / overview
- display an argument or content structure tree
- tree nodes should correspond to parts of the original webpage
- clicking a node should scroll to the relevant paragraph
- ideally hover / active states should also visually connect the tree to the webpage
- scrolling the webpage may update the active structure node if practical

The goal is to make the tree feel like a map of the webpage, not a disconnected diagram.

### B. Plain Explanation

The user can select difficult text, terminology, code, or a complex passage and ask DeepRead to explain it simply.

Desired interaction:
- user selects text directly on the webpage
- a small contextual action appears near the selection
- explanation should preferably appear close to the source text or clearly connect back to it
- explanation may include a simple analogy
- this should feel lightweight and contextual, similar to immersive translation / inline annotation

Avoid making the user copy text into a separate chatbot.

### C. Review / Controversy Points

DeepRead may identify passages worth examining more carefully.

Desired interaction:
- lightly mark relevant locations on the original webpage
- clicking a marker can open more detail in the sidebar
- explain WHY the passage is worth reviewing
- possible categories include weak evidence, causal leap, value judgement, missing counterargument, or unclear support
- wording should remain cautious; AI is assisting review, not declaring absolute truth

The visual treatment should be restrained and should not overwhelm the article.

## 4. Shared interaction principle

All three features should reuse a common webpage-to-sidebar mapping system.

Where possible:
- headings and paragraphs should receive stable internal source IDs
- DeepRead results should reference those source IDs
- source IDs should allow scrolling to and temporarily highlighting original content
- future LLM output should preserve these references

This source mapping is more important than sophisticated backend work.

## 5. Visual / UX direction

The project should look like a designed reading tool, not a generic AI dashboard.

Keep the existing editorial visual direction unless there is a clear reason to change it.

Prioritise:
- visible webpage interaction
- subtle animation
- highlighting
- scrolling
- contextual UI
- connection between sidebar information and source content

Avoid:
- unnecessary dashboards
- excessive settings
- generic chat bubbles
- feature bloat
- redesigning the entire extension without a reason

Reading statistics such as word count and reading time are secondary features, not the main focus.

## 6. Scope

For this prototype, supporting normal HTML web pages is enough.

Do NOT expand scope into PDF readers, scanned documents, native desktop apps, complex authentication, or production infrastructure unless explicitly requested.

It is acceptable for this to remain a university prototype.

A polished interaction demo is more important than broad compatibility.

## 7. Technical philosophy

The user is a Digital Design student, not a professional software engineer.

Prefer:
- understandable JavaScript
- small functions
- clear comments
- minimal dependencies
- incremental changes
- code that can be explained during assessment

Avoid:
- unnecessary frameworks
- large architectural rewrites
- premature abstractions
- adding infrastructure that does not visibly improve the prototype

Before making large structural changes, explain why they are necessary.

## 8. Current prototype

The project already has:
- Chrome Manifest V3 extension structure
- popup -> content script communication
- Mozilla Readability article extraction
- fallback whole-page text extraction
- injected right-side Reading Guide
- basic reading statistics
- local extractive summary prototype

The current local summary is temporary and may later be replaced by LLM-generated analysis.

Read README.md and todo.md before modifying implementation.

The original design rationale is documented in:
S4106162_Assignment 1_Design Problem Response .md

Use that document for design context, but do not assume every ambitious statement in the assignment must be implemented literally.

## 9. Development priority

Unless the user requests otherwise, use this order:

1. Keep the current prototype working.
2. Fix obvious runtime bugs.
3. Build reliable source mapping between extracted content and original webpage elements.
4. Build visible Structure Tree <-> webpage interaction.
5. Build text-selection -> Plain Explanation interaction.
6. Build webpage Review Point markers -> sidebar detail interaction.
7. Connect real LLM analysis when useful.
8. Polish animation and presentation for the final demo.

Do not start by building complicated backend systems.

## 10. Working behaviour

For substantial tasks:
- inspect the existing implementation first
- preserve working functionality
- describe the intended change briefly before editing
- implement one coherent stage at a time
- test the extension after changes
- tell the user which files changed and how to test the result

If a request would greatly increase scope, point that out and suggest a smaller prototype-friendly implementation.