// DeepRead content script.
// The webpage stays readable beneath a small source-linked reading layer.

const GUIDE_ID = "deepread-guide";
const SHELL_ID = "deepread-shell";
const RAIL_ID = "deepread-rail-toggle";
const SMART_ACTION_ID = "deepread-smart-action";
const SMART_OVERVIEW_ID = "deepread-smart-overview";
const CRITICAL_ACTION_ID = "deepread-critical-action";
const CRITICAL_OVERVIEW_ID = "deepread-critical-overview";
const LENS_ACTION_ID = "deepread-lens-action";
const LENS_PANEL_ID = "deepread-lens-panel";
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
let smartReadingLoading = false;
let criticalItems = [];
let criticalMap = null;
let criticalLoaded = false;
let criticalVisible = false;
let criticalLoading = false;
let criticalRequestToken = 0;
let criticalStatusTimer = null;
let visitedSourceIds = new Set();
let activeExplanation = null;
let peekedSourceElement = null;
let layoutFrame = 0;
let activeLensMode = null;

// One visible Lens mode; each backend keeps its existing map/result cache.
function updateLensUI() {
  const shell = document.getElementById(SHELL_ID);
  const action = document.getElementById(LENS_ACTION_ID);
  if (!shell || !action) return;
  const context = activeLensMode === "context";
  const loaded = context ? smartReadingLoaded : activeLensMode === "critical" && criticalLoaded;
  const loading = context ? smartReadingLoading : activeLensMode === "critical" && criticalLoading;
  const count = context ? smartReadingItems.length : criticalItems.length;
  shell.dataset.lensMode = activeLensMode || "none";
  const name = context ? "Context Lens" : "Critical Lens";
  action.querySelector(".deepread-lens-symbol").textContent = activeLensMode ? (context ? "✦" : "◇") : "◐";
  action.querySelector(".deepread-lens-label").textContent = activeLensMode ? name : "Lens";
  const badge = action.querySelector(".deepread-lens-count");
  badge.hidden = !loaded;
  badge.textContent = loaded ? String(count) : "";
  action.setAttribute("aria-busy", String(Boolean(loading)));
  action.setAttribute("aria-label", activeLensMode
    ? `${name}${loading ? ", analysing" : loaded ? `, ${count} findings` : ""}. Open Lens choices`
    : "Open Lens choices. Context for understanding, Critical for examination");
  action.title = activeLensMode ? name : "Lens";
  [SMART_ACTION_ID, CRITICAL_ACTION_ID].forEach((id, index) => {
    const button = document.getElementById(id);
    const selected = activeLensMode === (index === 0 ? "context" : "critical");
    button?.setAttribute("aria-selected", String(selected));
    if (button) button.tabIndex = selected || (!activeLensMode && index === 0) ? 0 : -1;
  });
  const intro = document.querySelector(".deepread-lens-intro");
  if (intro) intro.hidden = Boolean(loaded || loading);
}

function setLensPanelOpen(open, restoreFocus = true) {
  const panel = document.getElementById(LENS_PANEL_ID);
  const action = document.getElementById(LENS_ACTION_ID);
  if (!panel || !action) return;
  const hadFocus = panel.contains(document.activeElement);
  if (open) focusReadingSurface("lens");
  panel.hidden = !open;
  action.setAttribute("aria-expanded", String(open));
  if (!open) {
    const shell = document.getElementById(SHELL_ID);
    if (shell?.dataset.detail === "lens") shell.dataset.detail = "none";
    clearSourcePeek();
    if (restoreFocus && hadFocus) action.focus({ preventScroll: true });
  } else {
    const context = activeLensMode === "context";
    document.getElementById(SMART_OVERVIEW_ID).hidden = !(context && smartReadingLoaded);
    document.getElementById(CRITICAL_OVERVIEW_ID).hidden = !(activeLensMode === "critical" && criticalLoaded);
    positionLensPanel();
  }
  updateLensUI();
}

function positionLensPanel() {
  const panel = document.getElementById(LENS_PANEL_ID);
  const action = document.getElementById(LENS_ACTION_ID);
  if (!panel || panel.hidden || !action) return;
  const anchor = action.getBoundingClientRect();
  const width = Math.min(272, window.innerWidth - 24);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.max(12, anchor.left - width - 12)}px`;
  panel.style.top = `${Math.max(12, Math.min(anchor.top, window.innerHeight - panel.offsetHeight - 12))}px`;
}

function focusReadingSurface(kind) {
  const shell = document.getElementById(SHELL_ID);
  if (kind !== "lens") setLensPanelOpen(false);
  if (kind !== "atlas" && shell?.classList.contains("deepread-shell--expanded")) setGuideExpanded(shell, false, false);
  if (kind !== "trace") collapseOpenReadingTraces();
  const focusPanel = shell?.querySelector("#deepread-focus-panel");
  if (focusPanel && kind !== "focus") focusPanel.hidden = true;
  if (kind !== "explain") removeExplanationCard();
  if (shell) shell.dataset.detail = kind;
  clearSourcePeek();
}

function activateLensMode(mode) {
  activeLensMode = mode;
  smartReadingVisible = mode === "context" && smartReadingLoaded;
  criticalVisible = mode === "critical" && criticalLoaded;
  setSmartOverviewOpen(false);
  setCriticalOverviewOpen(false);
  renderSmartReadingMarkers();
  renderSmartSpinePoints();
  renderCriticalMarkers();
  renderCriticalSpinePoints();
  updateSmartAction();
  updateCriticalAction();
  setLensPanelOpen(true);
  if (mode === "context") void requestSmartReading();
  else void requestCriticalReading();
}

function turnOffLens() {
  activeLensMode = null;
  smartReadingVisible = false;
  criticalVisible = false;
  renderSmartReadingMarkers();
  renderSmartSpinePoints();
  renderCriticalMarkers();
  renderCriticalSpinePoints();
  updateSmartAction();
  updateCriticalAction();
  setLensPanelOpen(false);
  updateLensUI();
}

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
  const sources = sourceMap?.sources || [];
  const headings = sources.filter(isHeadingSource);
  if (headings.length >= 2) return { mode: "headings", sources: headings };
  return { mode: "passages", sources: sources.filter(source =>
    !isHeadingSource(source) && source.text.length >= MIN_FALLBACK_PASSAGE_CHARS).slice(0, 6) };
}

function localOutline(sourceMap) {
  const structure = getStructureSources(sourceMap);
  const stack = [];
  return structure.sources.map(source => {
    const level = getSourceLevel(source);
    while (stack.length && stack.at(-1) >= level) stack.pop();
    const depth = structure.mode === "headings" ? stack.length : 0;
    if (level) stack.push(level);
    return { label: shortenSourceText(source.text, 120), kind: level ? `H${level}` : "PASSAGE",
      level, depth, sourceIds: [source.id], isLiveSource: true };
  });
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

function markSourceVisited(sourceId) {
  if (!sourceId) return;
  visitedSourceIds.add(sourceId);
  document.querySelectorAll(`#${SHELL_ID} .deepread-spine-point, #${SHELL_ID} .deepread-smart-spine-point, #${SHELL_ID} .deepread-critical-spine-point`).forEach((button) => {
    button.classList.toggle("is-visited", button.dataset.sourceIds?.split(",").includes(sourceId) ||
      button.classList.contains("is-visited"));
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
  const nearbySmart = smartReadingVisible
    ? smartReadingItems
        .map((item, index) => ({ index, rect: item.sourceElement?.getBoundingClientRect() }))
        .filter(({ rect }) => rect && rect.bottom > 0 && rect.top < window.innerHeight)
        .sort((left, right) =>
          Math.abs(left.rect.top - readingLine) - Math.abs(right.rect.top - readingLine)
        )[0]?.index
    : undefined;
  smartReadingItems.forEach((item, index) => {
    item.spineElement?.querySelector("button")?.classList.toggle("is-reading", index === nearbySmart);
  });
  const nearbyCritical = criticalVisible
    ? criticalItems.map((item, index) => ({ index, rect: item.sourceElement?.getBoundingClientRect() }))
      .filter(({ rect }) => rect && rect.bottom > 0 && rect.top < window.innerHeight)
      .sort((left, right) => Math.abs(left.rect.top - readingLine) - Math.abs(right.rect.top - readingLine))[0]?.index
    : undefined;
  criticalItems.forEach((item, index) => {
    item.spineElement?.querySelector("button")?.classList.toggle("is-reading", index === nearbyCritical);
  });
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

