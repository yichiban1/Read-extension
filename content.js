// DeepRead content script.
// The webpage stays readable beneath a small source-linked reading layer.

const GUIDE_ID = "deepread-guide";
const SHELL_ID = "deepread-shell";
const RAIL_ID = "deepread-rail-toggle";
const SMART_ACTION_ID = "deepread-smart-action";
const XRAY_LABEL_ID = "deepread-xray-label";
const SELECTION_ACTION_ID = "deepread-selection-action";
const EXPLANATION_CARD_ID = "deepread-explanation-card";
const SOURCE_ATTRIBUTE = "data-deepread-source-id";
const MAX_FALLBACK_STRUCTURE_ITEMS = 6;
const MIN_FALLBACK_PASSAGE_CHARS = 36;
const MAX_PAGE_MAP_SOURCE_BLOCKS = 36;
const MAX_PAGE_MAP_SOURCE_CHARS = 700;
const DYNAMIC_REFRESH_DELAY_MS = 900;
const MAX_READING_TRAIL = 5;

let selectionAction = null;
let selectionContext = null;
let dismissedSelectionText = "";
let selectionRequestToken = 0;
let dynamicRefreshTimer = null;
let dynamicObserver = null;
let sourceMapNeedsRefresh = true;
let readingTrail = [];
let readingTrailSequence = 0;
let marginLayoutFrame = 0;
let smartReadingItems = [];
let smartReadingMap = null;
let smartReadingLoaded = false;
let smartReadingVisible = false;
let smartReadingRequestToken = 0;
let smartStatusTimer = null;
let activeExplanation = null;
let peekedSourceElement = null;
let layoutFrame = 0;

function getPageContext() {
  return {
    title: document.title || "Untitled page",
    hostname: window.location.hostname || "Current page"
  };
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
  const sectionHeadings = headings.filter((source) => getSourceLevel(source) >= 2);
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
    const outline = sectionHeadings.length >= 2 ? sectionHeadings : headings;
    const sampled = outline.length <= MAX_FALLBACK_STRUCTURE_ITEMS
      ? outline
      : Array.from({ length: MAX_FALLBACK_STRUCTURE_ITEMS }, (_, index) =>
        outline[Math.round(index * (outline.length - 1) / (MAX_FALLBACK_STRUCTURE_ITEMS - 1))]
      );
    return { mode: "headings", sources: sampled };
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
  const shell = guide.closest(`#${SHELL_ID}`);
  shell.querySelectorAll("[data-source-ids].is-active").forEach((button) => {
    button.classList.remove("is-active");
    button.removeAttribute("aria-current");
  });
  shell.querySelectorAll("[data-source-ids]").forEach((button) => {
    if (button.dataset.sourceIds.split(",").includes(sourceId)) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "location");
    }
  });
}

function updateActiveStructureNode(guide) {
  const sourceMap = guide._deepreadSourceMap;
  const nodes = guide._deepreadNodes || [];
  const readingLine = window.innerHeight * 0.52;
  let activeId = null;
  for (const node of nodes) {
    const element = sourceMap?.elementsById?.get(node.sourceIds[0]);
    if (!element?.isConnected) continue;
    if (!activeId || element.getBoundingClientRect().top <= readingLine) {
      activeId = node.sourceIds[0];
    }
  }
  if (activeId) setActiveStructureNode(guide, activeId);
}

function observeStructureSources(guide, sourceMap) {
  guide._deepreadStructureObserver?.disconnect();
  guide._deepreadStructureObserver = null;

  if (!sourceMap || typeof IntersectionObserver !== "function") {
    return;
  }

  const observer = new IntersectionObserver(() => updateActiveStructureNode(guide), {
    root: null,
    rootMargin: "-35% 0px -40% 0px",
    threshold: [0, 0.2, 0.6]
  });
  const observed = new Set();
  (guide._deepreadNodes || []).forEach((node) => {
    const element = sourceMap.elementsById.get(node.sourceIds[0]);
    if (element && !observed.has(element)) {
      observer.observe(element);
      observed.add(element);
    }
  });
  guide._deepreadStructureObserver = observer;
  updateActiveStructureNode(guide);
}

function positionMapNodes(guide) {
  const sourceMap = guide._deepreadSourceMap;
  const nodes = guide._deepreadNodes || [];
  if (!sourceMap?.root?.isConnected || nodes.length === 0) return;

  const rootRect = sourceMap.root.getBoundingClientRect();
  const rootTop = rootRect.top + window.scrollY;
  const rootHeight = Math.max(rootRect.height, sourceMap.root.scrollHeight, 1);
  const positions = nodes.map((node) => {
    const element = sourceMap.elementsById.get(node.sourceIds[0]);
    const top = element?.isConnected
      ? element.getBoundingClientRect().top + window.scrollY
      : rootTop;
    return Math.min(0.92, Math.max(0.08, (top - rootTop) / rootHeight));
  });
  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + 0.09);
  }
  const excess = Math.max(0, positions.at(-1) - 0.92);
  const shell = guide.closest(`#${SHELL_ID}`);
  positions.forEach((position, index) => {
    shell.querySelectorAll(`[data-map-index="${index}"]`).forEach((item) => {
      item.style.setProperty("--deepread-point-y", `${((position - excess) * 100).toFixed(1)}%`);
    });
  });

  const sourceRects = nodes
    .map((node) => sourceMap.elementsById.get(node.sourceIds[0]))
    .filter((element) => element?.isConnected)
    .map((element) => element.getBoundingClientRect());
  const rightEdges = sourceRects.map((rect) => rect.right).sort((left, right) => left - right);
  const leftEdges = sourceRects.map((rect) => rect.left).sort((left, right) => left - right);
  const middleRight = rightEdges[Math.floor(rightEdges.length / 2)] ?? window.innerWidth;
  const middleLeft = leftEdges[Math.floor(leftEdges.length / 2)] ?? 0;
  const rightMargin = window.innerWidth - middleRight;
  shell.style.setProperty(
    "--deepread-spine-right",
    `${rightMargin >= 105 ? Math.max(5, rightMargin - 58) : 5}px`
  );
  const atlasWidth = Math.min(268, Math.max(64, window.innerWidth - middleRight - 55));
  guide.style.width = `${atlasWidth}px`;
  shell.classList.toggle("deepread-shell--tight", atlasWidth < 166);
  const leftWidth = Math.min(220, Math.max(0, middleLeft - 48));
  const useBothMargins = atlasWidth >= 166 && leftWidth >= 166;
  const guideLeft = guide.getBoundingClientRect().left;
  const leftStart = Math.max(12, middleLeft - leftWidth - 24);
  guide.querySelectorAll(".deepread-structure-item").forEach((item, index) => {
    const onLeft = useBothMargins && index % 2 === 1;
    item.classList.toggle("is-left-lane", onLeft);
    if (onLeft) {
      item.style.left = `${leftStart - guideLeft + (index % 3) * 10}px`;
      item.style.right = "auto";
      item.style.width = `${leftWidth}px`;
    } else {
      item.style.removeProperty("left");
      item.style.removeProperty("right");
      item.style.removeProperty("width");
    }
  });
}

