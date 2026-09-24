// DeepRead content script.
// The original webpage remains the reading surface. DeepRead adds a quiet
// launcher, a spatial source-linked Reading Atlas, and selection-first Explain.

const GUIDE_ID = "deepread-guide";
const SHELL_ID = "deepread-shell";
const RAIL_ID = "deepread-rail-toggle";
const SOURCE_ANNOTATION_ID = "deepread-source-annotation";
const SELECTION_ACTION_ID = "deepread-selection-action";
const EXPLANATION_CARD_ID = "deepread-explanation-card";
const SOURCE_ATTRIBUTE = "data-deepread-source-id";
const WORDS_PER_MINUTE = 220;
const MIN_ARTICLE_CHARS = 200;
const MIN_PAGE_TEXT_CHARS = 60;
const MAX_FALLBACK_STRUCTURE_ITEMS = 6;
const MIN_FALLBACK_PASSAGE_CHARS = 36;
const MAX_PAGE_MAP_SOURCE_BLOCKS = 36;
const MAX_PAGE_MAP_SOURCE_CHARS = 700;
const DYNAMIC_REFRESH_DELAY_MS = 900;

let selectionAction = null;
let selectionContext = null;
let dismissedSelectionText = "";
let selectionRequestToken = 0;
let dynamicRefreshTimer = null;
let dynamicObserver = null;
let sourceMapNeedsRefresh = true;
let sourceAnnotationState = null;
let sourceAnnotationFrame = 0;

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
  clone.querySelector(`#${EXPLANATION_CARD_ID}`)?.remove();
  return clone;
}

function extractArticle() {
  return new Readability(clonePageWithoutDeepRead()).parse();
}

function extractWholePageText() {
  const clone = document.body.cloneNode(true);
  clone.querySelector(`#${SHELL_ID}`)?.remove();
  clone.querySelector(`#${GUIDE_ID}`)?.remove();
  clone.querySelector(`#${SELECTION_ACTION_ID}`)?.remove();
  clone.querySelector(`#${EXPLANATION_CARD_ID}`)?.remove();
  clone
    .querySelectorAll("script, style, noscript, template, svg, nav, header, footer, aside")
    .forEach((element) => element.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

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

  if (headings.length >= 2) {
    return { mode: "headings", sources: headings };
  }

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

function setActiveStructureNode(guide, sourceId) {
  guide.querySelectorAll(".deepread-structure-button.is-active").forEach((button) => {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  });
  guide.querySelectorAll(".deepread-structure-item.is-active").forEach((item) => {
    item.classList.remove("is-active");
  });

  const activeButton = Array.from(
    guide.querySelectorAll(".deepread-structure-button[data-source-ids]")
  ).find((button) =>
    button.dataset.sourceIds.split(",").includes(sourceId)
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

  const sourceEntries = [];
  guide.querySelectorAll(".deepread-structure-button[data-source-ids]").forEach((button) => {
    button.dataset.sourceIds.split(",").forEach((sourceId) => {
      const element = sourceMap.elementsById.get(sourceId);
      if (element) {
        sourceEntries.push({ button, element, sourceId });
      }
    });
  });

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
          setActiveStructureNode(guide, sourceId);
        }
      }
    },
    { root: null, rootMargin: "-24% 0px -58% 0px", threshold: [0, 0.2, 0.6] }
  );

  sourceEntries.forEach(({ element }) => observer.observe(element));
  guide._deepreadStructureObserver = observer;
}

function getSourceById(sourceMap, sourceId) {
  return (sourceMap?.sources || []).find((source) => source.id === sourceId) || null;
}

function navigateToAtlasSource(guide, sourceId, label, sourceText) {
  const mapping = globalThis.DeepReadSourceMapping;
  const sourceMap = mapping?.getCurrentMap?.();
  const sourceElement = sourceMap?.elementsById?.get(sourceId);
  if (!sourceElement?.isConnected || !mapping?.scrollToSourceId?.(sourceId)) {
    showStructureError(guide, "This source is no longer available. Reopen the Atlas to refresh the page map.");
    return;
  }

  const shell = guide.closest(`#${SHELL_ID}`);
  if (shell) {
    setGuideExpanded(shell, false);
  }
  showSourceAnnotation({ label, sourceId, sourceText, sourceElement });
  scheduleSourceAnnotationPosition();
}