function positionLensSpinePoints(sourceMap, rootTop, rootHeight) {
  const guide = document.getElementById(GUIDE_ID);
  const normal = (guide?._deepreadNodes || []).map((node, index) => ({
    sourceElement: sourceMap.elementsById.get(node.sourceIds[0]),
    spineElement: document.querySelector(`.deepread-spine-list [data-map-index="${index}"]`),
    isNormal: true
  }));
  const points = [
    ...normal,
    ...(smartReadingVisible && smartReadingMap === sourceMap ? smartReadingItems : []),
    ...(criticalVisible && criticalMap === sourceMap ? criticalItems : [])
  ].filter((item) => item.spineElement && item.sourceElement?.isConnected)
    .map((item) => ({
      item,
      position: Math.min(0.94, Math.max(0.06,
        (item.sourceElement.getBoundingClientRect().top + window.scrollY - rootTop) / rootHeight))
    }))
    .sort((left, right) => left.position - right.position);
  const spineHeight = document.querySelector(".deepread-spine")?.getBoundingClientRect().height || 400;
  const gap = Math.min(24 / spineHeight, 0.88 / Math.max(1, points.length - 1));
  const size = Math.min(20, Math.max(12, gap * spineHeight - 2));
  document.getElementById(SHELL_ID)?.style.setProperty("--deepread-point-size", `${size.toFixed(1)}px`);
  points.forEach((point, index) => {
    if (index) point.position = Math.max(point.position, points[index - 1].position + gap);
  });
  const excess = Math.max(0, (points.at(-1)?.position || 0) - 0.94);
  points.forEach(({ item, position }) => {
    item.spineElement.style.setProperty(item.isNormal ? "--deepread-point-y" : "--deepread-lens-y", `${((position - excess) * 100).toFixed(1)}%`);
  });
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
  const middleRight = rightEdges[Math.floor(rightEdges.length / 2)] ?? window.innerWidth;
  const rail = shell.querySelector(".deepread-spine").getBoundingClientRect();
  // The rail belongs to the viewport. Article geometry only sizes its inward zone.
  const atlasWidth = Math.min(264, Math.max(30, rail.left - middleRight - 30));
  guide.style.width = `${atlasWidth}px`;
  shell.classList.toggle("deepread-shell--tight", atlasWidth < 154);
  positionLensSpinePoints(sourceMap, rootTop, rootHeight);
  positionLensPanel();
  scheduleMarginLayout();
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
  const zone = getAnnotationZone(rect, width);
  const rightFits = zone.width >= width;
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
  const visibleTraceAtSource = readingTrail.some((trace) =>
    trace.sourceId === node.sourceIds[0] && trace.element?.isConnected && !trace.element.hidden);
  const isLensSpine = button.matches(".deepread-smart-spine-point, .deepread-critical-spine-point, .deepread-source-tick-button");
  if (sourceIsVisible &&
      (button.classList.contains("deepread-structure-button") ||
       button.classList.contains("deepread-smart-marker-button") ||
       button.classList.contains("deepread-critical-marker-button") ||
       button.classList.contains("deepread-trace-toggle") ||
       (!isLensSpine && (visibleTraceAtSource || !hasLabelMargin)))) {
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
  if (node.lensMode) label.dataset.mode = node.lensMode;
  const preview = getSourcePreview(guide._deepreadSourceMap, node.sourceIds[0]);
  label.querySelector(".deepread-xray-excerpt").textContent =
    node.hint || `${preview.provenance.toLowerCase()}: ${shortenSourceText(preview.text, 108)}`;
  if (node.hint) label.classList.add("is-lens-peek");
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
  markSourceVisited(sourceId);
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
  item.dataset.depth = String(node.depth || 0);
  item.style.setProperty("--outline-depth", Math.min(4, node.depth || 0));

  const button = document.createElement("button");
  button.className = isSpine ? "deepread-spine-point" : "deepread-structure-button";
  button.type = "button";
  button.dataset.sourceIds = node.sourceIds.join(",");
  if (node.sourceIds.some((id) => visitedSourceIds.has(id)) && isSpine) button.classList.add("is-visited");
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
    kind.textContent = node.level ? `H${node.level}${node.role ? " · " + node.role : ""}` : node.isLiveSource ? "PASSAGE" : node.kind.toUpperCase();
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
    if (ordered.length <= 12 || Array.from({ length: 12 }, (_, i) => Math.round(i * (ordered.length - 1) / 11)).includes(index)) {
      spine.append(createMapPoint(guide, node, index, true));
    }
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
    "Adding section roles · local structure remains navigable";
}

function renderFallbackStructure(guide, sourceMap) {
  const nodes = localOutline(sourceMap);
  renderMapNodes(guide, nodes, sourceMap);
  guide.querySelector(".deepread-structure-count").textContent = `${nodes.length} ${getStructureSources(sourceMap).mode === "headings" ? "headings" : "passage anchors"}`;
  guide.querySelector(".deepread-structure-note").textContent =
    "Local outline · original document order. Open Atlas for role enrichment.";
}

function validatePageMap(pageMap, sourceMap) {
  const validSourceIds = new Set(
    (sourceMap?.sources || []).map((source) => source.id)
  );
  const nodes = Array.isArray(pageMap?.nodes) ? pageMap.nodes : [];
  return nodes
    .map((node) => {
      const sourceIds = Array.isArray(node?.sourceIds)
        ? [...new Set(node.sourceIds.every((id) => validSourceIds.has(id)) ? node.sourceIds : [])]
        : [];
      const label = typeof node?.label === "string" ? node.label.trim().slice(0, 120) : "";
      const kind = typeof node?.kind === "string" ? node.kind.trim().slice(0, 40) : "source";
      return { label, kind: kind || "source", sourceIds };
    })
    .filter((node) => node.label && node.sourceIds.length > 0)
    .slice(0, 7);
}

function renderAiPageMap(guide, nodes, sourceMap) {
  const outline = localOutline(sourceMap);
  const hasHeadings = getStructureSources(sourceMap).mode === "headings";
  const order = new Map(sourceMap.sources.map((source, index) => [source.id, index]));
  let structured;
  if (hasHeadings) {
    structured = outline.map(node => {
      const enrichment = nodes.find(item => item.sourceIds.includes(node.sourceIds[0]));
      return { ...node, role: enrichment?.kind.toUpperCase() || "" };
    });
  } else {
    // Each inferred range must be contiguous in supplied document order.
    let previousEnd = -1;
    structured = nodes.slice().sort((a,b) => order.get(a.sourceIds[0]) - order.get(b.sourceIds[0]))
      .filter(node => {
        const indices = node.sourceIds.map(id => order.get(id));
        const start = Math.min(...indices), end = Math.max(...indices);
        if (start <= previousEnd || indices[0] !== start) return false;
        previousEnd = end;
        return true;
      }).map(node => ({ ...node, depth: 0, inferred: true }));
    if (!structured.length) structured = outline;
  }
  renderMapNodes(guide, structured, sourceMap);
  guide.querySelector(".deepread-structure-count").textContent = `${structured.length} sections`;
  guide.querySelector(".deepread-structure-note").textContent = hasHeadings
    ? "Original heading hierarchy · AI roles where available"
    : "Inferred contiguous sections · follow original passages";
}

function buildSourceMapSafely() {
  try {
    const previous = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
    const sourceMap = globalThis.DeepReadSourceMapping?.buildSourceMap?.() || null;
    sourceMapNeedsRefresh = !sourceMap;
    observeOpenSourceRoots();
    if (sourceMap && previous === sourceMap) return sourceMap;
    const guide = document.getElementById(GUIDE_ID);
    if (guide) {
      guide._deepreadPageMapCache = null;
      guide._deepreadPendingMap = null;
      guide._deepreadMapRequestId = (guide._deepreadMapRequestId || 0) + 1;
    }
    stopFocusPath(focusPath || focusStarting ? "The original passages changed. Start a new Focus Path." : "");
    clearSourcePeek();
    document.getElementById(EXPLANATION_CARD_ID)?.remove();
    activeExplanation = null;
    clearReadingTrail();
    clearSmartReading();
    clearCriticalReading();
    visitedSourceIds = new Set();
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
      .filter((source, index, all) => all.length <= MAX_PAGE_MAP_SOURCE_BLOCKS ||
        Array.from({ length: MAX_PAGE_MAP_SOURCE_BLOCKS }, (_, i) => Math.round(i * (all.length - 1) / (MAX_PAGE_MAP_SOURCE_BLOCKS - 1))).includes(index))
      .map((source) => ({
        id: source.id,
        tag: source.tag,
        level: getSourceLevel(source),
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

function positionSmartOverview() {
  positionLensPanel();
}

function positionCriticalOverview() {
  positionLensPanel();
}

function setSmartOverviewOpen(open) {
  open = open && activeLensMode === "context";
  const overview = document.getElementById(SMART_OVERVIEW_ID);
  const button = document.getElementById(SMART_ACTION_ID);
  if (!overview || !button) return;
  overview.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (!open && overview.contains(document.activeElement)) button.focus({ preventScroll: true });
  if (!open) clearSourcePeek();
  if (open && activeLensMode === "context") {
    setCriticalOverviewOpen(false);
    setLensPanelOpen(true);
  }
}

function updateSmartAction() {
  const button = document.getElementById(SMART_ACTION_ID);
  if (!button) return;
  const active = smartReadingLoaded && smartReadingVisible;
  button.classList.toggle("is-active", active);
  button.classList.toggle("is-zero", active && smartReadingItems.length === 0);
  button.classList.toggle("is-loading", smartReadingLoading);
  button.setAttribute("aria-busy", String(smartReadingLoading));
  button.setAttribute("aria-selected", String(activeLensMode === "context"));
  button.setAttribute("aria-label", smartReadingLoading
    ? "Context Lens is analysing this article"
    : active
      ? `Context Lens active, ${smartReadingItems.length} reading aids. Open overview`
      : smartReadingLoaded
        ? "Context Lens inactive. Show cached reading aids"
        : "Context Lens. Find reading aids near original passages");
  button.querySelector(".deepread-smart-action-label").textContent =
    smartReadingLoading ? "Reading…" : "Context Lens";
  const count = button.querySelector(".deepread-smart-action-count");
  count.hidden = !active;
  count.textContent = active ? String(smartReadingItems.length) : "";
  button.title = active && smartReadingItems.length === 0
    ? "No extra context suggested · open Context Lens overview"
    : "Context Lens";
  button.setAttribute("aria-label", smartReadingLoading ? "Context Lens, analysing" : "Context Lens. Background and clarification");
  button.querySelector(".deepread-smart-action-label").textContent = "Context";
  button.title = "Context Lens";
  updateLensUI();
}

function renderSmartOverview() {
  const overview = document.getElementById(SMART_OVERVIEW_ID);
  if (!overview) return;
  overview.querySelector(".deepread-smart-overview-count").textContent =
    smartReadingItems.length === 0
      ? "NO EXTRA CONTEXT SUGGESTED"
      : `${smartReadingItems.length} FOUND IN THIS ARTICLE`;
  const list = overview.querySelector(".deepread-smart-overview-list");
  list.replaceChildren();
  smartReadingItems.forEach((item, index) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deepread-smart-overview-item";
    button.setAttribute("aria-label", `${index + 1}. ${item.label}, ${item.type}. Go to source passage`);
    button.innerHTML = '<span class="deepread-smart-overview-symbol" aria-hidden="true">✦</span><span class="deepread-smart-overview-copy"><strong></strong><small></small></span>';
    button.querySelector("strong").textContent = item.label;
    button.querySelector("small").textContent = item.type.toUpperCase();
    button.addEventListener("mouseenter", () => showSourcePeek(
      document.getElementById(GUIDE_ID),
      { label: item.label, kind: item.type, sourceIds: [item.sourceId] }, index, button
    ));
    button.addEventListener("focus", () => showSourcePeek(
      document.getElementById(GUIDE_ID),
      { label: item.label, kind: item.type, sourceIds: [item.sourceId] }, index, button
    ));
    button.addEventListener("mouseleave", () => {
      if (document.activeElement !== button) clearSourcePeek();
    });
    button.addEventListener("blur", clearSourcePeek);
    button.addEventListener("click", () => openSmartReadingItem(item, index));
    row.append(button);
    list.append(row);
  });
  overview.querySelector(".deepread-smart-overview-empty").hidden = smartReadingItems.length > 0;
  positionSmartOverview();
}

function clearSmartReading() {
  smartReadingRequestToken += 1;
  smartReadingItems.forEach((item) => item.element?.remove());
  smartReadingItems.forEach((item) => item.spineElement?.remove());
  smartReadingItems = [];
  smartReadingMap = null;
  smartReadingLoaded = false;
  smartReadingVisible = false;
  smartReadingLoading = false;
  setSmartOverviewOpen(false);
  const button = document.getElementById(SMART_ACTION_ID);
  if (button) {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
  setSmartStatus("");
  updateSmartAction();
}

function openSmartReadingItem(item, index) {
  if (!smartReadingVisible || !item.sourceElement?.isConnected ||
      smartReadingMap !== globalThis.DeepReadSourceMapping?.getCurrentMap?.()) return;
  if (!globalThis.DeepReadSourceMapping?.scrollToSourceId?.(item.sourceId)) return;
  markSourceVisited(item.sourceId);
  clearSourcePeek();
  setSmartOverviewOpen(false);
  item.opened = true;
  setLensPanelOpen(false);
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
}

function renderSmartSpinePoints() {
  const list = document.querySelector(".deepread-smart-spine-list");
  const guide = document.getElementById(GUIDE_ID);
  if (!list || !guide) return;
  list.replaceChildren();
  smartReadingItems.forEach((item, index) => {
    item.spineElement = null;
    if (!smartReadingVisible || !item.sourceElement?.isConnected) return;
    const point = document.createElement("li");
    point.className = "deepread-smart-spine-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deepread-smart-spine-point";
    button.dataset.sourceIds = item.sourceId;
    button.classList.toggle("is-visited", visitedSourceIds.has(item.sourceId));
    button.textContent = "✦";
    button.setAttribute("aria-label", `${index + 1}. ${item.type}: ${item.label}. Go to source passage`);
    button.title = `${item.type.toUpperCase()} · ${item.label}`;
    const peek = () => showSourcePeek(guide, {
      label: item.label, kind: item.type, sourceIds: [item.sourceId]
    }, index, button);
    button.addEventListener("mouseenter", peek);
    button.addEventListener("focus", peek);
    button.addEventListener("mouseleave", () => {
      if (document.activeElement !== button) clearSourcePeek();
    });
    button.addEventListener("blur", clearSourcePeek);
    button.addEventListener("click", () => openSmartReadingItem(item, index));
    point.append(button);
    list.append(point);
    item.spineElement = point;
  });
  scheduleMapLayout();
  updateActiveStructureNode(guide);
}

function createLensSourceTick(item, index, mode) {
  const guide = document.getElementById(GUIDE_ID);
  const shell = document.getElementById(SHELL_ID);
  if (!shell || !guide || !item.sourceElement?.isConnected) return null;
  const marker = document.createElement("aside");
  marker.className = `deepread-source-tick deepread-${mode === "context" ? "smart" : "critical"}-marker`;
  marker.dataset.sourceId = item.sourceId;
  marker.dataset.mode = mode;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "deepread-source-tick-button";
  button.setAttribute("aria-label", `${mode === "context" ? "Context" : "Critical"} Lens: ${item.label}. ${item.hint || item.prompt}. Follow source`);
  button.innerHTML = '<span aria-hidden="true"></span>';
  const peek = () => showSourcePeek(guide, {
    label: item.label, kind: item.type, sourceIds: item.sourceIds || [item.sourceId],
    hint: item.hint || item.prompt, lensMode: mode
  }, index, button);
  button.addEventListener("mouseenter", peek);
  button.addEventListener("focus", peek);
  button.addEventListener("mouseleave", () => {
    if (document.activeElement !== button) clearSourcePeek();
  });
  button.addEventListener("blur", clearSourcePeek);
  button.addEventListener("click", () => mode === "context" ? openSmartReadingItem(item, index) : openCriticalItem(item));
  marker.append(button);
  shell.append(marker);
  return marker;
}

function positionSourceTicks() {
  const shell = document.getElementById(SHELL_ID);
  if (!shell) return;
  const slots = new Map();
  const items = activeLensMode === "context" && smartReadingVisible ? smartReadingItems
    : activeLensMode === "critical" && criticalVisible ? criticalItems : [];
  const rail = shell.querySelector(".deepread-spine").getBoundingClientRect();
  items.forEach(item => {
    const marker = item.element;
    if (!marker || !item.sourceElement?.isConnected) return;
    const rect = item.sourceElement.getBoundingClientRect();
    const slot = slots.get(item.sourceId) || 0;
    slots.set(item.sourceId, slot + 1);
    const top = rect.top + Math.min(slot * 24, Math.max(0, rect.height - 24));
    const left = rect.left >= 16 ? rect.left - 15
      : rect.right + 22 < rail.left - 24 ? rect.right + 6 : null;
    const hasTrace = readingTrail.some(trace => trace.sourceId === item.sourceId && trace.label === item.label &&
      trace.element?.isConnected && !trace.element.hidden);
    marker.hidden = hasTrace || left === null || rect.bottom <= 0 || top >= window.innerHeight || top < 4 ||
      shell.classList.contains("deepread-shell--expanded");
    if (marker.hidden) return;
    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
  });
}

function renderSmartReadingMarkers() {
  smartReadingItems.forEach((item, index) => {
    item.element?.remove();
    item.element = smartReadingVisible ? createLensSourceTick(item, index, "context") : null;
  });
  scheduleMarginLayout();
}

async function requestSmartReading() {
  const guide = document.getElementById(GUIDE_ID);
  const button = document.getElementById(SMART_ACTION_ID);
  if (!guide || !button || smartReadingLoading) return;
  const shell = guide.closest(`#${SHELL_ID}`);
  if (shell?.classList.contains("deepread-shell--expanded")) {
    setGuideExpanded(shell, false, false);
  }
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const needsFreshMap = sourceMapNeedsRefresh || !currentMap?.root?.isConnected;
  const sourceMap = needsFreshMap ? buildSourceMapSafely() : currentMap;
  if (needsFreshMap && currentMap !== sourceMap) renderFallbackStructure(guide, sourceMap);
  if (!sourceMap) {
    setSmartStatus("No readable page source was found.");
    return;
  }
  if (smartReadingLoaded && smartReadingMap === sourceMap) {
    smartReadingVisible = activeLensMode === "context";
    renderSmartReadingMarkers();
    renderSmartSpinePoints();
    updateSmartAction();
    setSmartOverviewOpen(true);
    return;
  }

  const requestId = ++smartReadingRequestToken;
  smartReadingLoading = true;
  updateSmartAction();
  setSmartStatus("Finding context in the article…");
  try {
    const response = await sendDeepReadMessage({
      type: "DEEPREAD_SMART_READING",
      payload: getSmartReadingPayload(sourceMap)
    });
    if (requestId !== smartReadingRequestToken || !button.isConnected) return;
    if (!response?.ok) {
      setSmartStatus(response?.message || "Context Lens is unavailable.");
      return;
    }
    const sourceOrder = new Map((sourceMap.sources || []).map((source, index) => [source.id, index]));
    const items = Array.isArray(response.smartReading?.items) ? response.smartReading.items : [];
    smartReadingItems = items
      .filter((item) => sourceOrder.has(item.sourceId) &&
        typeof item.label === "string" && typeof item.hint === "string" &&
        ["concept", "term", "background", "context"].includes(item.type))
      .slice(0, 5)
      .sort((left, right) => sourceOrder.get(left.sourceId) - sourceOrder.get(right.sourceId))
      .map((item) => ({
        ...item,
        sourceElement: sourceMap.elementsById.get(item.sourceId),
        opened: false,
        element: null,
        spineElement: null
      }));
    smartReadingMap = sourceMap;
    smartReadingLoaded = true;
    smartReadingVisible = activeLensMode === "context";
    renderSmartReadingMarkers();
    renderSmartSpinePoints();
    renderSmartOverview();
    updateSmartAction();
    setSmartStatus("");
    if (smartReadingVisible && !document.getElementById(LENS_PANEL_ID)?.hidden) setSmartOverviewOpen(true);
  } catch (error) {
    if (requestId === smartReadingRequestToken) {
      setSmartStatus("Context Lens could not reach Gemini. Try again.");
      console.warn("DeepRead Context Lens request failed.", error);
    }
  } finally {
    if (requestId === smartReadingRequestToken) {
      button.disabled = false;
      smartReadingLoading = false;
      updateSmartAction();
    }
  }
}

function setCriticalStatus(message, transient = false) {
  const status = document.querySelector(".deepread-critical-status");
  if (!status) return;
  clearTimeout(criticalStatusTimer);
  status.textContent = message;
  status.hidden = !message;
  if (message && transient) criticalStatusTimer = setTimeout(() => { status.hidden = true; }, 4800);
}

function setCriticalOverviewOpen(open) {
  open = open && activeLensMode === "critical";
  const overview = document.getElementById(CRITICAL_OVERVIEW_ID);
  const button = document.getElementById(CRITICAL_ACTION_ID);
  if (!overview || !button) return;
  overview.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (!open && overview.contains(document.activeElement)) button.focus({ preventScroll: true });
  if (!open) clearSourcePeek();
  if (open && activeLensMode === "critical") {
    setSmartOverviewOpen(false);
    setLensPanelOpen(true);
  }
}

function updateCriticalAction() {
  const button = document.getElementById(CRITICAL_ACTION_ID);
  if (!button) return;
  const active = criticalLoaded && criticalVisible;
  button.classList.toggle("is-active", active);
  button.classList.toggle("is-zero", active && criticalItems.length === 0);
  button.classList.toggle("is-loading", criticalLoading);
  button.setAttribute("aria-busy", String(criticalLoading));
  button.setAttribute("aria-selected", String(activeLensMode === "critical"));
  button.setAttribute("aria-label", criticalLoading
    ? "Critical Lens is analysing this article"
    : active ? `Critical Lens active, ${criticalItems.length} passages to examine. Open overview`
      : criticalLoaded ? "Critical Lens inactive. Show cached findings"
        : "Critical Lens. Find passages worth examining more carefully");
  button.querySelector(".deepread-critical-action-label").textContent =
    criticalLoading ? "Considering…" : "Critical Lens";
  const count = button.querySelector(".deepread-critical-action-count");
  count.hidden = !active;
  count.textContent = active ? String(criticalItems.length) : "";
  button.title = active && !criticalItems.length
    ? "No passages flagged · open Critical Lens overview" : "Critical Lens";
  button.querySelector(".deepread-critical-action-label").textContent = "Critical";
  updateLensUI();
}

function clearCriticalReading() {
  criticalRequestToken += 1;
  criticalItems.forEach((item) => {
    item.element?.remove();
    item.spineElement?.remove();
  });
  criticalItems = [];
  criticalMap = null;
  criticalLoaded = false;
  criticalVisible = false;
  criticalLoading = false;
  setCriticalOverviewOpen(false);
  const button = document.getElementById(CRITICAL_ACTION_ID);
  if (button) button.disabled = false;
  setCriticalStatus("");
  updateCriticalAction();
}

function openCriticalItem(item) {
  if (!criticalVisible || !item.sourceElement?.isConnected ||
      criticalMap !== globalThis.DeepReadSourceMapping?.getCurrentMap?.()) return;
  if (!globalThis.DeepReadSourceMapping?.scrollToSourceId?.(item.sourceId)) return;
  markSourceVisited(item.sourceId);
  clearSourcePeek();
  setCriticalOverviewOpen(false);
  item.opened = true;
  setLensPanelOpen(false);
  addReadingTrace({
    kind: "critical", label: item.label, type: item.type, prompt: item.prompt,
    sourceId: item.sourceId, sourceIds: item.sourceIds, sourceElement: item.sourceElement,
    marker: "◇", open: true
  });
}

function renderCriticalOverview() {
  const overview = document.getElementById(CRITICAL_OVERVIEW_ID);
  if (!overview) return;
  overview.querySelector(".deepread-critical-overview-count").textContent = criticalItems.length
    ? `${criticalItems.length} PASSAGES TO EXAMINE` : "NO PASSAGES FLAGGED";
  const list = overview.querySelector(".deepread-critical-overview-list");
  list.replaceChildren();
  const guide = document.getElementById(GUIDE_ID);
  criticalItems.forEach((item, index) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deepread-critical-overview-item";
    button.setAttribute("aria-label", `${index + 1}. ${item.type}: ${item.label}. Go to source passage`);
    button.innerHTML = '<span class="deepread-critical-overview-symbol" aria-hidden="true">◇</span><span class="deepread-critical-overview-copy"><strong></strong><small></small></span>';
    button.querySelector("strong").textContent = item.label;
    button.querySelector("small").textContent = item.type.toUpperCase();
    const peek = () => showSourcePeek(guide, { label: item.label, kind: item.type, sourceIds: item.sourceIds }, index, button);
    button.addEventListener("mouseenter", peek);
    button.addEventListener("focus", peek);
    button.addEventListener("mouseleave", () => { if (document.activeElement !== button) clearSourcePeek(); });
    button.addEventListener("blur", clearSourcePeek);
    button.addEventListener("click", () => openCriticalItem(item));
    row.append(button);
    list.append(row);
  });
  overview.querySelector(".deepread-critical-overview-empty").hidden = criticalItems.length > 0;
  positionCriticalOverview();
}

function renderCriticalSpinePoints() {
  const list = document.querySelector(".deepread-critical-spine-list");
  const guide = document.getElementById(GUIDE_ID);
  if (!list || !guide) return;
  list.replaceChildren();
  criticalItems.forEach((item, index) => {
    item.spineElement = null;
    if (!criticalVisible || !item.sourceElement?.isConnected) return;
    const point = document.createElement("li");
    point.className = "deepread-critical-spine-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deepread-critical-spine-point";
    button.dataset.sourceIds = item.sourceIds.join(",");
    button.classList.toggle("is-visited", item.sourceIds.some((id) => visitedSourceIds.has(id)));
    button.textContent = "◇";
    button.setAttribute("aria-label", `${index + 1}. ${item.type}: ${item.label}. Go to source passage`);
    button.title = `${item.type.toUpperCase()} · ${item.label}`;
    const peek = () => showSourcePeek(guide, { label: item.label, kind: item.type, sourceIds: item.sourceIds }, index, button);
    button.addEventListener("mouseenter", peek);
    button.addEventListener("focus", peek);
    button.addEventListener("mouseleave", () => { if (document.activeElement !== button) clearSourcePeek(); });
    button.addEventListener("blur", clearSourcePeek);
    button.addEventListener("click", () => openCriticalItem(item));
    point.append(button);
    list.append(point);
    item.spineElement = point;
  });
  scheduleMapLayout();
  updateActiveStructureNode(guide);
}

function renderCriticalMarkers() {
  criticalItems.forEach((item, index) => {
    item.element?.remove();
    item.element = criticalVisible ? createLensSourceTick(item, index, "critical") : null;
  });
  scheduleMarginLayout();
}

async function requestCriticalReading() {
  const guide = document.getElementById(GUIDE_ID);
  const button = document.getElementById(CRITICAL_ACTION_ID);
  if (!guide || !button || criticalLoading) return;
  const shell = guide.closest(`#${SHELL_ID}`);
  if (shell?.classList.contains("deepread-shell--expanded")) setGuideExpanded(shell, false, false);
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const needsFreshMap = sourceMapNeedsRefresh || !currentMap?.root?.isConnected;
  const sourceMap = needsFreshMap ? buildSourceMapSafely() : currentMap;
  if (needsFreshMap && currentMap !== sourceMap) renderFallbackStructure(guide, sourceMap);
  if (!sourceMap) { setCriticalStatus("No readable page source was found."); return; }
  if (criticalLoaded && criticalMap === sourceMap) {
    criticalVisible = activeLensMode === "critical";
    renderCriticalMarkers();
    renderCriticalSpinePoints();
    updateCriticalAction();
    setCriticalOverviewOpen(true);
    return;
  }
  const requestId = ++criticalRequestToken;
  criticalLoading = true;
  updateCriticalAction();
  setCriticalStatus("Finding passages to examine…");
  try {
    const response = await sendDeepReadMessage({
      type: "DEEPREAD_CRITICAL_READING", payload: getSmartReadingPayload(sourceMap)
    });
    if (requestId !== criticalRequestToken || !button.isConnected) return;
    if (!response?.ok) { setCriticalStatus(response?.message || "Critical Lens is unavailable."); return; }
    const sourceOrder = new Map((sourceMap.sources || []).map((source, index) => [source.id, index]));
    const types = ["evidence", "assumption", "causal", "uncertainty", "counterpoint", "value"];
    const items = Array.isArray(response.criticalReading?.items) ? response.criticalReading.items : [];
    criticalItems = items.filter((item) =>
      Array.isArray(item.sourceIds) && item.sourceIds.length && item.sourceIds.every((id) => sourceOrder.has(id)) &&
      typeof item.label === "string" && item.label.trim() &&
      typeof item.prompt === "string" && item.prompt.trim() && types.includes(item.type)
    ).slice(0, 3).sort((left, right) => sourceOrder.get(left.sourceIds[0]) - sourceOrder.get(right.sourceIds[0]))
      .map((item) => ({ ...item, sourceId: item.sourceIds[0],
        sourceElement: sourceMap.elementsById.get(item.sourceIds[0]),
        opened: false, element: null, spineElement: null }));
    criticalMap = sourceMap;
    criticalLoaded = true;
    criticalVisible = activeLensMode === "critical";
    renderCriticalMarkers();
    renderCriticalSpinePoints();
    renderCriticalOverview();
    updateCriticalAction();
    setCriticalStatus("");
    if (criticalVisible && !document.getElementById(LENS_PANEL_ID)?.hidden) setCriticalOverviewOpen(true);
  } catch (error) {
    if (requestId === criticalRequestToken) {
      setCriticalStatus("Critical Lens could not reach Gemini. Try again.");
      console.warn("DeepRead Critical Lens request failed.", error);
    }
  } finally {
    if (requestId === criticalRequestToken) {
      button.disabled = false;
      criticalLoading = false;
      updateCriticalAction();
    }
  }
}

function refreshGuide(guide) {
  if (!sourceMapNeedsRefresh && guide._deepreadPendingMap?.promise) return guide._deepreadPendingMap.promise;
  const previousPending = guide._deepreadPendingMap;
  const promise = loadGuide(guide);
  if (previousPending === guide._deepreadPendingMap && previousPending?.promise) return previousPending.promise;
  if (guide._deepreadPendingMap) guide._deepreadPendingMap.promise = promise;
  return promise;
}

async function loadGuide(guide) {
  const currentMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  const needsFreshMap = sourceMapNeedsRefresh || !currentMap?.root?.isConnected;
  const sourceMap = needsFreshMap ? buildSourceMapSafely() : currentMap;
  if (needsFreshMap && currentMap !== sourceMap) {
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

    guide._deepreadPageMapCache = { sourceMap, nodes, focusPath: validatePageMap({ nodes: response.pageMap.focusPath }, sourceMap) };
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
    focusReadingSurface("atlas");
    void refreshGuide(guide);
  } else {
    if (shell.dataset.detail === "atlas") shell.dataset.detail = "none";
    clearSourcePeek();
    if (restoreFocus && guide.contains(document.activeElement)) rail.focus();
  }
}

let deepReadActive = false;
let focusPath = null;
let focusStartToken = 0;
let focusElement = null;
let focusStarting = false;

function setDeepReadActive(active) {
  deepReadActive = active;
  const shell = ensureDeepReadShell();
  shell.dataset.mode = active ? "active" : "dormant";
  shell.querySelector(".deepread-spine").inert = !active;
  const launcher = shell.querySelector("#deepread-launcher");
  launcher.setAttribute("aria-pressed", String(active));
  launcher.setAttribute("aria-label", active ? "Exit DeepRead reading mode" : "Activate DeepRead reading mode");
  if (!active) {
    setGuideExpanded(shell, false, false);
    setLensPanelOpen(false, false);
    turnOffLens();
    stopFocusPath();
    clearSourcePeek();
    dismissSelectionAction();
    removeExplanationCard();
    collapseOpenReadingTraces();
    launcher.focus({ preventScroll: true });
  }
  scheduleMapLayout();
}

function stopFocusPath(message = "") {
  focusStartToken++;
  focusStarting = false;
  if (focusElement) globalThis.DeepReadSourceMapping?.clearHighlight?.();
  focusElement?.classList.remove("deepread-focus-source");
  focusElement = null;
  focusPath = null;
  const shell = document.getElementById(SHELL_ID);
  if (!shell) return;
  shell.dataset.focus = "off";
  const action = shell.querySelector("#deepread-focus-action");
  action?.setAttribute("aria-pressed", "false");
  action?.setAttribute("aria-busy", "false");
  const panel = shell.querySelector("#deepread-focus-panel");
  if (panel) panel.hidden = !message;
  if (message) {
    focusReadingSurface("focus");
    panel.querySelector(".deepread-focus-progress").textContent = message;
    panel.querySelector(".deepread-focus-label").textContent = "";
    panel.querySelectorAll("button[data-step]").forEach(button => button.disabled = true);
  } else if (shell.dataset.detail === "focus") shell.dataset.detail = "none";
}

function createFocusSequence(cache, sourceMap) {
  const candidates = cache?.focusPath?.length ? cache.focusPath : cache?.nodes || [];
  const order = new Map(sourceMap.sources.map((source, index) => [source.id, index]));
  const used = new Set();
  return candidates.map(node => {
    // Old cached Page Maps can provide section anchors. Follow a real passage
    // within that section, stopping at the next heading.
    let source = sourceMap.sources.find(source => source.id === node.sourceIds[0]);
    if (source && isHeadingSource(source)) {
      const start = order.get(source.id) + 1;
      source = null;
      for (const next of sourceMap.sources.slice(start)) {
        if (isHeadingSource(next)) break;
        if (next.text.length >= 36) { source = next; break; }
      }
    }
    if (!source || used.has(source.id) || source.text.length < 36) return null;
    used.add(source.id);
    return { sourceId: source.id, label: node.label, role: node.kind };
  }).filter(Boolean).sort((a,b) => order.get(a.sourceId) - order.get(b.sourceId)).slice(0,5);
}

function positionFocusPanel() {
  const panel = document.getElementById("deepread-focus-panel");
  if (!panel || panel.hidden) return;
  panel.style.top = `${Math.max(12, Math.min(window.innerHeight * 0.19, window.innerHeight - panel.offsetHeight - 12))}px`;
  const rect = panel.getBoundingClientRect();
  const sourceRect = focusElement?.getBoundingClientRect();
  if (!sourceRect || sourceRect.right <= rect.left || sourceRect.bottom < rect.top || sourceRect.top > rect.bottom) return;
  // Keep the guided passage readable wherever vertical space allows it.
  const below = sourceRect.bottom + 14;
  const above = sourceRect.top - rect.height - 14;
  if (below + rect.height <= window.innerHeight - 12) panel.style.top = `${below}px`;
  else if (above >= 12) panel.style.top = `${above}px`;
}

function showFocusStep(index, navigate = true) {
  if (!focusPath || focusPath.sourceMap !== globalThis.DeepReadSourceMapping?.getCurrentMap?.()) return stopFocusPath();
  const step = focusPath.steps[index];
  const element = focusPath.sourceMap.elementsById.get(step?.sourceId);
  if (!element?.isConnected) return stopFocusPath("The original passage is no longer available.");
  focusPath.index = index;
  focusElement?.classList.remove("deepread-focus-source");
  focusElement = element;
  element.classList.add("deepread-focus-source");
  if (navigate) {
    globalThis.DeepReadSourceMapping.scrollToSourceId(step.sourceId);
    markSourceVisited(step.sourceId);
  }
  focusReadingSurface("focus");
  const shell = ensureDeepReadShell();
  const panel = shell.querySelector("#deepread-focus-panel");
  panel.hidden = false;
  shell.dataset.focus = "active";
  shell.querySelector("#deepread-focus-action").setAttribute("aria-pressed", "true");
  panel.querySelector(".deepread-focus-progress").textContent = `${index + 1} / ${focusPath.steps.length} — ${step.role}`;
  panel.querySelector(".deepread-focus-label").textContent = step.label;
  panel.querySelector('[data-step="previous"]').disabled = index === 0;
  panel.querySelector('[data-step="next"]').disabled = index === focusPath.steps.length - 1;
  positionFocusPanel();
}

async function startFocusPath() {
  if (focusStarting) return stopFocusPath();
  if (focusPath) {
    if (document.getElementById(SHELL_ID).dataset.detail !== "focus") return showFocusStep(focusPath.index, false);
    return stopFocusPath();
  }
  focusStarting = true;
  const token = ++focusStartToken;
  const shell = ensureDeepReadShell();
  focusReadingSurface("focus");
  shell.querySelector("#deepread-focus-action").setAttribute("aria-busy", "true");
  const panel = shell.querySelector("#deepread-focus-panel");
  panel.hidden = false;
  panel.querySelector(".deepread-focus-progress").textContent = "Choosing original passages…";
  panel.querySelector(".deepread-focus-label").textContent = "";
  panel.querySelectorAll("button[data-step]").forEach(button => button.disabled = true);
  const guide = shell.querySelector(`#${GUIDE_ID}`);
  await refreshGuide(guide);
  if (token !== focusStartToken || !deepReadActive) return;
  focusStarting = false;
  shell.querySelector("#deepread-focus-action").setAttribute("aria-busy", "false");
  const sourceMap = globalThis.DeepReadSourceMapping.getCurrentMap();
  const steps = createFocusSequence(guide._deepreadPageMapCache, sourceMap);
  if (!steps.length) return stopFocusPath("No guided path is available. Atlas still links local sources.");
  focusPath = { sourceMap, steps, index: 0 };
  // A late response must not close Explain or another surface chosen meanwhile.
  if (shell.dataset.detail === "focus") showFocusStep(0);
  else { shell.dataset.focus = "active"; shell.querySelector("#deepread-focus-action").setAttribute("aria-pressed", "true"); }
}

function createDeepReadShell() {
  if (document.getElementById(SHELL_ID)) {
    return document.getElementById(SHELL_ID);
  }

  const shell = document.createElement("div");
  shell.id = SHELL_ID;
  shell.className = "deepread-shell";
  shell.dataset.mode = "dormant";
  shell.dataset.focus = "off";
  const launcher = document.createElement("button");
  launcher.id = "deepread-launcher";
  launcher.type = "button";
  launcher.textContent = "D";
  launcher.setAttribute("aria-label", "Activate DeepRead reading mode");
  launcher.setAttribute("aria-pressed", "false");
  launcher.addEventListener("click", () => setDeepReadActive(!deepReadActive));
  const focusAction = document.createElement("button");
  focusAction.id = "deepread-focus-action";
  focusAction.type = "button";
  focusAction.textContent = "→";
  focusAction.title = "Focus Path";
  focusAction.setAttribute("aria-label", "Focus Path. Guide me through original passages");
  focusAction.setAttribute("aria-pressed", "false");
  focusAction.setAttribute("aria-controls", "deepread-focus-panel");
  focusAction.addEventListener("click", () => void startFocusPath());
  const focusPanel = document.createElement("aside");
  focusPanel.id = "deepread-focus-panel";
  focusPanel.setAttribute("aria-label", "Focus Path");
  focusPanel.hidden = true;
  focusPanel.innerHTML = '<strong>Focus Path</strong><p class="deepread-focus-progress" role="status" aria-live="polite"></p><p class="deepread-focus-label"></p><div><button type="button" data-step="previous">Previous</button><button type="button" data-step="next">Next</button><button type="button" class="deepread-focus-stop">Stop</button></div>';
  focusPanel.querySelector('[data-step="previous"]').addEventListener("click", () => { if (focusPath && focusPath.index > 0) showFocusStep(focusPath.index - 1); });
  focusPanel.querySelector('[data-step="next"]').addEventListener("click", () => { if (focusPath && focusPath.index < focusPath.steps.length - 1) showFocusStep(focusPath.index + 1); });
  focusPanel.querySelector('.deepread-focus-stop').addEventListener("click", () => { stopFocusPath(); focusAction.focus(); });

  const spine = document.createElement("nav");
  spine.className = "deepread-spine";
  spine.setAttribute("aria-label", "DeepRead reading spine");
  const rail = document.createElement("button");
  rail.id = RAIL_ID;
  rail.className = "deepread-rail-toggle";
  rail.title = "Reading Atlas";
  rail.type = "button";
  rail.setAttribute("aria-expanded", "false");
  rail.setAttribute("aria-controls", GUIDE_ID);
  rail.setAttribute("aria-label", "Open Reading Atlas");
  rail.innerHTML = '<span class="deepread-rail-mark" aria-hidden="true">≡</span><span class="deepread-rail-arrow" aria-hidden="true">+</span>';
  const smartAction = document.createElement("button");
  smartAction.id = SMART_ACTION_ID;
  smartAction.className = "deepread-smart-action";
  smartAction.type = "button";
  smartAction.title = "Context Lens";
  smartAction.setAttribute("aria-label", "Context Lens. Find reading aids near original passages");
  smartAction.setAttribute("aria-pressed", "false");
  smartAction.setAttribute("aria-expanded", "false");
  smartAction.setAttribute("aria-controls", SMART_OVERVIEW_ID);
  smartAction.innerHTML = '<span class="deepread-smart-action-symbol" aria-hidden="true">✦</span><span class="deepread-smart-action-label">Context Lens</span><span class="deepread-smart-action-count" hidden></span>';
  const criticalAction = document.createElement("button");
  criticalAction.id = CRITICAL_ACTION_ID;
  criticalAction.className = "deepread-critical-action";
  criticalAction.type = "button";
  criticalAction.title = "Critical Lens";
  criticalAction.setAttribute("aria-label", "Critical Lens. Find passages worth examining more carefully");
  criticalAction.setAttribute("aria-pressed", "false");
  criticalAction.setAttribute("aria-expanded", "false");
  criticalAction.setAttribute("aria-controls", CRITICAL_OVERVIEW_ID);
  criticalAction.innerHTML = '<span class="deepread-critical-action-symbol" aria-hidden="true">◇</span><span class="deepread-critical-action-label">Critical Lens</span><span class="deepread-critical-action-count" hidden></span>';
  const lensAction = document.createElement("button");
  lensAction.id = LENS_ACTION_ID;
  lensAction.type = "button";
  lensAction.setAttribute("aria-label", "Open Lens choices");
  lensAction.setAttribute("aria-expanded", "false");
  lensAction.setAttribute("aria-controls", LENS_PANEL_ID);
  lensAction.innerHTML = '<span class="deepread-lens-symbol" aria-hidden="true">◐</span><span class="deepread-lens-label">Lens</span><span class="deepread-lens-count" hidden></span>';
  const lensPanel = document.createElement("aside");
  lensPanel.id = LENS_PANEL_ID;
  lensPanel.setAttribute("aria-label", "DeepRead Lens");
  lensPanel.hidden = true;
  lensPanel.innerHTML = '<div class="deepread-lens-heading"><strong>Lens</strong><button type="button" class="deepread-lens-close" aria-label="Close Lens choices">×</button></div><div class="deepread-lens-tabs" role="tablist" aria-label="Lens mode"></div><p class="deepread-lens-intro">Context helps understanding.<br>Critical invites closer examination.<br>Choose a mode to analyse this page.</p>';
  smartAction.setAttribute("role", "tab");
  criticalAction.setAttribute("role", "tab");
  [smartAction, criticalAction].forEach(action => action.removeAttribute("aria-pressed"));
  lensPanel.querySelector(".deepread-lens-tabs").append(smartAction, criticalAction);
  const smartStatus = document.createElement("span");
  smartStatus.className = "deepread-smart-status";
  smartStatus.setAttribute("role", "status");
  smartStatus.setAttribute("aria-live", "polite");
  smartStatus.hidden = true;
  const criticalStatus = document.createElement("span");
  criticalStatus.className = "deepread-critical-status";
  criticalStatus.setAttribute("role", "status");
  criticalStatus.setAttribute("aria-live", "polite");
  criticalStatus.hidden = true;
  const spineList = document.createElement("ol");
  spineList.className = "deepread-spine-list";
  spineList.setAttribute("aria-label", "Source positions");
  const smartSpineList = document.createElement("ol");
  smartSpineList.className = "deepread-smart-spine-list";
  smartSpineList.setAttribute("aria-label", "Context Lens positions");
  const criticalSpineList = document.createElement("ol");
  criticalSpineList.className = "deepread-critical-spine-list";
  criticalSpineList.setAttribute("aria-label", "Critical Lens positions");
  spine.inert = true;
  spine.append(rail, lensAction, focusAction, spineList, smartSpineList, criticalSpineList);
  lensPanel.append(smartStatus, criticalStatus);

  const smartOverview = document.createElement("aside");
  smartOverview.id = SMART_OVERVIEW_ID;
  smartOverview.setAttribute("aria-label", "Context Lens findings");
  smartOverview.setAttribute("role", "tabpanel");
  smartOverview.setAttribute("aria-labelledby", SMART_ACTION_ID);
  smartOverview.hidden = true;
  smartOverview.innerHTML = `
    <div class="deepread-smart-overview-heading">
      <strong>Context Lens</strong><span class="deepread-smart-overview-count"></span>
    </div>
    <ol class="deepread-smart-overview-list"></ol>
    <p class="deepread-smart-overview-empty" hidden>No passage clearly called for an extra reading aid.</p>
    <button class="deepread-smart-overview-off" type="button">Turn off Lens</button>
  `;

  const criticalOverview = document.createElement("aside");
  criticalOverview.id = CRITICAL_OVERVIEW_ID;
  criticalOverview.setAttribute("aria-label", "Critical Lens findings");
  criticalOverview.setAttribute("role", "tabpanel");
  criticalOverview.setAttribute("aria-labelledby", CRITICAL_ACTION_ID);
  criticalOverview.hidden = true;
  criticalOverview.innerHTML = `
    <div class="deepread-critical-overview-heading"><strong>CRITICAL LENS</strong><span class="deepread-critical-overview-count"></span></div>
    <ol class="deepread-critical-overview-list"></ol>
    <p class="deepread-critical-overview-empty" hidden>No passage clearly called for a critical reading question.</p>
    <button class="deepread-critical-overview-off" type="button">Turn off Lens</button>
  `;

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
  lensAction.addEventListener("click", () => setLensPanelOpen(lensPanel.hidden));
  lensPanel.querySelector(".deepread-lens-close").addEventListener("click", () => setLensPanelOpen(false));
  smartAction.addEventListener("click", () => activateLensMode("context"));
  criticalAction.addEventListener("click", () => activateLensMode("critical"));
  lensPanel.querySelector(".deepread-lens-tabs").addEventListener("keydown", event => {
    const tabs = [smartAction, criticalAction];
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : (tabs.indexOf(document.activeElement) + 1) % 2;
    tabs[next].focus();
  });
  smartOverview.querySelector(".deepread-smart-overview-off").addEventListener("click", turnOffLens);
  criticalOverview.querySelector(".deepread-critical-overview-off").addEventListener("click", turnOffLens);
  guide.querySelector(".deepread-close").addEventListener("click", () => {
    setGuideExpanded(shell, false);
  });

  lensPanel.append(smartOverview, criticalOverview);
  shell.append(launcher, spine, guide, lensPanel, focusPanel);
  document.documentElement.appendChild(shell);
  updateSmartAction();
  updateCriticalAction();
  updateLensUI();
  return shell;
}

function ensureDeepReadShell() {
  return createDeepReadShell();
}

function toggleGuide() {
  setDeepReadActive(!deepReadActive);
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
    const zone = getAnnotationZone(sourceRect, width);
    const rightSpace = zone.width;
    const leftSpace = sourceRect.left;
    if (rightSpace < width && leftSpace < width + 12) {
      positionFloatingElement(card, context.rect);
      return;
    }
    const left = rightSpace >= width
      ? zone.left
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
  const shell = document.getElementById(SHELL_ID);
  if (shell?.dataset.detail === "explain") shell.dataset.detail = "none";
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
  updateTrailHierarchy();
  scheduleMarginLayout();
}

function collapseOpenReadingTraces(except = null) {
  document.querySelectorAll(`#${SHELL_ID} .deepread-source-annotation.is-open .deepread-trace-toggle`)
    .forEach((toggle) => { if (!except?.contains(toggle)) toggle.click(); });
}

function updateTrailHierarchy() {
  const active = readingTrail.find(trace => trace.element?.classList.contains("is-open")) || readingTrail.at(-1);
  readingTrail.forEach(trace => {
    trace.element?.classList.toggle("is-latest", trace === active);
    trace.element?.classList.toggle("is-history", trace !== active);
  });
}

function getAnnotationZone(rect, maxWidth = 230) {
  const rail = document.querySelector(`#${SHELL_ID} .deepread-spine`)?.getBoundingClientRect();
  const rightBoundary = rail ? rail.left - 30 : window.innerWidth - 12;
  const left = rect.right + 12;
  return { left, width: Math.min(maxWidth, rightBoundary - left), rightBoundary };
}

function positionMarginItems() {
  updateTrailHierarchy();
  const entries = readingTrail.map(trace => ({ element: trace.element, sourceElement: trace.sourceElement }));
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
    const zone = getAnnotationZone(rect, 230);
    let side = "right";
    let left;
    if (zone.width >= 148) {
      element.style.maxWidth = `${zone.width}px`;
      left = zone.left;
    } else {
      side = "compact";
      element.classList.add("is-compact");
      element.style.maxWidth = "16px";
      left = Math.max(1, rect.left - 18);
    }
    element.style.setProperty("--deepread-margin-width", side === "compact" ? "210px" : element.style.maxWidth);
    element.style.left = `${Math.max(1, Math.min(left, window.innerWidth - element.offsetWidth - 6))}px`;
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
    let occupiedBottom = 8;
    group.forEach((entry) => {
      const top = Math.max(occupiedBottom, entry.top - overflow);
      if (top + entry.height > window.innerHeight - 8) {
        entry.element.hidden = true;
        return;
      }
      occupiedBottom = top + entry.height + 5;
      entry.element.style.top = `${top}px`;
      entry.element.classList.toggle("is-above", top > window.innerHeight - 150);
    });
  });
  readingTrail.forEach((trace) => {
    const note = trace.element;
    const detail = note?.querySelector(".deepread-trace-detail");
    if (!detail || note.hidden) return;
    const anchor = note.getBoundingClientRect();
    detail.style.maxHeight = `${Math.min(360, window.innerHeight - 16)}px`;
    const height = detail.offsetHeight;
    const below = anchor.bottom + 5;
    const top = below + height <= window.innerHeight - 8
      ? below : Math.max(8, Math.min(anchor.top - height - 5, window.innerHeight - height - 8));
    detail.style.top = `${top - anchor.top}px`;
    detail.style.bottom = "auto";
    // Clamp the actual detail box, including compact/left margin variants.
    detail.style.removeProperty("left");
    detail.style.removeProperty("right");
    const rect = detail.getBoundingClientRect();
    const rightBoundary = getAnnotationZone(trace.sourceElement.getBoundingClientRect()).rightBoundary;
    const left = Math.max(8, Math.min(rect.left, rightBoundary - rect.width));
    detail.style.left = `${left - anchor.left}px`;
    detail.style.right = "auto";
  });
  const openDetails = readingTrail.filter((trace) => trace.element?.classList.contains("is-open") &&
    !trace.element.hidden).map((trace) => ({
      owner: trace.element,
      rect: trace.element.querySelector(".deepread-trace-detail")?.getBoundingClientRect()
    }));
  entries.forEach(({ element }) => {
    if (!element || element.hidden) return;
    const rect = element.getBoundingClientRect();
    if (openDetails.some(({ owner, rect: detail }) => owner !== element && detail &&
      rect.left < detail.right && rect.right > detail.left &&
      rect.top < detail.bottom && rect.bottom > detail.top)) {
      element.hidden = true;
    }
  });
}

function scheduleMarginLayout() {
  if (marginLayoutFrame || (!readingTrail.length && !smartReadingItems.length && !criticalItems.length)) return;
  marginLayoutFrame = requestAnimationFrame(() => {
    marginLayoutFrame = 0;
    positionMarginItems();
    positionSourceTicks();
  });
}

function addReadingTrace({ kind, label, sourceId, sourceIds, sourceElement, marker, sourceText, type, hint, prompt, explanation, selectedText, open = false }) {
  const shell = document.getElementById(SHELL_ID);
  const sourceMap = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
  if (!shell || !sourceElement?.isConnected || sourceMap?.elementsById?.get(sourceId) !== sourceElement) return;
  if (open) collapseOpenReadingTraces();
  const existing = readingTrail.find((trace) =>
    trace.kind === kind && trace.sourceId === sourceId &&
    (!["smart", "critical"].includes(kind) || trace.label === label) &&
    (kind !== "explained" || trace.selectedText === selectedText)
  );
  if (existing) removeReadingTrace(existing.id);
  while (readingTrail.length >= MAX_READING_TRAIL) removeReadingTrace(readingTrail[0].id);

  const trace = {
    id: ++readingTrailSequence,
    kind, label, sourceId, sourceElement, marker: marker || "E",
    sourceText, type, hint, prompt, explanation, selectedText,
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
  note.querySelector(".deepread-trace-title").textContent = kind === "critical"
    ? `${type.toUpperCase()} · ${label}` : label;
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
  } else if (kind === "critical") {
    heading.textContent = `◇ ${type || "QUESTION"} · CONSIDER`.toUpperCase();
    preview.textContent = shortenSourceText(prompt, 130);
    addParagraph(prompt, "deepread-trace-main");
    const cited = getSourcePreview(sourceMap, sourceId);
    addParagraph(`${cited.provenance}: ${shortenSourceText(cited.text, 180)}`, "deepread-trace-context");
    if (sourceIds?.length > 1) {
      const links = document.createElement("div");
      links.className = "deepread-trace-source-links";
      sourceIds.slice(1).forEach((id, index) => {
        const source = getSourceById(sourceMap, id);
        if (!source) return;
        const link = document.createElement("button");
        link.type = "button";
        link.textContent = `Related passage ${index + 1} ↗`;
        link.setAttribute("aria-label", `Follow related passage: ${shortenSourceText(source.text, 100)}`);
        link.addEventListener("click", () => {
          if (sourceMap !== globalThis.DeepReadSourceMapping?.getCurrentMap?.()) return;
          if (globalThis.DeepReadSourceMapping.scrollToSourceId(id)) markSourceVisited(id);
        });
        links.append(link);
      });
      full.append(links);
    }
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
    if (expanded) {
      focusReadingSurface("trace");
      collapseOpenReadingTraces(note);
    }
    note.classList.toggle("is-open", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${label} reading trace`);
    preview.hidden = expanded;
    full.hidden = !expanded;
    updateTrailHierarchy();
    scheduleMarginLayout();
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
  focusReadingSurface("explain");
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
  markSourceVisited(context.sourceId);
  positionExplanationCard(card, context);
}

async function explainSelection() {
  setDeepReadActive(true);
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
  if (!text) dismissedSelectionText = "";
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
    if (guide && sourceMap !== currentMap) {
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
  if (!event.target.closest?.(`#${LENS_PANEL_ID}, #${LENS_ACTION_ID}`)) setLensPanelOpen(false);
  if (!event.target.closest?.(`#${SMART_OVERVIEW_ID}, #${SMART_ACTION_ID}`)) {
    setSmartOverviewOpen(false);
  }
  if (!event.target.closest?.(`#${CRITICAL_OVERVIEW_ID}, #${CRITICAL_ACTION_ID}`)) {
    setCriticalOverviewOpen(false);
  }
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
    const previous = globalThis.DeepReadSourceMapping?.getCurrentMap?.();
    const sourceMap = buildSourceMapSafely();
    if (sourceMap === previous) return;
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
    const hasExternalChange = mutations.some(mutation => !isDeepReadNode(mutation.target) &&
      (mutation.type === "characterData" || [...mutation.addedNodes, ...mutation.removedNodes].some(node => !isDeepReadNode(node))));
    if (hasExternalChange) {
      scheduleGuideRefresh();
      scheduleMarginLayout();
    }
  });
  dynamicObserver.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  observeOpenSourceRoots();
  let readingPageLocation = `${location.pathname}${location.search}`;
  window.addEventListener("popstate", () => {
    const nextLocation = `${location.pathname}${location.search}`;
    if (nextLocation === readingPageLocation) return;
    readingPageLocation = nextLocation;
    scheduleGuideRefresh();
  });
  // Anchor navigation does not change the Source Map. Actual SPA content
  // changes are observed above, so an ordinary #link must not erase Lens caches.
}

function observeOpenSourceRoots() {
  const roots = globalThis.DeepReadSourceMapping?.getCurrentMap?.()?.openShadowRoots || [];
  for (const root of roots) dynamicObserver?.observe(root, { childList: true, characterData: true, subtree: true });
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
    if (shell?.dataset.detail === "focus") {
      shell.querySelector("#deepread-focus-panel").hidden = true;
      shell.dataset.detail = "none";
      shell.querySelector("#deepread-focus-action").focus({ preventScroll: true });
    }
    setSmartOverviewOpen(false);
    setCriticalOverviewOpen(false);
    setLensPanelOpen(false);
    dismissedSelectionText = window.getSelection()?.toString().trim() || "";
    dismissSelectionAction();
    removeExplanationCard();
    const focusedTrace = document.activeElement?.closest(".deepread-source-annotation");
    collapseOpenReadingTraces();
    focusedTrace?.querySelector(".deepread-trace-toggle")?.focus({ preventScroll: true });
    if (shell?.dataset.detail === "trace") shell.dataset.detail = "none";
    updateTrailHierarchy();
    if (atlasIsOpen) {
      setGuideExpanded(shell, false);
    }
    clearSourcePeek();
    scheduleMarginLayout();
    return;
  }
});
window.addEventListener("scroll", () => {
  setLensPanelOpen(false);
  setSmartOverviewOpen(false);
  setCriticalOverviewOpen(false);
  dismissSelectionAction();
  removeExplanationCard();
  scheduleMarginLayout();
  positionSourcePeek();
  positionFocusPanel();
  const guide = document.getElementById(GUIDE_ID);
  if (guide) updateActiveStructureNode(guide);
}, { passive: true });
window.addEventListener("resize", () => {
  scheduleMapLayout();
  scheduleMarginLayout();
  positionSourcePeek();
  positionSmartOverview();
  positionFocusPanel();
}, { passive: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TOGGLE_DEEPREAD_GUIDE") {
    toggleGuide();
    sendResponse({ ok: true, context: getPageContext() });
  }
});

initializeDeepRead();