function scheduleMapLayout() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    const guide = document.getElementById(GUIDE_ID);
    if (guide) positionMapNodes(guide);
  });
}

function clearSourcePeek() {
  peekedSourceElement?.classList.remove("deepread-source-peek");
  peekedSourceElement = null;
  document.getElementById(XRAY_LABEL_ID)?.remove();
  const guide = document.getElementById(GUIDE_ID);
  if (guide) guide._deepreadPeek = null;
}

function positionSourcePeek() {
  const label = document.getElementById(XRAY_LABEL_ID);
  const guide = document.getElementById(GUIDE_ID);
  const peek = guide?._deepreadPeek;
  if (!label || !peek?.sourceElement?.isConnected) return;
  const rect = peek.sourceElement.getBoundingClientRect();
  const anchor = peek.button.getBoundingClientRect();
  const width = label.offsetWidth || 205;
  const height = label.offsetHeight || 72;
  const visible = rect.bottom > 0 && rect.top < window.innerHeight;
  label.classList.toggle("is-offscreen", !visible);
  const direction = label.querySelector(".deepread-xray-direction");
  direction.hidden = visible;
  direction.textContent = rect.bottom <= 0 ? "SOURCE ABOVE ↑" : "SOURCE BELOW ↓";
  let left = anchor.left - width - 10;
  let top = anchor.top - 12;
  label.classList.remove("is-linked-to-source", "is-left-of-source");
  const rightFits = window.innerWidth - rect.right >= width + 18;
  const atlasOverlapsRight = guide.closest(`#${SHELL_ID}`)?.classList.contains("deepread-shell--expanded") &&
    rect.right + width + 12 > guide.getBoundingClientRect().left - 8;
  if (visible && rightFits && !atlasOverlapsRight) {
    left = rect.right + 12;
    top = rect.top;
    label.classList.add("is-linked-to-source");
  } else if (visible && rect.left >= width + 18) {
    left = rect.left - width - 12;
    top = rect.top;
    label.classList.add("is-linked-to-source", "is-left-of-source");
  } else if (visible && rightFits) {
    left = rect.right + 12;
    top = rect.top;
    label.classList.add("is-linked-to-source");
  }
  label.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
  label.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
}

function showSourcePeek(guide, node, index, button) {
  clearSourcePeek();
  const source = getSourceById(guide._deepreadSourceMap, node.sourceIds[0]);
  const element = guide._deepreadSourceMap?.elementsById?.get(node.sourceIds[0]);
  if (!source || !element?.isConnected) return;

  element.classList.add("deepread-source-peek");
  peekedSourceElement = element;
  guide._deepreadPeek = { sourceElement: element, button };
  const sourceRect = element.getBoundingClientRect();
  const sourceIsVisible = sourceRect.bottom > 0 && sourceRect.top < window.innerHeight;
  const labelWidth = window.innerWidth <= 620 ? 132 : 205;
  const hasLabelMargin = sourceRect.left >= labelWidth + 18 ||
    window.innerWidth - sourceRect.right >= labelWidth + 18;
  if (sourceIsVisible &&
      (button.classList.contains("deepread-structure-button") ||
       button.classList.contains("deepread-smart-marker-button") ||
       button.classList.contains("deepread-trace-toggle") || !hasLabelMargin)) {
    return;
  }
  const label = document.createElement("aside");
  label.id = XRAY_LABEL_ID;
  label.className = "deepread-xray-label";
  label.setAttribute("role", "note");
  label.innerHTML = '<small class="deepread-xray-kind"></small><strong class="deepread-xray-title"></strong><small class="deepread-xray-direction" hidden></small><span class="deepread-xray-excerpt"></span>';
  label.querySelector(".deepread-xray-kind").textContent =
    `${String(index + 1).padStart(2, "0")} · ${node.isLiveSource ? "LIVE SOURCE" : node.kind.toUpperCase()}`;
  label.querySelector(".deepread-xray-title").textContent = node.label;
  const preview = getSourcePreview(guide._deepreadSourceMap, node.sourceIds[0]);
  label.querySelector(".deepread-xray-excerpt").textContent =
    `${preview.provenance.toLowerCase()}: ${shortenSourceText(preview.text, 108)}`;
  document.getElementById(SHELL_ID)?.append(label);
  positionSourcePeek();
}