function createAtlasNode({ label, kind, sourceIds, sourceMap, index, isLiveSource = false }) {
  const item = document.createElement("li");
  const firstSourceId = sourceIds[0];
  const source = getSourceById(sourceMap, firstSourceId);
  const sourceText = source?.text || "";
  const displayLabel = String(label || "Source passage").trim();
  item.className = "deepread-structure-item deepread-atlas-node";
  item.dataset.atlasSize = ["feature", "medium", "narrow", "wide", "medium", "narrow"][index % 6];

  const button = document.createElement("button");
  button.className = "deepread-structure-button deepread-atlas-node-button";
  button.type = "button";
  button.dataset.sourceIds = sourceIds.join(",");
  button.setAttribute("aria-label", `Preview and follow ${displayLabel}`);

  const number = document.createElement("span");
  number.className = "deepread-structure-number deepread-atlas-number";
  number.textContent = String(index + 1).padStart(2, "0");

  const copy = document.createElement("span");
  copy.className = "deepread-structure-copy deepread-atlas-copy";

  const meta = document.createElement("small");
  meta.className = "deepread-structure-meta deepread-atlas-meta";
  meta.textContent = isLiveSource
    ? `${kind.toUpperCase()} · LIVE SOURCE`
    : `${kind.toUpperCase()} · ${sourceIds.length} SOURCE${sourceIds.length === 1 ? "" : "S"}`;

  const title = document.createElement("strong");
  title.className = "deepread-structure-label deepread-atlas-title";
  title.textContent = displayLabel;

  const preview = document.createElement("span");
  preview.className = "deepread-atlas-preview";
  preview.textContent = sourceText
    ? shortenSourceText(sourceText, 260)
    : "The cited passage is no longer available on this page.";

  const arrow = document.createElement("span");
  arrow.className = "deepread-structure-arrow deepread-atlas-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  copy.append(meta, title, preview);
  button.append(number, copy, arrow);
  button.addEventListener("click", () => {
    if (source) {
      navigateToAtlasSource(
        document.getElementById(GUIDE_ID),
        firstSourceId,
        displayLabel,
        source.text
      );
    }
  });
  item.append(button);
  return item;
}

function renderStructureItem(list, source, index, mode, sourceMap) {
  const label = mode === "headings"
    ? source.text
    : shortenSourceText(source.text, 110) || `Live source ${String(index + 1).padStart(2, "0")}`;
  const item = createAtlasNode({
    label,
    kind: source.tag || "source",
    sourceIds: [source.id],
    sourceMap,
    index,
    isLiveSource: true
  });
  item.dataset.level = getSourceLevel(source) || "0";
  list.append(item);
  return item;
}

function showStructureError(guide, message) {
  const error = guide.querySelector(".deepread-structure-error");
  error.textContent = message;
  error.hidden = false;
}

function resetStructureUi(guide) {
  guide.querySelector(".deepread-structure-error").hidden = true;
  guide.querySelector(".deepread-structure-empty").hidden = true;
  guide.querySelector(".deepread-structure-list").replaceChildren();
  guide.querySelector("#deepread-structure-title").textContent = "AI PAGE MAP";
}

function renderStructureLoading(guide) {
  resetStructureUi(guide);
  guide.querySelector(".deepread-structure-count").textContent = "building…";
  guide.querySelector(".deepread-structure-note").textContent =
    "Reading live source blocks to find the page's main relationships.";
  const loading = document.createElement("li");
  loading.className = "deepread-map-loading";
  loading.textContent = "Building a concise source-grounded map…";
  guide.querySelector(".deepread-structure-list").append(loading);
}

function renderFallbackStructure(guide, sourceMap, label = "LIVE SOURCE OUTLINE") {
  resetStructureUi(guide);
  const list = guide.querySelector(".deepread-structure-list");
  const count = guide.querySelector(".deepread-structure-count");
  const empty = guide.querySelector(".deepread-structure-empty");
  const note = guide.querySelector(".deepread-structure-note");
  const structure = getStructureSources(sourceMap);

  guide.querySelector("#deepread-structure-title").textContent = label;
  count.textContent = structure.sources.length
    ? `${structure.sources.length} live points`
    : "No mapped structure";
  note.textContent = "This is a live-source fallback, not an AI-generated interpretation.";

  if (structure.sources.length === 0) {
    empty.hidden = false;
    observeStructureSources(guide, sourceMap);
    return;
  }

  structure.sources.forEach((source, index) => {
    renderStructureItem(list, source, index, structure.mode, sourceMap);
  });
  observeStructureSources(guide, sourceMap);
}

