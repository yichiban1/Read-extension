// DeepRead prototype content script.
// The original webpage remains the reading surface. This script adds a small,
// source-linked guide and a contextual selection action around it.

const GUIDE_ID = "deepread-guide";
const SHELL_ID = "deepread-shell";
const RAIL_ID = "deepread-rail-toggle";
const SELECTION_ACTION_ID = "deepread-selection-action";
const SOURCE_ATTRIBUTE = "data-deepread-source-id";
const WORDS_PER_MINUTE = 220;
const MIN_ARTICLE_CHARS = 200;
const MIN_PAGE_TEXT_CHARS = 60;
const MAX_FALLBACK_STRUCTURE_ITEMS = 6;
const MIN_FALLBACK_PASSAGE_CHARS = 36;

let selectionAction = null;
let selectionContext = null;
let dismissedSelectionText = "";

function getPageContext() {
  return {
    title: document.title || "Untitled page",
    hostname: window.location.hostname || "Current page"
  };
}

function clonePageWithoutDeepRead() {
  const clone = document.cloneNode(true);
  clone.querySelector(`#${SHELL_ID}`)?.remove();
  clone.querySelector(`#${GUIDE_ID}`)?.remove();
  clone.querySelector(`#${SELECTION_ACTION_ID}`)?.remove();
  return clone;
}

function extractArticle() {
  return new Readability(clonePageWithoutDeepRead()).parse();
}