function getSourceById(sourceMap, sourceId) {
  return (sourceMap?.sources || []).find((source) => source.id === sourceId) || null;
}

function getSourcePreview(sourceMap, sourceId) {
  const sources = sourceMap?.sources || [];
  const index = sources.findIndex((source) => source.id === sourceId);
  const source = sources[index];
  if (!source) return { text: "", provenance: "SOURCE PASSAGE" };
  if (isHeadingSource(source)) {
    for (const next of sources.slice(index + 1)) {
      if (isHeadingSource(next)) break;
      if (next.text.trim().length >= MIN_FALLBACK_PASSAGE_CHARS) {
        return { text: next.text, provenance: "FOLLOWING ORIGINAL TEXT" };
      }
    }
  }
  return { text: source.text, provenance: "CITED PASSAGE" };
}

function navigateToAtlasSource(guide, node, index) {
  const mapping = globalThis.DeepReadSourceMapping;
  const sourceMap = mapping?.getCurrentMap?.();
  const sourceId = node.sourceIds[0];
  const source = getSourceById(sourceMap, sourceId);
  const sourceElement = sourceMap?.elementsById?.get(sourceId);
  if (!source || !sourceElement?.isConnected) {
    showStructureError(guide, "The linked passage changed. Reopen the map to refresh its sources.");
    return;
  }

  clearSourcePeek();
  const shell = guide.closest(`#${SHELL_ID}`);
  if (shell) setGuideExpanded(shell, false, false);
  if (!mapping.scrollToSourceId(sourceId)) return;
  addReadingTrace({
    kind: "atlas",
    label: node.label,
    sourceId,
    sourceElement,
    marker: String(index + 1).padStart(2, "0"),
    sourceText: source.text
  });
}

function createMapPoint(guide, node, index, isSpine) {
  const item = document.createElement("li");
  item.className = isSpine ? "deepread-spine-item" : "deepread-structure-item";
  item.dataset.mapIndex = String(index);
  item.dataset.lane = String(index % 3);

  const button = document.createElement("button");
  button.className = isSpine ? "deepread-spine-point" : "deepread-structure-button";
  button.type = "button";
  button.dataset.sourceIds = node.sourceIds.join(",");
  button.setAttribute("aria-label", `${index + 1}. ${node.label}. Follow source passage`);
  if (isSpine) {
    button.textContent = String(index + 1);
  } else {
    const number = document.createElement("span");
    number.className = "deepread-structure-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "deepread-structure-copy";
    const kind = document.createElement("small");
    kind.className = "deepread-structure-meta";
    kind.textContent = node.isLiveSource ? "LIVE SOURCE" : node.kind.toUpperCase();
    const title = document.createElement("strong");
    title.className = "deepread-structure-label";
    title.textContent = node.label;
    copy.append(kind, title);
    button.append(number, copy);
  }
  button.addEventListener("mouseenter", () => showSourcePeek(guide, node, index, button));
  button.addEventListener("focus", () => showSourcePeek(guide, node, index, button));
  button.addEventListener("mouseleave", () => {
    if (guide._deepreadPeek?.button === button && document.activeElement !== button) clearSourcePeek();
  });
  button.addEventListener("blur", () => {
    if (guide._deepreadPeek?.button === button) clearSourcePeek();
  });
  button.addEventListener("click", () => navigateToAtlasSource(guide, node, index));
  item.append(button);
  return item;
}

function renderMapNodes(guide, nodes, sourceMap) {
  clearSourcePeek();
  const order = new Map((sourceMap?.sources || []).map((source, index) => [source.id, index]));
  const ordered = nodes.slice().sort((left, right) =>
    (order.get(left.sourceIds[0]) ?? Infinity) - (order.get(right.sourceIds[0]) ?? Infinity)
  );
  const spine = guide.closest(`#${SHELL_ID}`)?.querySelector(".deepread-spine-list");
  const list = guide.querySelector(".deepread-structure-list");
  guide._deepreadNodes = ordered;
  guide._deepreadSourceMap = sourceMap;
  guide.querySelector(".deepread-structure-error").hidden = true;
  guide.querySelector(".deepread-structure-empty").hidden = ordered.length > 0;
  spine.replaceChildren();
  list.replaceChildren();
  ordered.forEach((node, index) => {
    spine.append(createMapPoint(guide, node, index, true));
    list.append(createMapPoint(guide, node, index, false));
  });
  observeStructureSources(guide, sourceMap);
  scheduleMapLayout();
}

function showStructureError(guide, message) {
  const error = guide.querySelector(".deepread-structure-error");
  error.textContent = message;
  error.hidden = false;
}

function renderStructureLoading(guide) {
  guide.querySelector(".deepread-structure-note").textContent =
    "AI map loading · live source points remain usable";
}

function renderFallbackStructure(guide, sourceMap) {
  const structure = getStructureSources(sourceMap);
  const nodes = structure.sources.map((source) => ({
    label: structure.mode === "headings"
      ? shortenSourceText(source.text, 72)
      : shortenSourceText(source.text, 72) || "Source passage",
    kind: source.tag || "source",
    sourceIds: [source.id],
    isLiveSource: true
  }));
  renderMapNodes(guide, nodes, sourceMap);
  guide.querySelector(".deepread-structure-count").textContent = `${nodes.length} live points`;
  guide.querySelector(".deepread-structure-note").textContent =
    "Live page sources · open the map to request AI structure";
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
  renderMapNodes(guide, nodes, sourceMap);
  guide.querySelector(".deepread-structure-count").textContent = `${nodes.length} linked points`;
  guide.querySelector(".deepread-structure-note").textContent =
    "AI Page Map · points follow the order of their cited passages";
}