function validatePageMap(pageMap, sourceMap) {
  const validSourceIds = new Set(
    (sourceMap?.sources || []).map((source) => source.id)
  );
  const nodes = Array.isArray(pageMap?.nodes) ? pageMap.nodes : [];
  return nodes
    .map((node) => {
      const sourceIds = Array.isArray(node?.sourceIds)
        ? [...new Set(node.sourceIds.filter((id) => validSourceIds.has(id)))]
        : [];
      const label = typeof node?.label === "string" ? node.label.trim().slice(0, 120) : "";
      const kind = typeof node?.kind === "string" ? node.kind.trim().slice(0, 40) : "source";
      return { label, kind: kind || "source", sourceIds };
    })
    .filter((node) => node.label && node.sourceIds.length > 0)
    .slice(0, 7);
}

function renderAiPageMap(guide, nodes, sourceMap) {
  resetStructureUi(guide);
  const list = guide.querySelector(".deepread-structure-list");
  guide.querySelector(".deepread-structure-count").textContent = `${nodes.length} AI nodes`;
  guide.querySelector(".deepread-structure-note").textContent =
    "Previews quote the first cited passage. Choose a node to return to that source.";

  nodes.forEach((node, index) => {
    list.append(createAtlasNode({
      label: node.label,
      kind: node.kind,
      sourceIds: node.sourceIds,
      sourceMap,
      index
    }));
  });

  observeStructureSources(guide, sourceMap);
}

function buildSourceMapSafely() {
  try {
    const sourceMap = globalThis.DeepReadSourceMapping?.buildSourceMap?.() || null;
    sourceMapNeedsRefresh = !sourceMap;
    return sourceMap;
  } catch (error) {
    sourceMapNeedsRefresh = true;
    console.warn("DeepRead source mapping failed.", error);
    return null;
  }
}

function sendDeepReadMessage(message) {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      reject(new Error("DeepRead runtime messaging is unavailable."));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve(response);
    });
  });
}

function getPageMapPayload(sourceMap) {
  return {
    page: getPageContext(),
    sources: (sourceMap?.sources || [])
      .filter((source) => source.text && source.text.trim())
      .slice(0, MAX_PAGE_MAP_SOURCE_BLOCKS)
      .map((source) => ({
        id: source.id,
        tag: source.tag,
        text: source.text.slice(0, MAX_PAGE_MAP_SOURCE_CHARS)
      }))
  };
}

async function refreshGuide(guide) {
  const requestId = (guide._deepreadMapRequestId || 0) + 1;
  guide._deepreadMapRequestId = requestId;
  const page = getPageContext();
  guide.querySelector(".deepread-page-title").textContent = page.title;
  guide.querySelector(".deepread-page-hostname").textContent = page.hostname;
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const needsFreshMap = sourceMapNeedsRefresh || !currentMap?.root?.isConnected;
  const sourceMap = needsFreshMap ? buildSourceMapSafely() : currentMap;
  guide._deepreadSourceMap = sourceMap;

  fillAnalysis(guide);
  if (needsFreshMap) {
    guide._deepreadPageMapCache = null;
  }
  if (guide._deepreadPageMapCache?.sourceMap === sourceMap) {
    return;
  }

  renderStructureLoading(guide);

  const sourceCount = sourceMap?.sources?.length || 0;
  const totalText = (sourceMap?.sources || []).reduce(
    (total, source) => total + source.text.length,
    0
  );
  if (sourceCount < 2 || totalText < 240) {
    renderFallbackStructure(guide, sourceMap, "LIVE SOURCE OUTLINE");
    showStructureError(guide, "This page does not contain enough coherent text for an AI Page Map.");
    return;
  }

  try {
    const response = await sendDeepReadMessage({
      type: "DEEPREAD_GENERATE_PAGE_MAP",
      payload: getPageMapPayload(sourceMap)
    });
    if (!guide.isConnected || guide._deepreadMapRequestId !== requestId) {
      return;
    }

    if (!response?.ok) {
      renderFallbackStructure(guide, sourceMap, "LIVE SOURCE OUTLINE");
      showStructureError(guide, response?.message || "The AI Page Map is unavailable. No AI content was shown.");
      return;
    }

    const nodes = validatePageMap(response.pageMap, sourceMap);
    if (nodes.length === 0) {
      renderFallbackStructure(guide, sourceMap, "LIVE SOURCE OUTLINE");
      showStructureError(guide, "The AI returned no valid source-linked map. No invented nodes were shown.");
      return;
    }

    guide._deepreadPageMapCache = { sourceMap, nodes };
    renderAiPageMap(guide, nodes, sourceMap);
  } catch (error) {
    if (guide.isConnected && guide._deepreadMapRequestId === requestId) {
      renderFallbackStructure(guide, sourceMap, "LIVE SOURCE OUTLINE");
      showStructureError(guide, "The AI Page Map could not be reached. The live source outline is still available.");
    }
  }
}

