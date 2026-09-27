// DeepRead source mapping foundation. Source targets are live page elements.

(() => {
  const SOURCE_ATTRIBUTE = "data-deepread-source-id";
  const SOURCE_ID_PREFIX = "deepread-source-";
  const GUIDE_ID = "deepread-guide";
  const SHELL_ID = "deepread-shell";
  const SELECTION_ACTION_ID = "deepread-selection-action";
  const SOURCE_SELECTOR =
    "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td, th, dt, dd, figcaption, [role=\"heading\"]";
  const GENERIC_SELECTOR = "div, span";
  const SEMANTIC_SELECTORS = ["main", "article", '[role="main"]'];
  const FALLBACK_SELECTOR = "section, div";
  const MIN_SUBSTANTIAL_ARTICLE_CHARS = 200;
  const MIN_SUBSTANTIAL_ARTICLE_BLOCKS = 2;
  const MIN_DENSITY_REGION_CHARS = 300;
  const MIN_DENSITY_REGION_BLOCKS = 3;
  const MIN_GENERIC_TEXT_CHARS = 40;
  const MIN_GENERIC_DIRECT_TEXT_CHARS = 24;
  const MAX_LINK_DENSITY = 0.55;
  const HIGHLIGHT_CLASS = "deepread-source-highlight";
  const HIGHLIGHT_DURATION = 6000;

  const EXCLUDED_TAGS = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "nav",
    "footer",
    "aside",
    "form"
  ]);

  const EXCLUDED_ROLES = new Set([
    "navigation",
    "contentinfo",
    "complementary",
    "form",
    "dialog",
    "alertdialog",
    "toolbar",
    "banner",
    "search"
  ]);

  const EXCLUDED_NAME_PATTERN =
    /(?:^|[-_\s])ads?(?:[-_\s]|$)|(?:adsbygoogle|advert|advertisement|sponsor|cookie|consent|gdpr|newsletter|subscribe|popup|modal|utility|toolbar|social[-_ ]?share|share[-_ ]?buttons|comments?|discussion|related[-_ ]?(?:content|articles?)?|recommended|read[-_ ]?next|more[-_ ]?from)/i;

  let currentMap = null;
  let metricsCache = new WeakMap();
  let previousMappedElements = [];
  let highlightedElement = null;
  let highlightTimer = null;

  // Traverse only open roots, preserving host position and live Element anchors.
  function composedParent(element) {
    return element.parentElement || element.getRootNode?.().host || null;
  }

  function queryDeep(root, selector) {
    const result = [], seen = new Set();
    function visit(element) {
      if (seen.has(element) || hasExcludedMarker(element)) return;
      seen.add(element);
      if (element.matches(selector)) result.push(element);
      if (element.tagName === "SLOT") {
        const assigned = element.assignedElements({ flatten: true });
        if (assigned.length) { assigned.forEach(visit); return; }
      }
      walk(element.shadowRoot || element);
    }
    function walk(container) {
      for (const element of container.children || []) visit(element);
    }
    walk(root.shadowRoot || root);
    return result;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function getElementName(element) {
    const className =
      typeof element.className === "string"
        ? element.className
        : element.getAttribute("class") || "";
    return `${element.id || ""} ${className} ${element.getAttribute("aria-label") || ""}`.trim();
  }

  function hasExcludedMarker(element) {
    const tagName = element.tagName && element.tagName.toLowerCase();
    if (EXCLUDED_TAGS.has(tagName)) {
      return true;
    }

    const role = (element.getAttribute("role") || "").toLowerCase();
    if (EXCLUDED_ROLES.has(role)) {
      return true;
    }

    if (
      element.id === GUIDE_ID ||
      element.id === SHELL_ID ||
      element.id === SELECTION_ACTION_ID ||
      (element.closest &&
        element.closest(`#${GUIDE_ID}, #${SHELL_ID}, #${SELECTION_ACTION_ID}`))
    ) {
      return true;
    }

    return EXCLUDED_NAME_PATTERN.test(getElementName(element));
  }

  function isVisible(element) {
    if (
      element.hidden ||
      element.getAttribute("aria-hidden") === "true" ||
      !element.ownerDocument.defaultView
    ) {
      return false;
    }

    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      element.getClientRects().length > 0
    );
  }

  function isExcludedFromRoot(element, root) {
    let current = element;
    while (current) {
      if (hasExcludedMarker(current)) {
        return true;
      }
      if (current === root) {
        break;
      }
      current = composedParent(current);
    }
    return false;
  }

  function isExcludedRegionRoot(root) {
    let current = root;
    while (current) {
      if (hasExcludedMarker(current)) {
        return true;
      }
      current = composedParent(current);
    }
    return false;
  }

  function getSourceText(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "pre") {
      return (element.textContent || "").replace(/\r\n?/g, "\n").trim();
    }
    return normalizeText(element.textContent);
  }

  function getDirectTextLength(element) {
    let length = 0;
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        length += normalizeText(node.nodeValue).length;
      }
    }
    return length;
  }

  function isGenericTextCandidate(element) {
    const sourceText = getSourceText(element);
    if (sourceText.length < MIN_GENERIC_TEXT_CHARS) {
      return false;
    }

    // A generic wrapper around a known block is not itself a source.
    if (queryDeep(element, SOURCE_SELECTOR).length) {
      return false;
    }

    // Prefer the smallest meaningful generic text block. This keeps cards,
    // layout wrappers and nested div/span copies from being mapped twice.
    const meaningfulGenericDescendant = Array.from(
      queryDeep(element, GENERIC_SELECTOR)
    ).some(
      (descendant) =>
        getSourceText(descendant).length >= MIN_GENERIC_TEXT_CHARS &&
        getDirectTextLength(descendant) >= MIN_GENERIC_DIRECT_TEXT_CHARS
    );
    if (meaningfulGenericDescendant) {
      return false;
    }

    return (
      getDirectTextLength(element) >= MIN_GENERIC_DIRECT_TEXT_CHARS ||
      element.children.length === 0
    );
  }

  function isRedundantNestedElement(element, selectedElements) {
    const elementText = normalizeText(element.textContent);
    if (!elementText) {
      return true;
    }

    let ancestor = composedParent(element);
    while (ancestor) {
      if (selectedElements.includes(ancestor)) {
        const ancestorText = normalizeText(ancestor.textContent);
        const nestedReadableElement = [
          "p",
          "li",
          "blockquote",
          "pre",
          "div",
          "span"
        ].includes(element.tagName.toLowerCase());

        return (
          elementText === ancestorText ||
          (nestedReadableElement && ancestorText.includes(elementText))
        );
      }
      ancestor = composedParent(ancestor);
    }

    return false;
  }

  function collectReadableElements(root, includeGeneric = false) {
    const selectors = includeGeneric
      ? `${SOURCE_SELECTOR}, ${GENERIC_SELECTOR}`
      : SOURCE_SELECTOR;
    const candidates = queryDeep(root, selectors);
    const selectedElements = [];
    const seenTexts = new Set();

    for (const element of candidates) {
      const isKnownCandidate = element.matches(SOURCE_SELECTOR);
      if (
        !isVisible(element) ||
        isExcludedFromRoot(element, root) ||
        !getSourceText(element) ||
        isRedundantNestedElement(element, selectedElements) ||
        (!isKnownCandidate && !isGenericTextCandidate(element))
      ) {
        continue;
      }

      // Short repeated generic blocks are usually controls or repeated cards.
      // Keep repeated article paragraphs; only apply this guard to generic UI.
      const normalizedText = normalizeText(getSourceText(element));
      if (
        !isKnownCandidate &&
        normalizedText.length < 120 &&
        seenTexts.has(normalizedText)
      ) {
        continue;
      }

      seenTexts.add(normalizedText);
      selectedElements.push(element);
    }

    return selectedElements;
  }

  function getVisibleTextLength(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let length = 0;
    let node = walker.nextNode();

    while (node) {
      const parent = node.parentElement;
      if (
        parent &&
        isVisible(parent) &&
        !isExcludedFromRoot(parent, root)
      ) {
        length += normalizeText(node.nodeValue).length;
      }
      node = walker.nextNode();
    }

    for (const host of root.querySelectorAll("*")) {
      if (host.shadowRoot && isVisible(host) && !isExcludedFromRoot(host, root)) length += getVisibleTextLength(host.shadowRoot);
    }
    return length;
  }

  function getLinkTextLength(root) {
    const links = queryDeep(root, "a");
    return Array.from(links).reduce((total, link) => {
      if (!isVisible(link) || isExcludedFromRoot(link, root)) {
        return total;
      }
      return total + normalizeText(link.textContent).length;
    }, 0);
  }

  function getRegionMetrics(root, includeGeneric = false) {
    if (includeGeneric && metricsCache.has(root)) return metricsCache.get(root);
    const elements = collectReadableElements(root, includeGeneric);
    const textLength = elements.reduce(
      (total, element) => total + normalizeText(getSourceText(element)).length,
      0
    );
    const visibleTextLength = Math.max(getVisibleTextLength(root), 1);
    const linkDensity = Math.min(
      1,
      getLinkTextLength(root) / visibleTextLength
    );

    const metrics = {
      root,
      elements,
      textLength,
      blockCount: elements.length,
      density: textLength / visibleTextLength,
      linkDensity
    };
    if (includeGeneric) metricsCache.set(root, metrics);
    return metrics;
  }

  function isSubstantialArticle(metrics) {
    return (
      metrics.textLength >= MIN_SUBSTANTIAL_ARTICLE_CHARS &&
      metrics.blockCount >= MIN_SUBSTANTIAL_ARTICLE_BLOCKS &&
      metrics.linkDensity <= MAX_LINK_DENSITY
    );
  }

  function chooseLongest(metricsList) {
    return metricsList.reduce((best, metrics) => {
      if (!best || metrics.textLength > best.textLength) {
        return metrics;
      }
      return best;
    }, null);
  }

  function findSemanticRegion() {
    const semanticCandidates = [];

    for (const selector of SEMANTIC_SELECTORS) {
      for (const element of queryDeep(document.body, selector)) {
        if (isExcludedRegionRoot(element)) {
          continue;
        }
        semanticCandidates.push(getRegionMetrics(element, true));
      }
    }

    // Prefer a substantial article over a broader main that may also contain
    // related stories, comments or other page material.
    const substantialArticles = semanticCandidates.filter(
      (metrics) =>
        metrics.root.tagName.toLowerCase() === "article" &&
        isSubstantialArticle(metrics)
    );
    if (substantialArticles.length > 0) {
      return chooseLongest(substantialArticles);
    }

    const substantialSemanticCandidates = semanticCandidates.filter(
      isSubstantialArticle
    );
    if (substantialSemanticCandidates.length > 0) {
      return chooseLongest(substantialSemanticCandidates);
    }

    return chooseLongest(
      semanticCandidates.filter(
        (metrics) => metrics.blockCount > 0 && metrics.linkDensity <= MAX_LINK_DENSITY
      )
    );
  }

  function findDensityRegion() {
    const candidates = [];
    for (const element of queryDeep(document.body, FALLBACK_SELECTOR)) {
      if (isExcludedRegionRoot(element)) {
        continue;
      }

      const metrics = getRegionMetrics(element, true);
      // The minimum text and block count keeps a tiny card or control cluster
      // from winning only because it has a high local density.
      if (
        metrics.textLength >= MIN_DENSITY_REGION_CHARS &&
        metrics.blockCount >= MIN_DENSITY_REGION_BLOCKS &&
        metrics.linkDensity <= MAX_LINK_DENSITY
      ) {
        candidates.push(metrics);
      }
    }

    return candidates.sort((left, right) => {
      if (right.density !== left.density) {
        return right.density - left.density;
      }
      return right.textLength - left.textLength;
    })[0] || null;
  }

  function findReadingRegion() {
    const region = (
      findSemanticRegion() ||
      findDensityRegion() ||
      getRegionMetrics(document.body, true)
    );
    const hasLensContent = (metrics) => {
      const passages = metrics.elements.map(getSourceText).filter(text => text.trim().length >= 36);
      return passages.length >= 2 && passages.reduce((total, text) => total + Math.min(700, text.length), 0) >= 240;
    };
    const baseline = getRegionMetrics(document.body, true);
    const coverage = baseline.textLength ? region.textLength / baseline.textLength : 1;
    region.coverage = coverage;
    region.usefulTextLength = baseline.textLength;
    if (hasLensContent(region) && coverage >= 0.6) return region;
    // A tiny semantic article may sit inside a larger, coherent main. Try the
    // nearest safe ancestors, keeping the same exclusions and quality gates.
    let bestBroader = null;
    let ancestor = composedParent(region.root);
    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = composedParent(ancestor)) {
      if (ancestor.tagName === "HTML" || isExcludedRegionRoot(ancestor)) break;
      const broader = getRegionMetrics(ancestor, true);
      if (hasLensContent(broader) && broader.linkDensity <= MAX_LINK_DENSITY && broader.density >= 0.5 && broader.textLength > region.textLength * 1.25) {
        broader.fallbackReason = hasLensContent(region) ? "low-coverage-broader-region" : "broader-readable-region";
        broader.coverage = baseline.textLength ? broader.textLength / baseline.textLength : 1;
        broader.usefulTextLength = baseline.textLength;
        bestBroader = broader;
        if (broader.coverage >= 0.6) return broader;
      }
      if (ancestor === document.body) break;
    }
    // Deeply nested semantic roots can exceed the bounded ancestor search.
    // The broader body strategy keeps exactly the same exclusions and gates.
    if (coverage < 0.6 && hasLensContent(baseline) && baseline.linkDensity <= MAX_LINK_DENSITY && baseline.density >= 0.5 && baseline.textLength > region.textLength * 1.25) {
      baseline.fallbackReason = "low-coverage-body-region";
      baseline.coverage = 1;
      baseline.usefulTextLength = baseline.textLength;
      return baseline;
    }
    return bestBroader || region;
  }

  function clearPreviousSourceIds() {
    for (const element of previousMappedElements) {
      element.removeAttribute(SOURCE_ATTRIBUTE);
    }

    document.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`).forEach((element) => {
      const value = element.getAttribute(SOURCE_ATTRIBUTE) || "";
      if (value.startsWith(SOURCE_ID_PREFIX)) {
        element.removeAttribute(SOURCE_ATTRIBUTE);
      }
    });

    previousMappedElements = [];
  }

  function clearHighlight() {
    if (highlightTimer !== null) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
    if (highlightedElement) {
      highlightedElement.classList.remove(HIGHLIGHT_CLASS);
      highlightedElement = null;
    }
  }

  function getHeadingLevel(element) {
    const tagName = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tagName)) {
      return Number(tagName.slice(1));
    }

    if ((element.getAttribute("role") || "").toLowerCase() === "heading") {
      const level = Number(element.getAttribute("aria-level"));
      return Number.isInteger(level) && level >= 1 && level <= 6
        ? level
        : null;
    }

    return null;
  }

  function getSourceDescriptor(element) {
    const headingLevel = getHeadingLevel(element);
    return {
      id: "",
      tag: element.tagName.toLowerCase(),
      text: getSourceText(element),
      level: headingLevel || 0
    };
  }

  function buildSourceMap() {
    metricsCache = new WeakMap();
    const region = findReadingRegion();
    if (currentMap && currentMap.root === region.root && currentMap.sources.length === region.elements.length &&
      region.elements.every((element, index) => {
        const source = currentMap.sources[index];
        return currentMap.elementsById.get(source.id) === element && source.text === getSourceText(element) && source.level === (getHeadingLevel(element) || 0);
      })) {
      currentMap.coverage = region.coverage ?? 1;
      currentMap.usefulTextLength = region.usefulTextLength ?? region.textLength;
      currentMap.openShadowRoots = getReadingShadowRoots();
      return currentMap;
    }
    clearHighlight();
    clearPreviousSourceIds();
    const elementsById = new Map();
    const sources = region.elements.map((element, index) => {
      const id = `${SOURCE_ID_PREFIX}${index + 1}`;
      const source = getSourceDescriptor(element);
      source.id = id;
      element.setAttribute(SOURCE_ATTRIBUTE, id);
      const root = element.getRootNode();
      if (root.host && !root.querySelector("style[data-deepread-shadow-style]")) {
        const style = document.createElement("style");
        style.dataset.deepreadShadowStyle = "true";
        style.textContent = ".deepread-focus-source,.deepread-source-highlight{outline:2px solid #9c573e80!important;outline-offset:5px;background-color:#b78b4220!important;scroll-margin-top:100px}";
        root.append(style);
      }
      elementsById.set(id, element);
      return source;
    });

    previousMappedElements = region.elements.slice();
    currentMap = {
      root: region.root,
      sources,
      elementsById,
      fallbackReason: region.fallbackReason || null,
      coverage: region.coverage ?? 1,
      usefulTextLength: region.usefulTextLength ?? region.textLength,
      openShadowRoots: []
    };
    currentMap.openShadowRoots = getReadingShadowRoots();
    return currentMap;
  }

  function getCurrentMap() {
    return currentMap;
  }

  // Reactivation checks only the cached reading region, without re-running
  // the body-wide candidate scoring and coverage calculation.
  function isCurrentMapValid() {
    if (!currentMap?.root?.isConnected) return false;
    metricsCache = new WeakMap();
    const elements = collectReadableElements(currentMap.root, true);
    return elements.length === currentMap.sources.length && elements.every((element, index) => {
      const source = currentMap.sources[index];
      return currentMap.elementsById.get(source.id) === element && source.text === getSourceText(element) &&
        source.level === (getHeadingLevel(element) || 0);
    });
  }

  function containsComposed(root, element) {
    for (let current = element; current; current = composedParent(current)) if (current === root) return true;
    return false;
  }

  function getReadingShadowRoots() {
    const root = currentMap?.root;
    if (!root?.isConnected) return [];
    const hosts = [root, ...queryDeep(root, "*")];
    return hosts.filter(element => element.shadowRoot && !isExcludedFromRoot(element, root)).map(element => element.shadowRoot);
  }

  function isRelevantMutation(mutation) {
    const root = currentMap?.root;
    if (!root?.isConnected) return true; // Ancestor sentinel detected replacement.
    const target = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
    if (!target || !containsComposed(root, target) || isExcludedFromRoot(target, root)) return false;
    for (let element = target; element && element !== root; element = composedParent(element)) {
      // Live UI (including clocks/counters) isn't reading material. Do not
      // ignore numerical prose or table values just because they are numbers.
      if (element.matches('button, input, select, textarea, time, [role="timer"], [role="status"], [aria-live]')) return false;
    }
    if (mutation.type === "attributes") return true; // Explicit structural attribute filter at caller.
    if (mutation.type === "characterData") {
      const inCode = Boolean(target.closest("pre"));
      if (inCode ? mutation.oldValue === mutation.target.textContent :
          normalizeText(mutation.oldValue) === normalizeText(mutation.target.textContent)) return false;
      return Boolean(target.closest(SOURCE_SELECTOR) || target.closest(`[${SOURCE_ATTRIBUTE}]`) ||
        getSourceText(target).length >= MIN_GENERIC_DIRECT_TEXT_CHARS);
    }
    const mapped = previousMappedElements;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
      if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent).length > 0 &&
        (target.matches(SOURCE_SELECTOR) || target.closest(`[${SOURCE_ATTRIBUTE}]`) || getSourceText(target).length >= MIN_GENERIC_DIRECT_TEXT_CHARS);
      if (node.nodeType !== Node.ELEMENT_NODE || hasExcludedMarker(node) ||
          node.matches('button, input, select, textarea, time, [role="timer"], [role="status"], [aria-live]')) return false;
      if (mapped.some(element => node === element || containsComposed(node, element))) return true;
      if (node.matches(SOURCE_SELECTOR) && getSourceText(node).length > 0) return true;
      return queryDeep(node, SOURCE_SELECTOR).some(element => !isExcludedFromRoot(element, node) && getSourceText(element).length > 0) ||
        (node.matches(GENERIC_SELECTOR) && getSourceText(node).length >= MIN_GENERIC_TEXT_CHARS);
    });
  }

  function scrollToSourceId(sourceId) {
    const element = currentMap && currentMap.elementsById.get(sourceId);
    if (!element || !element.isConnected) {
      return false;
    }

    clearHighlight();
    const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    element.scrollIntoView({ behavior, block: "center", inline: "nearest" });
    element.classList.add(HIGHLIGHT_CLASS);
    highlightedElement = element;
    highlightTimer = setTimeout(() => {
      if (highlightedElement === element) {
        element.classList.remove(HIGHLIGHT_CLASS);
        highlightedElement = null;
        highlightTimer = null;
      }
    }, HIGHLIGHT_DURATION);
    return true;
  }

  globalThis.DeepReadSourceMapping = Object.freeze({
    buildSourceMap,
    getCurrentMap,
    isCurrentMapValid,
    getReadingShadowRoots,
    isRelevantMutation,
    scrollToSourceId,
    clearHighlight
  });
})();