function buildSourceMapSafely() {
  try {
    clearSourcePeek();
    document.getElementById(EXPLANATION_CARD_ID)?.remove();
    activeExplanation = null;
    clearReadingTrail();
    clearSmartReading();
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

function getSmartReadingPayload(sourceMap) {
  const sources = (sourceMap?.sources || []).filter((source) =>
    source.text?.trim().length >= MIN_FALLBACK_PASSAGE_CHARS
  );
  const sampled = sources.length <= MAX_PAGE_MAP_SOURCE_BLOCKS
    ? sources
    : Array.from({ length: MAX_PAGE_MAP_SOURCE_BLOCKS }, (_, index) =>
      sources[Math.round(index * (sources.length - 1) / (MAX_PAGE_MAP_SOURCE_BLOCKS - 1))]
    );
  return {
    page: getPageContext(),
    sources: sampled.map((source) => ({
      id: source.id,
      tag: source.tag,
      text: source.text.slice(0, MAX_PAGE_MAP_SOURCE_CHARS)
    }))
  };
}

function setSmartStatus(message, transient = false) {
  const status = document.querySelector(".deepread-smart-status");
  if (!status) return;
  clearTimeout(smartStatusTimer);
  status.textContent = message;
  status.hidden = !message;
  if (message && transient) {
    smartStatusTimer = setTimeout(() => { status.hidden = true; }, 4800);
  }
}

function updateSmartAction() {
  const button = document.getElementById(SMART_ACTION_ID);
  if (!button) return;
  button.classList.toggle("is-active", smartReadingVisible && smartReadingItems.length > 0);
  button.setAttribute("aria-pressed", String(smartReadingVisible && smartReadingItems.length > 0));
  button.setAttribute("aria-label", smartReadingVisible && smartReadingItems.length > 0
    ? "Hide Smart Reading aids"
    : smartReadingLoaded && smartReadingItems.length > 0
      ? "Show Smart Reading aids"
      : "Find reading aids near original passages");
}

function clearSmartReading() {
  smartReadingRequestToken += 1;
  smartReadingItems.forEach((item) => item.element?.remove());
  smartReadingItems = [];
  smartReadingMap = null;
  smartReadingLoaded = false;
  smartReadingVisible = false;
  const button = document.getElementById(SMART_ACTION_ID);
  if (button) {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
  setSmartStatus("");
  updateSmartAction();
}

function renderSmartReadingMarkers() {
  const shell = document.getElementById(SHELL_ID);
  const guide = document.getElementById(GUIDE_ID);
  if (!shell || !guide) return;
  smartReadingItems.forEach((item, index) => {
    item.element?.remove();
    item.element = null;
    if (!smartReadingVisible || item.opened || !item.sourceElement?.isConnected) return;

    const marker = document.createElement("aside");
    marker.className = "deepread-smart-marker deepread-margin-item";
    marker.dataset.sourceId = item.sourceId;
    marker.dataset.kind = item.type;
    marker.innerHTML = `
      <button class="deepread-smart-marker-button" type="button">
        <span class="deepread-smart-marker-symbol" aria-hidden="true">✦</span>
        <span class="deepread-smart-marker-copy"><small></small><strong></strong></span>
      </button>
      <span class="deepread-smart-marker-hint"></span>
    `;
    const button = marker.querySelector("button");
    button.setAttribute("aria-label", `${item.type}: ${item.label}. ${item.hint}. Open reading aid`);
    marker.querySelector("small").textContent = item.type.toUpperCase();
    marker.querySelector("strong").textContent = item.label;
    marker.querySelector(".deepread-smart-marker-hint").textContent = item.hint;
    const peek = () => showSourcePeek(guide, {
      label: item.label,
      kind: item.type,
      sourceIds: [item.sourceId]
    }, index, button);
    button.addEventListener("mouseenter", peek);
    button.addEventListener("focus", peek);
    button.addEventListener("mouseleave", () => {
      if (guide._deepreadPeek?.button === button && document.activeElement !== button) clearSourcePeek();
    });
    button.addEventListener("blur", () => {
      if (guide._deepreadPeek?.button === button) clearSourcePeek();
    });
    button.addEventListener("click", () => {
      if (!item.sourceElement.isConnected) return;
      clearSourcePeek();
      item.opened = true;
      marker.remove();
      item.element = null;
      globalThis.DeepReadSourceMapping?.scrollToSourceId?.(item.sourceId);
      addReadingTrace({
        kind: "smart",
        label: item.label,
        type: item.type,
        hint: item.hint,
        sourceId: item.sourceId,
        sourceElement: item.sourceElement,
        marker: String(index + 1).padStart(2, "0"),
        open: true
      });
    });
    shell.append(marker);
    item.element = marker;
  });
  scheduleMarginLayout();
}

async function requestSmartReading() {
  const guide = document.getElementById(GUIDE_ID);
  const button = document.getElementById(SMART_ACTION_ID);
  if (!guide || !button || button.disabled) return;
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const needsFreshMap = sourceMapNeedsRefresh || !currentMap?.root?.isConnected;
  const sourceMap = needsFreshMap ? buildSourceMapSafely() : currentMap;
  if (needsFreshMap) renderFallbackStructure(guide, sourceMap);
  if (!sourceMap) {
    setSmartStatus("No readable page source was found.");
    return;
  }
  if (smartReadingLoaded && smartReadingMap === sourceMap) {
    smartReadingVisible = !smartReadingVisible;
    renderSmartReadingMarkers();
    updateSmartAction();
    setSmartStatus(smartReadingItems.length
      ? `${smartReadingVisible ? "Showing" : "Hiding"} ${smartReadingItems.length} reading aids.`
      : "No extra reading aids were found on this page.", true);
    return;
  }

  const requestId = ++smartReadingRequestToken;
  button.disabled = true;
  button.classList.add("is-loading");
  setSmartStatus("Finding useful reading aids…");
  try {
    const response = await sendDeepReadMessage({
      type: "DEEPREAD_SMART_READING",
      payload: getSmartReadingPayload(sourceMap)
    });
    if (requestId !== smartReadingRequestToken || !button.isConnected) return;
    if (!response?.ok) {
      setSmartStatus(response?.message || "Smart Reading is unavailable.");
      return;
    }
    const validIds = new Set((sourceMap.sources || []).map((source) => source.id));
    const items = Array.isArray(response.smartReading?.items) ? response.smartReading.items : [];
    smartReadingItems = items
      .filter((item) => validIds.has(item.sourceId) &&
        typeof item.label === "string" && typeof item.hint === "string" &&
        ["concept", "term", "background", "context"].includes(item.type))
      .slice(0, 5)
      .map((item) => ({
        ...item,
        sourceElement: sourceMap.elementsById.get(item.sourceId),
        opened: false,
        element: null
      }));
    smartReadingMap = sourceMap;
    smartReadingLoaded = true;
    smartReadingVisible = smartReadingItems.length > 0;
    renderSmartReadingMarkers();
    updateSmartAction();
    setSmartStatus(smartReadingItems.length
      ? `${smartReadingItems.length} source-linked reading aids.`
      : "No extra reading aids were found on this page.", true);
  } catch (error) {
    if (requestId === smartReadingRequestToken) {
      setSmartStatus("Smart Reading could not reach Gemini. Try again.");
      console.warn("DeepRead Smart Reading request failed.", error);
    }
  } finally {
    if (requestId === smartReadingRequestToken) {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  }
}

async function refreshGuide(guide) {
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const needsFreshMap = sourceMapNeedsRefresh || !currentMap?.root?.isConnected;
  const sourceMap = needsFreshMap ? buildSourceMapSafely() : currentMap;
  if (needsFreshMap) {
    guide._deepreadPageMapCache = null;
    guide._deepreadPendingMap = null;
    guide._deepreadMapRequestId = (guide._deepreadMapRequestId || 0) + 1;
    renderFallbackStructure(guide, sourceMap);
  }
  if (guide._deepreadPageMapCache?.sourceMap === sourceMap) {
    return;
  }
  if (guide._deepreadPendingMap?.sourceMap === sourceMap) return;
  if (!guide._deepreadNodes) renderFallbackStructure(guide, sourceMap);

  const sourceCount = sourceMap?.sources?.length || 0;
  const totalText = (sourceMap?.sources || []).reduce(
    (total, source) => total + source.text.length,
    0
  );
  if (sourceCount < 2 || totalText < 240) {
    showStructureError(guide, "This page does not contain enough coherent text for an AI Page Map.");
    return;
  }

  renderStructureLoading(guide);
  const requestId = (guide._deepreadMapRequestId || 0) + 1;
  guide._deepreadMapRequestId = requestId;
  const pending = { sourceMap };
  guide._deepreadPendingMap = pending;
  try {
    const response = await sendDeepReadMessage({
      type: "DEEPREAD_GENERATE_PAGE_MAP",
      payload: getPageMapPayload(sourceMap)
    });
    if (!guide.isConnected || guide._deepreadMapRequestId !== requestId) {
      return;
    }

    if (!response?.ok) {
      guide.querySelector(".deepread-structure-note").textContent = "Live page sources";
      showStructureError(guide, response?.message || "AI Page Map unavailable. Live sources remain usable.");
      return;
    }

    const nodes = validatePageMap(response.pageMap, sourceMap);
    if (nodes.length === 0) {
      guide.querySelector(".deepread-structure-note").textContent = "Live page sources";
      showStructureError(guide, "AI returned no valid source links. Live sources remain usable.");
      return;
    }

    guide._deepreadPageMapCache = { sourceMap, nodes };
    renderAiPageMap(guide, nodes, sourceMap);
  } catch (error) {
    if (guide.isConnected && guide._deepreadMapRequestId === requestId) {
      guide.querySelector(".deepread-structure-note").textContent = "Live page sources";
      showStructureError(guide, "AI Page Map could not be reached. Live sources remain usable.");
    }
  } finally {
    if (guide._deepreadPendingMap === pending) guide._deepreadPendingMap = null;
  }
}

function setGuideExpanded(shell, expanded, restoreFocus = true) {
  const rail = shell.querySelector(`#${RAIL_ID}`);
  const guide = shell.querySelector(`#${GUIDE_ID}`);
  shell.classList.toggle("deepread-shell--expanded", expanded);
  shell.classList.toggle("deepread-shell--atlas-open", expanded);
  rail.setAttribute("aria-expanded", String(expanded));
  rail.setAttribute("aria-label", expanded ? "Close Reading Atlas" : "Open Reading Atlas");
  guide.setAttribute("aria-hidden", String(!expanded));
  guide.inert = !expanded;

  if (expanded) {
    void refreshGuide(guide);
  } else {
    clearSourcePeek();
    if (restoreFocus && guide.contains(document.activeElement)) rail.focus();
  }
}

function createDeepReadShell() {
  if (document.getElementById(SHELL_ID)) {
    return document.getElementById(SHELL_ID);
  }

  const shell = document.createElement("div");
  shell.id = SHELL_ID;
  shell.className = "deepread-shell";

  const spine = document.createElement("nav");
  spine.className = "deepread-spine";
  spine.setAttribute("aria-label", "DeepRead reading spine");
  const rail = document.createElement("button");
  rail.id = RAIL_ID;
  rail.className = "deepread-rail-toggle";
  rail.type = "button";
  rail.setAttribute("aria-expanded", "false");
  rail.setAttribute("aria-controls", GUIDE_ID);
  rail.setAttribute("aria-label", "Open Reading Atlas");
  rail.innerHTML = '<span class="deepread-rail-mark" aria-hidden="true">D</span><span class="deepread-rail-arrow" aria-hidden="true">+</span>';
  const smartAction = document.createElement("button");
  smartAction.id = SMART_ACTION_ID;
  smartAction.className = "deepread-smart-action";
  smartAction.type = "button";
  smartAction.title = "Find reading aids";
  smartAction.setAttribute("aria-label", "Find reading aids near original passages");
  smartAction.setAttribute("aria-pressed", "false");
  smartAction.innerHTML = '<span aria-hidden="true">✦</span>';
  const smartStatus = document.createElement("span");
  smartStatus.className = "deepread-smart-status";
  smartStatus.setAttribute("role", "status");
  smartStatus.setAttribute("aria-live", "polite");
  smartStatus.hidden = true;
  const spineList = document.createElement("ol");
  spineList.className = "deepread-spine-list";
  spineList.setAttribute("aria-label", "Source positions");
  spine.append(rail, smartAction, smartStatus, spineList);

  const guide = document.createElement("aside");
  guide.id = GUIDE_ID;
  guide.setAttribute("role", "group");
  guide.setAttribute("aria-label", "Reading Atlas source points");
  guide.setAttribute("aria-hidden", "true");
  guide.inert = true;
  guide.innerHTML = `
    <div class="deepread-atlas-heading">
      <span id="deepread-structure-title">READING ATLAS</span>
      <button class="deepread-close" type="button" aria-label="Collapse Reading Atlas">×</button>
    </div>
    <small class="deepread-structure-count"></small>
    <ol class="deepread-structure-list" aria-label="Source-linked page map"></ol>
    <p class="deepread-structure-note" aria-live="polite"></p>
    <p class="deepread-structure-error" role="status" hidden></p>
    <p class="deepread-structure-empty" hidden>No readable source points on this page.</p>
  `;

  rail.addEventListener("click", () => {
    setGuideExpanded(shell, !shell.classList.contains("deepread-shell--expanded"));
  });
  smartAction.addEventListener("click", () => void requestSmartReading());
  guide.querySelector(".deepread-close").addEventListener("click", () => {
    setGuideExpanded(shell, false);
  });

  shell.append(spine, guide);
  document.documentElement.appendChild(shell);
  return shell;
}

function ensureDeepReadShell() {
  return createDeepReadShell();
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

function positionExplanationCard(card, context) {
  const sourceElement = context.sourceId &&
    globalThis.DeepReadSourceMapping?.getCurrentMap?.()?.elementsById?.get(context.sourceId);
  const sourceRect = sourceElement?.isConnected ? sourceElement.getBoundingClientRect() : null;
  if (!sourceRect) {
    positionFloatingElement(card, context.rect);
    return;
  }
  card.style.visibility = "hidden";
  requestAnimationFrame(() => {
    if (!card.isConnected) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const rightSpace = window.innerWidth - sourceRect.right;
    const leftSpace = sourceRect.left;
    if (rightSpace < width + 12 && leftSpace < width + 12) {
      positionFloatingElement(card, context.rect);
      return;
    }
    const left = rightSpace >= width + 12
      ? sourceRect.right + 8
      : sourceRect.left - width - 8;
    const top = Math.max(8, Math.min(context.rect.top, window.innerHeight - height - 8));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.visibility = "visible";
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
  const saved = activeExplanation;
  activeExplanation = null;
  if (!saved?.context?.sourceId) return;
  const sourceElement = globalThis.DeepReadSourceMapping?.getCurrentMap?.()
    ?.elementsById?.get(saved.context.sourceId);
  if (!sourceElement?.isConnected) return;
  addReadingTrace({
    kind: "explained",
    label: shortenSourceText(saved.context.text, 34),
    sourceId: saved.context.sourceId,
    sourceElement,
    marker: "E",
    explanation: saved.explanation,
    selectedText: saved.context.text
  });
}

function clearReadingTrail() {
  if (marginLayoutFrame) {
    cancelAnimationFrame(marginLayoutFrame);
    marginLayoutFrame = 0;
  }
  readingTrail.forEach((trace) => trace.element?.remove());
  readingTrail = [];
}

function removeReadingTrace(id) {
  const index = readingTrail.findIndex((trace) => trace.id === id);
  if (index < 0) return;
  readingTrail[index].element?.remove();
  readingTrail.splice(index, 1);
  scheduleMarginLayout();
}

function positionMarginItems() {
  const entries = [
    ...readingTrail.map((trace) => ({ element: trace.element, sourceElement: trace.sourceElement })),
    ...smartReadingItems.filter((item) => item.element).map((item) => ({
      element: item.element,
      sourceElement: item.sourceElement
    }))
  ];
  const groups = { left: [], right: [], compact: [] };
  entries.forEach(({ element, sourceElement }) => {
    if (!element || !sourceElement?.isConnected) return;
    const rect = sourceElement.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight;
    element.hidden = !visible;
    if (!visible) return;

    element.classList.remove("is-left", "is-compact");
    element.style.maxWidth = "210px";
    const gap = 10;
    const rightSpace = window.innerWidth - rect.right;
    const leftSpace = rect.left;
    let side = "right";
    let left;
    if (rightSpace >= 160) {
      element.style.maxWidth = `${Math.min(210, rightSpace - gap - 8)}px`;
      left = rect.right + gap;
    } else if (leftSpace >= 160) {
      side = "left";
      element.classList.add("is-left");
      element.style.maxWidth = `${Math.min(210, leftSpace - gap - 8)}px`;
      left = rect.left - element.offsetWidth - gap;
    } else {
      side = "compact";
      element.classList.add("is-compact");
      element.style.maxWidth = "30px";
      left = Math.min(Math.max(6, rect.right - 18), window.innerWidth - 36);
    }
    element.style.setProperty("--deepread-margin-width", side === "compact" ? "210px" : element.style.maxWidth);
    element.style.left = `${Math.max(6, Math.min(left, window.innerWidth - element.offsetWidth - 6))}px`;
    groups[side].push({
      element,
      desiredTop: Math.max(8, Math.min(rect.top + 3, window.innerHeight - 42)),
      height: element.offsetHeight || 26
    });
  });

  Object.values(groups).forEach((group) => {
    group.sort((left, right) => left.desiredTop - right.desiredTop);
    let cursor = 8;
    group.forEach((entry) => {
      entry.top = Math.max(entry.desiredTop, cursor);
      cursor = entry.top + entry.height + 5;
    });
    const overflow = Math.max(0, cursor - 5 - (window.innerHeight - 8));
    group.forEach((entry) => {
      const top = Math.max(8, entry.top - overflow);
      entry.element.style.top = `${top}px`;
      entry.element.classList.toggle("is-above", top > window.innerHeight - 150);
    });
  });
}

function scheduleMarginLayout() {
  if (marginLayoutFrame || (!readingTrail.length && !smartReadingItems.length)) return;
  marginLayoutFrame = requestAnimationFrame(() => {
    marginLayoutFrame = 0;
    positionMarginItems();
  });
}

function addReadingTrace({ kind, label, sourceId, sourceElement, marker, sourceText, type, hint, explanation, selectedText, open = false }) {
  const shell = document.getElementById(SHELL_ID);
  const sourceMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  if (!shell || !sourceElement?.isConnected || sourceMap?.elementsById?.get(sourceId) !== sourceElement) return;
  const existing = readingTrail.find((trace) =>
    trace.kind === kind && trace.sourceId === sourceId &&
    (kind !== "explained" || trace.selectedText === selectedText)
  );
  if (existing) removeReadingTrace(existing.id);
  while (readingTrail.length >= MAX_READING_TRAIL) removeReadingTrace(readingTrail[0].id);

  const trace = {
    id: ++readingTrailSequence,
    kind, label, sourceId, sourceElement, marker: marker || "E",
    sourceText, type, hint, explanation, selectedText,
    element: null
  };
  const note = document.createElement("aside");
  note.className = "deepread-source-annotation deepread-margin-item";
  note.dataset.sourceId = sourceId;
  note.dataset.kind = kind;
  note.setAttribute("role", "note");
  note.setAttribute("aria-label", `${kind} reading trace for ${label}`);
  note.innerHTML = `
    <button class="deepread-trace-toggle" type="button" aria-expanded="false">
      <span class="deepread-trace-number"></span><span class="deepread-trace-title"></span>
    </button>
    <div class="deepread-trace-detail">
      <div class="deepread-trace-heading"><span></span><button class="deepread-trace-close" type="button" aria-label="Dismiss reading trace">×</button></div>
      <p class="deepread-trace-preview"></p>
      <div class="deepread-trace-full" hidden></div>
    </div>
  `;
  note.querySelector(".deepread-trace-number").textContent = trace.marker;
  note.querySelector(".deepread-trace-title").textContent = label;
  const heading = note.querySelector(".deepread-trace-heading span");
  const preview = note.querySelector(".deepread-trace-preview");
  const full = note.querySelector(".deepread-trace-full");
  const addParagraph = (text, className = "") => {
    const paragraph = document.createElement("p");
    if (className) paragraph.className = className;
    paragraph.textContent = text;
    full.append(paragraph);
  };
  if (kind === "smart") {
    heading.textContent = `${type || "CONTEXT"} · READING AID`.toUpperCase();
    preview.textContent = shortenSourceText(hint, 130);
    addParagraph(hint, "deepread-trace-main");
    const cited = getSourcePreview(sourceMap, sourceId);
    addParagraph(`${cited.provenance}: ${shortenSourceText(cited.text, 180)}`, "deepread-trace-context");
  } else if (kind === "explained") {
    heading.textContent = "EXPLAINED · SAVED THIS PAGE";
    preview.textContent = shortenSourceText(explanation.plainLanguage, 130);
    addParagraph(explanation.plainLanguage, "deepread-trace-main");
    addParagraph(`In this article: ${explanation.context}`, "deepread-trace-context");
    if (explanation.analogy.trim()) addParagraph(`Analogy: ${explanation.analogy}`, "deepread-trace-analogy");
  } else {
    const cited = getSourcePreview(sourceMap, sourceId);
    heading.textContent = cited.provenance;
    preview.textContent = shortenSourceText(cited.text || sourceText, 116);
    addParagraph(shortenSourceText(cited.text || sourceText, 280), "deepread-trace-context");
  }

  const toggle = note.querySelector(".deepread-trace-toggle");
  toggle.setAttribute("aria-label", `Expand ${label} reading trace`);
  const setOpen = (expanded) => {
    note.classList.toggle("is-open", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${label} reading trace`);
    preview.hidden = expanded;
    full.hidden = !expanded;
  };
  toggle.addEventListener("click", () => setOpen(!note.classList.contains("is-open")));
  const guide = document.getElementById(GUIDE_ID);
  const peek = () => showSourcePeek(guide, {
    label, kind: type || kind, sourceIds: [sourceId]
  }, 0, toggle);
  toggle.addEventListener("mouseenter", peek);
  toggle.addEventListener("focus", peek);
  toggle.addEventListener("mouseleave", () => {
    if (guide?._deepreadPeek?.button === toggle && document.activeElement !== toggle) clearSourcePeek();
  });
  toggle.addEventListener("blur", () => {
    if (guide?._deepreadPeek?.button === toggle) clearSourcePeek();
  });
  note.querySelector(".deepread-trace-close").addEventListener("click", () => removeReadingTrace(trace.id));
  shell.append(note);
  trace.element = note;
  readingTrail.push(trace);
  setOpen(open);
  scheduleMarginLayout();
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
      <span>DEEPREAD / EXPLAIN</span>
      <button class="deepread-explanation-close" type="button" aria-label="Dismiss explanation">×</button>
    </header>
    <section class="deepread-explanation-body">
      <p class="deepread-explanation-plain"></p>
      <div class="deepread-explanation-context"><small>IN THIS ARTICLE</small><p></p></div>
      <p class="deepread-explanation-analogy" hidden></p>
    </section>
    <footer></footer>
  `;
  card.querySelector(".deepread-explanation-plain").textContent = explanation.plainLanguage.trim();
  card.querySelector(".deepread-explanation-context p").textContent = explanation.context.trim();
  if (explanation.analogy.trim()) {
    const analogy = card.querySelector(".deepread-explanation-analogy");
    analogy.hidden = false;
    analogy.textContent = `Analogy: ${explanation.analogy.trim()}`;
  }
  card.querySelector("footer").textContent = context.sourceId
    ? "Close or continue reading to leave a small trace here"
    : "AI explanation · source remains on the original page";
  card.dataset.sourceId = context.sourceId || "";
  card.querySelector(".deepread-explanation-close").addEventListener("click", () => removeExplanationCard());
  document.documentElement.appendChild(card);
  activeExplanation = { explanation, context };
  positionExplanationCard(card, context);
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
    const sourceMap = buildSourceMapSafely();
    const guide = document.getElementById(GUIDE_ID);
    if (guide) {
      guide._deepreadPageMapCache = null;
      guide._deepreadPendingMap = null;
      guide._deepreadMapRequestId = (guide._deepreadMapRequestId || 0) + 1;
      renderFallbackStructure(guide, sourceMap);
    }
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
  const shell = document.getElementById(SHELL_ID);
  if (shell?.classList.contains("deepread-shell--expanded") && !event.target.closest?.(`#${SHELL_ID}`)) {
    setGuideExpanded(shell, false, false);
  }
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
  clearTimeout(dynamicRefreshTimer);
  dynamicRefreshTimer = setTimeout(() => {
    const guide = document.getElementById(GUIDE_ID);
    const shell = document.getElementById(SHELL_ID);
    if (!guide || !shell) return;
    if (shell.classList.contains("deepread-shell--expanded")) {
      void refreshGuide(guide);
      return;
    }
    const sourceMap = buildSourceMapSafely();
    guide._deepreadPageMapCache = null;
    guide._deepreadPendingMap = null;
    guide._deepreadMapRequestId = (guide._deepreadMapRequestId || 0) + 1;
    renderFallbackStructure(guide, sourceMap);
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
    const mappedRoot = globalThis.DeepReadSourceMapping?.getCurrentMap?.()?.root;
    const hasExternalChange = mutations.some((mutation) =>
      !isDeepReadNode(mutation.target) && (
        !mappedRoot?.isConnected ||
        (mappedRoot.contains(mutation.target) && (
          mutation.type === "characterData" ||
          [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !isDeepReadNode(node))
        )) ||
        [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node === mappedRoot || node.contains?.(mappedRoot)
        )
      )
    );
    if (hasExternalChange) {
      scheduleGuideRefresh();
      scheduleMarginLayout();
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
  const sourceMap = buildSourceMapSafely();
  const shell = ensureDeepReadShell();
  renderFallbackStructure(shell.querySelector(`#${GUIDE_ID}`), sourceMap);
  startDynamicRefresh();
}

document.addEventListener("selectionchange", handleSelectionChange);
document.addEventListener("mousedown", handleDocumentPointerDown, true);
document.addEventListener("keydown", (event) => {
  const shell = document.getElementById(SHELL_ID);
  const atlasIsOpen = shell?.classList.contains("deepread-shell--expanded");

  if (event.key === "Escape") {
    dismissedSelectionText = window.getSelection()?.toString().trim() || "";
    dismissSelectionAction();
    removeExplanationCard();
    readingTrail.forEach((trace) => {
      const note = trace.element;
      if (!note?.classList.contains("is-open")) return;
      note.classList.remove("is-open");
      note.querySelector(".deepread-trace-toggle")?.setAttribute("aria-expanded", "false");
      note.querySelector(".deepread-trace-preview").hidden = false;
      note.querySelector(".deepread-trace-full").hidden = true;
    });
    if (atlasIsOpen) {
      setGuideExpanded(shell, false);
    }
    return;
  }
});
window.addEventListener("scroll", () => {
  dismissSelectionAction();
  removeExplanationCard();
  scheduleMarginLayout();
  positionSourcePeek();
  const guide = document.getElementById(GUIDE_ID);
  if (guide) updateActiveStructureNode(guide);
}, { passive: true });
window.addEventListener("resize", () => {
  scheduleMapLayout();
  scheduleMarginLayout();
  positionSourcePeek();
}, { passive: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_DEEPREAD_GUIDE") {
    toggleGuide();
    sendResponse({ ok: true, context: getPageContext() });
  }
});

initializeDeepRead();