function setGuideExpanded(shell, expanded) {
  const rail = shell.querySelector(`#${RAIL_ID}`);
  const guide = shell.querySelector(`#${GUIDE_ID}`);
  shell.classList.toggle("deepread-shell--expanded", expanded);
  shell.classList.toggle("deepread-shell--atlas-open", expanded);
  rail.setAttribute("aria-expanded", String(expanded));
  rail.setAttribute("aria-label", expanded ? "Close Reading Atlas" : "Open Reading Atlas");
  guide.setAttribute("aria-hidden", String(!expanded));
  guide.inert = !expanded;

  if (expanded) {
    removeSourceAnnotation();
    void refreshGuide(guide);
    requestAnimationFrame(() => guide.querySelector(".deepread-close")?.focus());
  } else {
    guide._deepreadStructureObserver?.disconnect();
    dismissSelectionAction();
    removeExplanationCard();
    rail.focus();
  }
}

function createDeepReadShell() {
  if (document.getElementById(SHELL_ID)) {
    return document.getElementById(SHELL_ID);
  }

  const { title, hostname } = getPageContext();
  const shell = document.createElement("div");
  shell.id = SHELL_ID;
  shell.className = "deepread-shell";

  const rail = document.createElement("button");
  rail.id = RAIL_ID;
  rail.className = "deepread-rail-toggle";
  rail.type = "button";
  rail.setAttribute("aria-expanded", "false");
  rail.setAttribute("aria-controls", GUIDE_ID);
  rail.setAttribute("aria-label", "Open Reading Atlas");
  rail.innerHTML = '<span class="deepread-rail-mark" aria-hidden="true">D</span><span class="deepread-rail-label">Atlas</span><span class="deepread-rail-arrow" aria-hidden="true">↗</span>';

  const guide = document.createElement("aside");
  guide.id = GUIDE_ID;
  guide.setAttribute("role", "dialog");
  guide.setAttribute("aria-modal", "true");
  guide.setAttribute("aria-label", "DeepRead Reading Atlas");
  guide.setAttribute("aria-hidden", "true");
  guide.tabIndex = -1;
  guide.inert = true;
  guide.innerHTML = `
    <button class="deepread-atlas-scrim" type="button" aria-label="Close Reading Atlas"></button>
    <main class="deepread-atlas-panel">
      <header class="deepread-atlas-topbar">
        <div class="deepread-atlas-brand"><span class="deepread-atlas-brand-mark">D</span><span>DEEPREAD / READING ATLAS</span></div>
        <button class="deepread-close" type="button" aria-label="Return to the original page"><span>Return to page</span><b aria-hidden="true">×</b></button>
      </header>

      <section class="deepread-atlas-masthead">
        <div class="deepread-atlas-page-context">
          <span class="deepread-atlas-kicker">ORIGINAL PAGE / <span class="deepread-page-hostname"></span></span>
          <h1 class="deepread-page-title"></h1>
          <p>Explore the page through passages that lead back to the original text.</p>
        </div>
        <section class="deepread-snapshot" aria-label="Reading estimate">
          <div class="deepread-snapshot-loading">Reading details…</div>
          <div class="deepread-result" hidden>
            <div class="deepread-stats">
              <span>PAGE AT A GLANCE</span>
              <div class="deepread-stat-row"><b>Words</b><i class="deepread-stat-words"></i></div>
              <div class="deepread-stat-row"><b>Reading time</b><i class="deepread-stat-time"></i></div>
              <div class="deepread-stat-row deepread-stat-paras-row"><b>Blocks</b><i class="deepread-stat-paras"></i></div>
              <em class="deepread-article-title"></em>
              <small class="deepread-article-meta"></small>
            </div>
          </div>
          <div class="deepread-failure" hidden>
            <p>There is not enough readable text for a page snapshot.</p>
            <small>Try selecting a passage to use Explain.</small>
          </div>
        </section>
      </section>

      <section class="deepread-atlas-map" aria-labelledby="deepread-structure-title">
        <div class="deepread-atlas-section-heading">
          <div>
            <span class="deepread-atlas-kicker">FOLLOW THE SOURCE</span>
            <h2 id="deepread-structure-title">A map of this page</h2>
          </div>
          <small class="deepread-structure-count"></small>
        </div>
        <p class="deepread-structure-note" aria-live="polite"></p>
        <ol class="deepread-structure-list" aria-label="Source-linked page map"></ol>
        <p class="deepread-structure-error" role="status" hidden></p>
        <p class="deepread-structure-empty" hidden>No useful source passages were found on this page.</p>
      </section>

      <footer class="deepread-atlas-footer"><span>AI MAP / LIVE PAGE SOURCES</span><span>Hover or focus a node to preview its passage · Select to return</span></footer>
    </main>
  `;

  guide.querySelector(".deepread-page-title").textContent = title;
  guide.querySelector(".deepread-page-hostname").textContent = hostname;
  rail.addEventListener("click", () => {
    setGuideExpanded(shell, !shell.classList.contains("deepread-shell--expanded"));
  });
  guide.querySelector(".deepread-atlas-scrim").addEventListener("click", () => {
    setGuideExpanded(shell, false);
  });
  guide.querySelector(".deepread-close").addEventListener("click", () => {
    setGuideExpanded(shell, false);
  });

  shell.append(rail, guide);
  document.documentElement.appendChild(shell);
  return shell;
}

