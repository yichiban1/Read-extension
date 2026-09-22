// DeepRead source mapping foundation.
// This maps useful elements in the live page. Readability's cloned document
// remains an extraction aid, but it is never used as a navigation target.

(() => {
  const SOURCE_ATTRIBUTE = "data-deepread-source-id";
  const SOURCE_ID_PREFIX = "deepread-source-";
  const GUIDE_ID = "deepread-guide";
  const SOURCE_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre";
  const SEMANTIC_SELECTORS = ["main", "article", '[role="main"]'];
  const FALLBACK_SELECTOR = "section, div";
  const MIN_SUBSTANTIAL_ARTICLE_CHARS = 200;
  const MIN_SUBSTANTIAL_ARTICLE_BLOCKS = 2;
  const MIN_DENSITY_REGION_CHARS = 300;
  const MIN_DENSITY_REGION_BLOCKS = 3;
  const HIGHLIGHT_CLASS = "deepread-source-highlight";
  const HIGHLIGHT_DURATION = 1600;

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
    /(?:adsbygoogle|advert|advertisement|sponsor|cookie|consent|gdpr|newsletter|subscribe|popup|modal|utility|toolbar|social[-_ ]?share|share[-_ ]?buttons|comments?|discussion|related[-_ ]?(?:content|articles?)?|recommended|read[-_ ]?next|more[-_ ]?from)/i;

  let currentMap = null;
  let previousMappedElements = [];
  let highlightedElement = null;
  let highlightTimer = null;

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function getElementName(element) {
    const className =
      typeof element.className === "string"
        ? element.className
        : element.getAttribute("class") || "";
    return `${element.id || ""} ${className}`.trim();
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
      (element.closest && element.closest(`#${GUIDE_ID}`))
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
      current = current.parentElement;
    }
    return false;
  }

  function isExcludedRegionRoot(root) {
    let current = root;
    while (current) {
      if (hasExcludedMarker(current)) {
        return true;
      }
      current = current.parentElement;
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

  function isRedundantNestedElement(element, selectedElements) {
    const elementText = normalizeText(element.textContent);
    if (!elementText) {
      return true;
    }

    let ancestor = element.parentElement;
    while (ancestor) {
      if (selectedElements.includes(ancestor)) {
        const ancestorTag = ancestor.tagName.toLowerCase();
        const ancestorText = normalizeText(ancestor.textContent);
        const nestedParagraph =
          element.tagName.toLowerCase() === "p" &&
          ["li", "blockquote", "pre"].includes(ancestorTag);

        return (
          elementText === ancestorText ||
          (nestedParagraph && ancestorText.includes(elementText))
        );
      }
      ancestor = ancestor.parentElement;
    }

    return false;
  }

  function collectReadableElements(root) {
    const selectedElements = [];
    const candidates = root.querySelectorAll(SOURCE_SELECTOR);

    for (const element of candidates) {
      if (
        !isVisible(element) ||
        isExcludedFromRoot(element, root) ||
        !getSourceText(element) ||
        isRedundantNestedElement(element, selectedElements)
      ) {
        continue;
      }
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

    return length;
  }

  function getRegionMetrics(root) {
    const elements = collectReadableElements(root);
    const textLength = elements.reduce(
      (total, element) => total + normalizeText(getSourceText(element)).length,
      0
    );
    const visibleTextLength = Math.max(getVisibleTextLength(root), 1);

    return {
      root,
      elements,
      textLength,
      blockCount: elements.length,
      density: textLength / visibleTextLength
    };
  }

  function isSubstantialArticle(metrics) {
    return (
      metrics.textLength >= MIN_SUBSTANTIAL_ARTICLE_CHARS &&
      metrics.blockCount >= MIN_SUBSTANTIAL_ARTICLE_BLOCKS
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
      for (const element of document.querySelectorAll(selector)) {
        if (isExcludedRegionRoot(element)) {
          continue;
        }
        semanticCandidates.push(getRegionMetrics(element));
      }
    }

    const substantialArticles = semanticCandidates.filter(
      (metrics) =>
        metrics.root.tagName.toLowerCase() === "article" &&
        isSubstantialArticle(metrics)
    );
    if (substantialArticles.length > 0) {
      return chooseLongest(substantialArticles);
    }

    const substantialSemanticCandidates = semanticCandidates.filter(
      (metrics) => isSubstantialArticle(metrics)
    );
    if (substantialSemanticCandidates.length > 0) {
      return chooseLongest(substantialSemanticCandidates);
    }

    return chooseLongest(
      semanticCandidates.filter((metrics) => metrics.blockCount > 0)
    );
  }

  function findDensityRegion() {
    const candidates = [];
    for (const element of document.querySelectorAll(FALLBACK_SELECTOR)) {
      if (isExcludedRegionRoot(element)) {
        continue;
      }

      const metrics = getRegionMetrics(element);
      if (
        metrics.textLength >= MIN_DENSITY_REGION_CHARS &&
        metrics.blockCount >= MIN_DENSITY_REGION_BLOCKS
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
    return (
      findSemanticRegion() ||
      findDensityRegion() ||
      getRegionMetrics(document.body)
    );
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

  function buildSourceMap() {
    clearHighlight();
    clearPreviousSourceIds();

    const region = findReadingRegion();
    const elementsById = new Map();
    const sources = region.elements.map((element, index) => {
      const id = `${SOURCE_ID_PREFIX}${index + 1}`;
      const tag = element.tagName.toLowerCase();
      const text = getSourceText(element);
      element.setAttribute(SOURCE_ATTRIBUTE, id);
      elementsById.set(id, element);
      return { id, tag, text };
    });

    previousMappedElements = region.elements.slice();
    currentMap = {
      root: region.root,
      sources,
      elementsById
    };
    return currentMap;
  }

  function getCurrentMap() {
    return currentMap;
  }

  function scrollToSourceId(sourceId) {
    const element = currentMap && currentMap.elementsById.get(sourceId);
    if (!element || !element.isConnected) {
      return false;
    }

    clearHighlight();
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
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
    scrollToSourceId
  });
})();