// Fallback for pages Readability does not recognise as an article:
// strip obvious chrome and take remaining text.
function extractWholePageText() {
  const clone = document.body.cloneNode(true);
  clone.querySelector(`#${SHELL_ID}`)?.remove();
  clone.querySelector(`#${GUIDE_ID}`)?.remove();
  clone.querySelector(`#${SELECTION_ACTION_ID}`)?.remove();
  clone
    .querySelectorAll("script, style, noscript, template, svg, nav, header, footer, aside")
    .forEach((element) => element.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

// Returns { article, text, mode } or null when a page has almost no text.
function analysePage() {
  let parsed = null;
  try {
    parsed = extractArticle();
  } catch (error) {
    console.warn("DeepRead article extraction failed.", error);
  }

  const articleText = parsed && parsed.textContent ? parsed.textContent.trim() : "";
  if (parsed && articleText.length >= MIN_ARTICLE_CHARS) {
    return { article: parsed, text: articleText, mode: "article" };
  }

  const pageText = extractWholePageText();
  if (pageText.length >= MIN_PAGE_TEXT_CHARS) {
    return {
      article: {
        title: document.title,
        byline: null,
        siteName: null,
        content: null,
        paragraphCount: document.body.querySelectorAll("p").length
      },
      text: pageText,
      mode: "page"
    };
  }

  return null;
}

function countWords(text) {
  const latinWords = (text.match(/[A-Za-z0-9'’]+/g) || []).length;
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  return latinWords + cjkChars;
}

function estimateReadingMinutes(wordCount) {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

function countExtractedParagraphs(article) {
  if (!article.content) {
    return 0;
  }

  if (typeof article.content.querySelectorAll === "function") {
    return article.content.querySelectorAll("p").length;
  }

  const contentContainer = document.createElement("div");
  contentContainer.innerHTML = String(article.content);
  return contentContainer.querySelectorAll("p").length;
}

function getSourceLevel(source) {
  if (Number.isInteger(source.level) && source.level >= 1 && source.level <= 6) {
    return source.level;
  }
  const match = /^h([1-6])$/.exec(source.tag || "");
  return match ? Number(match[1]) : 0;
}

function isHeadingSource(source) {
  return getSourceLevel(source) > 0;
}

function getStructureSources(sourceMap) {
  const sources = sourceMap && Array.isArray(sourceMap.sources)
    ? sourceMap.sources
    : [];
  const headings = sources.filter(isHeadingSource);

  if (headings.length >= 2) {
    return { mode: "headings", sources: headings };
  }

  const contentBlocks = sources.filter((source) =>
    ["p", "li", "blockquote", "pre", "div", "span"].includes(source.tag)
  );
  const substantialBlocks = contentBlocks.filter(
    (source) => source.text.trim().length >= MIN_FALLBACK_PASSAGE_CHARS
  );
  const fallbackBlocks = (substantialBlocks.length > 0
    ? substantialBlocks
    : contentBlocks
  ).slice(0, MAX_FALLBACK_STRUCTURE_ITEMS);

  if (headings.length === 1) {
    const selectedIds = new Set([headings[0].id, ...fallbackBlocks.map((source) => source.id)]);
    return {
      mode: "passages",
      sources: sources
        .filter((source) => selectedIds.has(source.id))
        .slice(0, MAX_FALLBACK_STRUCTURE_ITEMS + 1)
    };
  }

  return { mode: "passages", sources: fallbackBlocks };
}

function shortenSourceText(text, maxLength = 120) {
  const compactText = text.replace(/\s+/g, " ").trim();
  return compactText.length > maxLength
    ? `${compactText.slice(0, maxLength - 1).trimEnd()}…`
    : compactText;
}

function setActiveStructureButton(guide, sourceId) {
  guide.querySelectorAll(".deepread-structure-button.is-active").forEach((button) => {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  });
  guide.querySelectorAll(".deepread-structure-item.is-active").forEach((item) => {
    item.classList.remove("is-active");
  });

  const activeButton = guide.querySelector(
    `.deepread-structure-button[data-source-id="${CSS.escape(sourceId)}"]`
  );
  if (activeButton) {
    activeButton.classList.add("is-active");
    activeButton.closest(".deepread-structure-item")?.classList.add("is-active");
    activeButton.setAttribute("aria-current", "location");
  }
}

function observeStructureSources(guide, sourceMap) {
  guide._deepreadStructureObserver?.disconnect();
  guide._deepreadStructureObserver = null;

  if (!sourceMap || typeof IntersectionObserver !== "function") {
    return;
  }

  const sourceEntries = Array.from(
    guide.querySelectorAll(".deepread-structure-button[data-source-id]")
  )
    .map((button) => ({
      button,
      element: sourceMap.elementsById.get(button.dataset.sourceId)
    }))
    .filter((entry) => entry.element);

  if (sourceEntries.length === 0) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (visibleEntry) {
        const sourceId = visibleEntry.target.getAttribute(SOURCE_ATTRIBUTE);
        if (sourceId) {
          setActiveStructureButton(guide, sourceId);
        }
      }
    },
    { root: null, rootMargin: "-24% 0px -58% 0px", threshold: [0, 0.2, 0.6] }
  );

  sourceEntries.forEach(({ element }) => observer.observe(element));
  guide._deepreadStructureObserver = observer;
}

function renderStructureItem(list, source, index, mode) {
  const item = document.createElement("li");
  const level = getSourceLevel(source);
  item.className = "deepread-structure-item";
  item.dataset.level = level || "0";

  const button = document.createElement("button");
  button.className = "deepread-structure-button";
  button.type = "button";
  button.dataset.sourceId = source.id;
  button.setAttribute(
    "aria-label",
    `Jump to ${mode === "headings" ? source.text : `passage ${index + 1}`}`
  );

  const number = document.createElement("span");
  number.className = "deepread-structure-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const copy = document.createElement("span");
  copy.className = "deepread-structure-copy";

  const label = document.createElement("strong");
  label.className = "deepread-structure-label";
  label.textContent = mode === "headings"
    ? source.text
    : `Reading point ${String(index + 1).padStart(2, "0")}`;

  const meta = document.createElement("small");
  meta.className = "deepread-structure-meta";
  meta.textContent = `${source.tag.toUpperCase()} · LIVE SOURCE`;

  copy.append(label, meta);
  if (mode === "passages") {
    const excerpt = document.createElement("span");
    excerpt.className = "deepread-structure-excerpt";
    excerpt.textContent = shortenSourceText(source.text);
    copy.append(excerpt);
  }

  const arrow = document.createElement("span");
  arrow.className = "deepread-structure-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  button.append(number, copy, arrow);
  button.addEventListener("click", () => {
    const didNavigate = globalThis.DeepReadSourceMapping?.scrollToSourceId?.(source.id);
    if (didNavigate) {
      setActiveStructureButton(list.closest("#deepread-guide"), source.id);
    }
  });

  item.append(button);
  return item;
}

function renderStructure(guide, sourceMap) {
  const list = guide.querySelector(".deepread-structure-list");
  const count = guide.querySelector(".deepread-structure-count");
  const empty = guide.querySelector(".deepread-structure-empty");
  const note = guide.querySelector(".deepread-structure-note");
  const structure = getStructureSources(sourceMap);

  list.replaceChildren();
  count.textContent = structure.sources.length
    ? `${structure.sources.length} ${structure.mode === "headings" ? "headings" : "reading points"}`
    : "No mapped structure";
  note.textContent = structure.mode === "headings"
    ? "Click a heading to jump to its live passage. The active item follows the page while you read."
    : "No heading outline was available, so these points use real page text.";

  if (structure.sources.length === 0) {
    empty.hidden = false;
    observeStructureSources(guide, sourceMap);
    return;
  }

  empty.hidden = true;
  structure.sources.forEach((source, index) => {
    list.append(renderStructureItem(list, source, index, structure.mode));
  });
  observeStructureSources(guide, sourceMap);
}

function buildSourceMapSafely() {
  try {
    return globalThis.DeepReadSourceMapping?.buildSourceMap?.() || null;
  } catch (error) {
    console.warn("DeepRead source mapping failed.", error);
    return null;
  }
}

function refreshGuide(guide) {
  const sourceMap = buildSourceMapSafely();
  guide._deepreadSourceMap = sourceMap;
  renderStructure(guide, sourceMap);
  fillAnalysis(guide);
}

function setGuideExpanded(shell, expanded) {
  const rail = shell.querySelector(`#${RAIL_ID}`);
  const guide = shell.querySelector(`#${GUIDE_ID}`);
  shell.classList.toggle("deepread-shell--expanded", expanded);
  rail.setAttribute("aria-expanded", String(expanded));
  rail.setAttribute("aria-label", expanded ? "Collapse DeepRead guide" : "Open DeepRead guide");
  guide.setAttribute("aria-hidden", String(!expanded));

  if (expanded) {
    refreshGuide(guide);
  } else {
    dismissSelectionAction();
    rail.focus();
  }
}

function createGuide() {
  const { title, hostname } = getPageContext();
  const shell = document.createElement("div");
  shell.id = SHELL_ID;
  shell.className = "deepread-shell deepread-shell--expanded";

  const rail = document.createElement("button");
  rail.id = RAIL_ID;
  rail.className = "deepread-rail-toggle";
  rail.type = "button";
  rail.setAttribute("aria-expanded", "true");
  rail.setAttribute("aria-controls", GUIDE_ID);
  rail.setAttribute("aria-label", "Collapse DeepRead guide");
  rail.innerHTML = '<span class="deepread-rail-mark" aria-hidden="true">D</span><span class="deepread-rail-label">Guide</span><span class="deepread-rail-arrow" aria-hidden="true">›</span>';

  const guide = document.createElement("aside");
  guide.id = GUIDE_ID;
  guide.setAttribute("aria-label", "DeepRead Page Guide");
  guide.setAttribute("aria-hidden", "false");
  guide.innerHTML = `
    <header class="deepread-header">
      <div>
        <p>DEEPREAD / SOURCE GUIDE</p>
        <h1>Page guide</h1>
      </div>
      <button class="deepread-close" type="button" aria-label="Collapse guide">×</button>
    </header>

    <section class="deepread-page-context">
      <span>ORIGINAL PAGE</span>
      <strong class="deepread-page-title"></strong>
      <em class="deepread-page-hostname"></em>
    </section>

    <section class="deepread-guide-intro">
      <span>FOLLOW THE SOURCE</span>
      <p>Use the page's own structure, then jump straight back to the live passage.</p>
    </section>

    <section class="deepread-analysis">
      <section class="deepread-structure" aria-labelledby="deepread-structure-title">
        <div class="deepread-structure-heading">
          <span id="deepread-structure-title">PAGE MAP</span>
          <small class="deepread-structure-count"></small>
        </div>
        <ol class="deepread-structure-list"></ol>
        <p class="deepread-structure-empty" hidden>No useful source blocks were found for a guide.</p>
        <small class="deepread-structure-note"></small>
      </section>

      <section class="deepread-snapshot" aria-label="Page snapshot">
        <span>PAGE SNAPSHOT</span>
        <div class="deepread-snapshot-loading">Reading details…</div>
        <div class="deepread-result" hidden>
          <div class="deepread-stats">
            <div class="deepread-stat-row"><b>Words</b><i class="deepread-stat-words"></i></div>
            <div class="deepread-stat-row"><b>Reading time</b><i class="deepread-stat-time"></i></div>
            <div class="deepread-stat-row deepread-stat-paras-row"><b>Blocks</b><i class="deepread-stat-paras"></i></div>
            <em class="deepread-article-title"></em>
            <small class="deepread-article-meta"></small>
          </div>
        </div>
        <div class="deepread-failure" hidden>
          <p>There is not enough readable text for a page snapshot.</p>
          <small>The page map can still work when mapped passages are available.</small>
        </div>
      </section>
    </section>

    <footer>Live source layer · nothing leaves your browser.</footer>
  `;

  guide.querySelector(".deepread-page-title").textContent = title;
  guide.querySelector(".deepread-page-hostname").textContent = hostname;
  rail.addEventListener("click", () => {
    setGuideExpanded(shell, !shell.classList.contains("deepread-shell--expanded"));
  });
  guide.querySelector(".deepread-close").addEventListener("click", () => {
    setGuideExpanded(shell, false);
  });

  shell.append(rail, guide);
  document.documentElement.appendChild(shell);
  refreshGuide(guide);
  return shell;
}

function fillAnalysis(guide) {
  const loading = guide.querySelector(".deepread-snapshot-loading");
  if (loading) {
    loading.remove();
  }

  const result = guide.querySelector(".deepread-result");
  const failure = guide.querySelector(".deepread-failure");
  result.hidden = true;
  failure.hidden = true;

  const analysis = analysePage();
  if (!analysis) {
    failure.hidden = false;
    return;
  }

  const { article, text, mode } = analysis;
  result.hidden = false;

  const wordCount = countWords(text);
  result.querySelector(".deepread-stat-words").textContent = wordCount.toLocaleString();
  result.querySelector(".deepread-stat-time").textContent = `${estimateReadingMinutes(wordCount)} min`;
  result.querySelector(".deepread-stat-paras").textContent = mode === "article"
    ? String(countExtractedParagraphs(article))
    : String(article.paragraphCount);
  result.querySelector(".deepread-article-title").textContent = article.title || "";
  result.querySelector(".deepread-article-meta").textContent = [
    mode === "article" ? "Article extraction" : "Full-page capture",
    article.byline ? `By ${article.byline}` : null,
    article.siteName || null
  ]
    .filter(Boolean)
    .join(" · ");
}

function toggleGuide() {
  const existingShell = document.getElementById(SHELL_ID);
  if (existingShell) {
    setGuideExpanded(
      existingShell,
      !existingShell.classList.contains("deepread-shell--expanded")
    );
    return;
  }

  createGuide();
}

function getMappedSourceForNode(node) {
  const map = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!map || !element || element.closest(`#${SHELL_ID}, #${SELECTION_ACTION_ID}`)) {
    return null;
  }

  const mappedElement = element.closest(`[${SOURCE_ATTRIBUTE}]`);
  if (!mappedElement) {
    return null;
  }

  const sourceId = mappedElement.getAttribute(SOURCE_ATTRIBUTE);
  return sourceId && map.elementsById.get(sourceId) === mappedElement
    ? { sourceId, element: mappedElement }
    : null;
}

function positionSelectionAction(action, range) {
  const rect = range.getBoundingClientRect();
  action.style.visibility = "hidden";
  if (!rect.width && !rect.height) {
    return;
  }

  requestAnimationFrame(() => {
    const width = action.offsetWidth || 190;
    const height = action.offsetHeight || 42;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8)
    );
    const top = rect.bottom + height + 10 < window.innerHeight
      ? rect.bottom + 10
      : Math.max(8, rect.top - height - 10);
    action.style.left = `${left}px`;
    action.style.top = `${top}px`;
    action.style.visibility = "visible";
  });
}

function createSelectionAction() {
  const action = document.createElement("div");
  action.id = SELECTION_ACTION_ID;
  action.className = "deepread-selection-action";
  action.setAttribute("role", "dialog");
  action.setAttribute("aria-label", "DeepRead selection action");
  action.innerHTML = `
    <span class="deepread-selection-kicker">DEEPREAD / SELECTED TEXT</span>
    <button class="deepread-selection-explain" type="button">Explain</button>
    <small class="deepread-selection-status" hidden></small>
  `;

  action.addEventListener("mousedown", (event) => event.preventDefault());
  action.querySelector(".deepread-selection-explain").addEventListener("click", () => {
    if (!selectionContext) {
      return;
    }
    const status = action.querySelector(".deepread-selection-status");
    status.textContent = "AI explanation not connected yet";
    status.hidden = false;
    action.classList.add("is-status");
  });
  document.documentElement.appendChild(action);
  return action;
}

function dismissSelectionAction() {
  selectionAction?.remove();
  selectionAction = null;
  selectionContext = null;
}

function showSelectionAction(text, source, range) {
  if (!selectionAction) {
    selectionAction = createSelectionAction();
  }

  selectionContext = {
    text,
    sourceId: source.sourceId
  };
  selectionAction.dataset.sourceId = source.sourceId;
  selectionAction.classList.remove("is-status");
  selectionAction.querySelector(".deepread-selection-status").hidden = true;
  selectionAction.querySelector(".deepread-selection-explain").disabled = false;
  positionSelectionAction(selectionAction, range);
}

function handleSelectionChange() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";
  if (
    !selection ||
    selection.isCollapsed ||
    text.replace(/\s/g, "").length < 3 ||
    text === dismissedSelectionText
  ) {
    if (!text || text === dismissedSelectionText) {
      dismissSelectionAction();
    }
    return;
  }

  const source = getMappedSourceForNode(selection.anchorNode);
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (!source || !range) {
    dismissSelectionAction();
    return;
  }

  dismissedSelectionText = "";
  showSelectionAction(text, source, range);
}

function handleDocumentPointerDown(event) {
  if (event.target.closest?.(`#${SELECTION_ACTION_ID}`)) {
    return;
  }

  const currentText = window.getSelection()?.toString().trim() || "";
  if (selectionAction) {
    dismissedSelectionText = currentText;
    dismissSelectionAction();
  }
}

document.addEventListener("selectionchange", handleSelectionChange);
document.addEventListener("mousedown", handleDocumentPointerDown, true);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    dismissedSelectionText = window.getSelection()?.toString().trim() || "";
    dismissSelectionAction();
  }
});
window.addEventListener("scroll", () => {
  if (selectionAction && !selectionAction.classList.contains("is-status")) {
    dismissSelectionAction();
  }
}, { passive: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_DEEPREAD_GUIDE") {
    toggleGuide();
    sendResponse({ ok: true, context: getPageContext() });
  }
});