function ensureDeepReadShell() {
  return createDeepReadShell();
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
  const shell = ensureDeepReadShell();
  setGuideExpanded(shell, !shell.classList.contains("deepread-shell--expanded"));
}

function getElementFromNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
}

function isExcludedSelectionElement(element) {
  if (!element) {
    return true;
  }
  if (element.closest(`#${SHELL_ID}, #${SELECTION_ACTION_ID}, #${EXPLANATION_CARD_ID}`)) {
    return true;
  }
  if (
    element.closest(
      "button, input, textarea, select, option, form, nav, [contenteditable=\"true\"], [role=\"button\"], [role=\"menuitem\"], [role=\"tab\"]"
    )
  ) {
    return true;
  }
  return element.getAttribute("type") === "password";
}

function getMappedSourceForElement(element) {
  const map = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  if (!map || !element) {
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

function getReadableContextElement(element) {
  let current = element;
  for (let depth = 0; current && current !== document.body && depth < 7; depth += 1) {
    if (["P", "LI", "BLOCKQUOTE", "PRE", "CODE", "TD", "ARTICLE", "SECTION", "DIV"].includes(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }
  return element && element !== document.body ? element : null;
}

function getNearbyContext(element, selectedText) {
  const fullText = (element?.innerText || element?.textContent || "").replace(/\s+/g, " ").trim();
  if (!fullText) {
    return "";
  }

  const normalizedSelection = selectedText.replace(/\s+/g, " ").trim();
  const selectedIndex = normalizedSelection ? fullText.indexOf(normalizedSelection) : -1;
  if (selectedIndex >= 0) {
    const start = Math.max(0, selectedIndex - 420);
    const end = Math.min(fullText.length, selectedIndex + normalizedSelection.length + 620);
    return `${start > 0 ? "…" : ""}${fullText.slice(start, end)}${end < fullText.length ? "…" : ""}`;
  }
  return shortenSourceText(fullText, 1100);
}

function getSelectionRect(range) {
  const rect = range.getBoundingClientRect();
  if (rect.width || rect.height) {
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  }
  const firstRect = range.getClientRects()[0];
  return firstRect
    ? { left: firstRect.left, top: firstRect.top, bottom: firstRect.bottom }
    : null;
}

function positionFloatingElement(element, rect) {
  element.style.visibility = "hidden";
  requestAnimationFrame(() => {
    const width = element.offsetWidth || 280;
    const height = element.offsetHeight || 80;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8)
    );
    const top = rect.bottom + height + 10 < window.innerHeight
      ? rect.bottom + 10
      : Math.max(8, rect.top - height - 10);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.visibility = "visible";
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
    void explainSelection();
  });
  document.documentElement.appendChild(action);
  return action;
}

function dismissSelectionAction() {
  selectionRequestToken += 1;
  selectionAction?.remove();
  selectionAction = null;
  selectionContext = null;
}

function removeExplanationCard() {
  document.getElementById(EXPLANATION_CARD_ID)?.remove();
}

function removeSourceAnnotation() {
  if (sourceAnnotationFrame) {
    cancelAnimationFrame(sourceAnnotationFrame);
    sourceAnnotationFrame = 0;
  }
  document.getElementById(SOURCE_ANNOTATION_ID)?.remove();
  sourceAnnotationState = null;
}

function positionSourceAnnotation() {
  const note = document.getElementById(SOURCE_ANNOTATION_ID);
  const sourceElement = sourceAnnotationState?.sourceElement;
  if (!note || !sourceElement?.isConnected) {
    removeSourceAnnotation();
    return;
  }

  const rect = sourceElement.getBoundingClientRect();
  const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  note.hidden = !isVisible;
  if (!isVisible) {
    return;
  }

  note.classList.remove("is-compact");
  const width = note.offsetWidth || 248;
  const height = note.offsetHeight || 130;
  const gap = 14;
  const rightSpace = window.innerWidth - rect.right;
  const leftSpace = rect.left;

  let left;
  let top;
  if (rightSpace >= width + gap) {
    left = rect.right + gap;
    top = rect.top;
  } else if (leftSpace >= width + gap) {
    left = rect.left - width - gap;
    top = rect.top;
  } else {
    note.classList.add("is-compact");
    left = Math.min(Math.max(8, rect.right - 42), Math.max(8, window.innerWidth - 50));
    top = rect.top + Math.min(Math.max(0, rect.height / 2 - 20), 24);
  }

  if (!note.classList.contains("is-compact")) {
    left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));
    top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8));
  } else {
    top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - 50));
  }
  note.style.left = `${left}px`;
  note.style.top = `${top}px`;
}

function scheduleSourceAnnotationPosition() {
  if (!sourceAnnotationState || sourceAnnotationFrame) {
    return;
  }
  sourceAnnotationFrame = requestAnimationFrame(() => {
    sourceAnnotationFrame = 0;
    positionSourceAnnotation();
  });
}

function showSourceAnnotation({ label, sourceId, sourceText, sourceElement }) {
  removeSourceAnnotation();
  const shell = document.getElementById(SHELL_ID);
  if (!shell || !sourceElement?.isConnected) {
    return;
  }

  const note = document.createElement("aside");
  note.id = SOURCE_ANNOTATION_ID;
  note.className = "deepread-source-annotation";
  note.setAttribute("role", "note");
  note.setAttribute("aria-label", "Atlas source annotation");
  note.innerHTML = `
    <button class="deepread-source-note-marker" type="button" aria-expanded="false" aria-label="Open source annotation">↗</button>
    <div class="deepread-source-note-card">
      <header><span>FROM THE ATLAS</span><button class="deepread-source-note-close" type="button" aria-label="Dismiss source annotation">×</button></header>
      <strong class="deepread-source-note-title"></strong>
      <p class="deepread-source-note-preview"></p>
      <p class="deepread-source-note-full" hidden></p>
      <button class="deepread-source-note-more" type="button" hidden>Show longer excerpt</button>
    </div>
  `;
  note.dataset.sourceId = sourceId;
  note.querySelector(".deepread-source-note-title").textContent = label;
  note.querySelector(".deepread-source-note-preview").textContent = shortenSourceText(sourceText, 150);
  note.querySelector(".deepread-source-note-full").textContent = shortenSourceText(sourceText, 1200);

  const marker = note.querySelector(".deepread-source-note-marker");
  marker.addEventListener("click", () => {
    const isOpen = note.classList.toggle("is-open");
    marker.setAttribute("aria-expanded", String(isOpen));
    marker.setAttribute("aria-label", isOpen ? "Close source annotation" : "Open source annotation");
  });
  note.querySelector(".deepread-source-note-close").addEventListener("click", removeSourceAnnotation);

  const preview = note.querySelector(".deepread-source-note-preview");
  const fullText = note.querySelector(".deepread-source-note-full");
  const moreButton = note.querySelector(".deepread-source-note-more");
  const compactText = shortenSourceText(sourceText, 150);
  if (sourceText.trim().length > compactText.length) {
    moreButton.hidden = false;
    moreButton.addEventListener("click", () => {
      const isExpanded = !fullText.hidden;
      preview.hidden = !isExpanded;
      fullText.hidden = isExpanded;
      moreButton.textContent = isExpanded ? "Show longer excerpt" : "Show less";
    });
  }

  shell.append(note);
  sourceAnnotationState = { sourceElement };
  positionSourceAnnotation();
}

function showSelectionAction(text, context, rect) {
  removeExplanationCard();
  if (!selectionAction) {
    selectionAction = createSelectionAction();
  }
  selectionContext = { ...context, text, rect };
  selectionAction.dataset.sourceId = context.sourceId || "";
  selectionAction.classList.remove("is-loading", "is-error");
  const status = selectionAction.querySelector(".deepread-selection-status");
  status.hidden = true;
  const button = selectionAction.querySelector(".deepread-selection-explain");
  button.disabled = false;
  button.textContent = "Explain";
  positionFloatingElement(selectionAction, rect);
}

function setSelectionActionStatus(message, state = "") {
  if (!selectionAction) {
    return;
  }
  const status = selectionAction.querySelector(".deepread-selection-status");
  status.textContent = message;
  status.hidden = false;
  selectionAction.classList.toggle("is-loading", state === "loading");
  selectionAction.classList.toggle("is-error", state === "error");
}

function isValidExplanation(explanation) {
  return Boolean(
    explanation &&
    typeof explanation.plainLanguage === "string" &&
    explanation.plainLanguage.trim() &&
    typeof explanation.context === "string" &&
    typeof explanation.analogy === "string"
  );
}

function showExplanationCard(explanation, context) {
  removeExplanationCard();
  const card = document.createElement("aside");
  card.id = EXPLANATION_CARD_ID;
  card.className = "deepread-explanation-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "DeepRead explanation");
  card.innerHTML = `
    <header class="deepread-explanation-header">
      <div>
        <span>DEEPREAD / EXPLAIN</span>
        <strong>For this passage</strong>
      </div>
      <button class="deepread-explanation-close" type="button" aria-label="Dismiss explanation">×</button>
    </header>
    <section class="deepread-explanation-body">
      <p class="deepread-explanation-plain"></p>
      <p class="deepread-explanation-context"></p>
      <p class="deepread-explanation-analogy" hidden></p>
    </section>
    <footer>AI explanation · source remains on the original page</footer>
  `;
  card.querySelector(".deepread-explanation-plain").textContent = explanation.plainLanguage.trim();
  card.querySelector(".deepread-explanation-context").textContent = explanation.context.trim();
  if (explanation.analogy.trim()) {
    const analogy = card.querySelector(".deepread-explanation-analogy");
    analogy.hidden = false;
    analogy.textContent = `Analogy: ${explanation.analogy.trim()}`;
  }
  card.dataset.sourceId = context.sourceId || "";
  card.querySelector(".deepread-explanation-close").addEventListener("click", removeExplanationCard);
  document.documentElement.appendChild(card);
  positionFloatingElement(card, context.rect);
}

async function explainSelection() {
  if (!selectionContext || !selectionAction) {
    return;
  }

  const context = { ...selectionContext };
  const requestToken = ++selectionRequestToken;
  const button = selectionAction.querySelector(".deepread-selection-explain");
  button.disabled = true;
  button.textContent = "Explaining…";
  setSelectionActionStatus("DeepRead is reading this passage…", "loading");

  try {
    const response = await sendDeepReadMessage({
      type: "DEEPREAD_EXPLAIN_SELECTION",
      payload: {
        text: context.text,
        context: context.nearbyContext,
        sourceId: context.sourceId || null,
        page: context.page
      }
    });
    if (requestToken !== selectionRequestToken) {
      return;
    }
    if (!response?.ok) {
      button.disabled = false;
      button.textContent = "Explain";
      setSelectionActionStatus(response?.message || "No explanation was returned. Nothing was fabricated.", "error");
      return;
    }
    if (!isValidExplanation(response.explanation)) {
      button.disabled = false;
      button.textContent = "Explain";
      setSelectionActionStatus("The AI returned no usable explanation. Nothing was shown.", "error");
      return;
    }
    dismissSelectionAction();
    showExplanationCard(response.explanation, context);
  } catch (error) {
    if (requestToken !== selectionRequestToken) {
      return;
    }
    button.disabled = false;
    button.textContent = "Explain";
    setSelectionActionStatus("DeepRead could not reach the AI provider. Nothing was fabricated.", "error");
    console.warn("DeepRead explanation request failed.", error);
  }
}

function handleSelectionChange() {
  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : "";
  if (!selection || selection.isCollapsed || text.replace(/\s/g, "").length < 3 || text === dismissedSelectionText) {
    if (!text || text === dismissedSelectionText) {
      dismissSelectionAction();
    }
    return;
  }

  const anchor = getElementFromNode(selection.anchorNode);
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range ? getSelectionRect(range) : null;
  if (!anchor || !range || !rect || isExcludedSelectionElement(anchor)) {
    dismissSelectionAction();
    return;
  }

  dismissedSelectionText = "";
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  if (sourceMapNeedsRefresh || !currentMap?.root?.isConnected) {
    buildSourceMapSafely();
  }
  const mappedSource = getMappedSourceForElement(anchor);
  const contextElement = mappedSource?.element || getReadableContextElement(anchor);
  showSelectionAction(text, {
    nearbyContext: getNearbyContext(contextElement, text),
    sourceId: mappedSource?.sourceId || null,
    page: getPageContext()
  }, rect);
}

function handleDocumentPointerDown(event) {
  if (
    event.target.closest?.(`#${SELECTION_ACTION_ID}`) ||
    event.target.closest?.(`#${EXPLANATION_CARD_ID}`)
  ) {
    return;
  }

  const currentText = window.getSelection()?.toString().trim() || "";
  if (selectionAction) {
    dismissedSelectionText = currentText;
    dismissSelectionAction();
  }
  removeExplanationCard();
}

function scheduleGuideRefresh() {
  sourceMapNeedsRefresh = true;
  const shell = document.getElementById(SHELL_ID);
  if (!shell?.classList.contains("deepread-shell--expanded")) {
    return;
  }
  clearTimeout(dynamicRefreshTimer);
  dynamicRefreshTimer = setTimeout(() => {
    const guide = document.getElementById(GUIDE_ID);
    if (guide && shell.classList.contains("deepread-shell--expanded")) {
      void refreshGuide(guide);
    }
  }, DYNAMIC_REFRESH_DELAY_MS);
}

function isDeepReadNode(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return Boolean(element?.closest?.(`#${SHELL_ID}, #${SELECTION_ACTION_ID}, #${EXPLANATION_CARD_ID}`));
}

function startDynamicRefresh() {
  if (!document.body || dynamicObserver) {
    return;
  }
  dynamicObserver = new MutationObserver((mutations) => {
    const hasExternalChange = mutations.some((mutation) =>
      !isDeepReadNode(mutation.target) && (
        mutation.type === "characterData" ||
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !isDeepReadNode(node))
      )
    );
    if (hasExternalChange) {
      sourceMapNeedsRefresh = true;
      scheduleGuideRefresh();
      scheduleSourceAnnotationPosition();
    }
  });
  dynamicObserver.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  window.addEventListener("popstate", scheduleGuideRefresh);
  window.addEventListener("hashchange", scheduleGuideRefresh);
}

function initializeDeepRead() {
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
    return;
  }
  buildSourceMapSafely();
  ensureDeepReadShell();
  startDynamicRefresh();
}

document.addEventListener("selectionchange", handleSelectionChange);
document.addEventListener("mousedown", handleDocumentPointerDown, true);
document.addEventListener("keydown", (event) => {
  const shell = document.getElementById(SHELL_ID);
  const guide = shell?.querySelector(`#${GUIDE_ID}`);
  const atlasIsOpen = shell?.classList.contains("deepread-shell--expanded");

  if (event.key === "Escape") {
    dismissedSelectionText = window.getSelection()?.toString().trim() || "";
    dismissSelectionAction();
    removeExplanationCard();
    removeSourceAnnotation();
    if (atlasIsOpen) {
      setGuideExpanded(shell, false);
    }
    return;
  }

  if (event.key === "Tab" && atlasIsOpen && guide) {
    const focusable = Array.from(
      guide.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    ).filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      guide.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !guide.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("scroll", () => {
  dismissSelectionAction();
  removeExplanationCard();
  scheduleSourceAnnotationPosition();
}, { passive: true });
window.addEventListener("resize", scheduleSourceAnnotationPosition, { passive: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_DEEPREAD_GUIDE") {
    toggleGuide();
    sendResponse({ ok: true, context: getPageContext() });
  }
});

initializeDeepRead();
