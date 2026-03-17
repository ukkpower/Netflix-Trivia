(function () {
  const FALLBACK_LANG = "en";
  const CATEGORY_KEY_MAP = {
    General: "general",
    Sports: "sports",
    Entertainment: "entertainment",
    History: "history",
    Science: "science",
    Geography: "geography",
    Decades: "decades",
    Politics: "politics",
    Mythology: "mythology"
  };
  const loaderScriptUrl = document.currentScript?.src
    ? new URL(document.currentScript.src, window.location.href)
    : new URL(window.location.href);

  let currentLang = FALLBACK_LANG;
  let currentTranslations = {};
  let defaultTranslations = {};
  let initPromise = null;

  function getNestedValue(source, path) {
    if (!source || typeof source !== "object" || !path) {
      return undefined;
    }

    return path.split(".").reduce((value, segment) => {
      if (value && typeof value === "object" && segment in value) {
        return value[segment];
      }

      return undefined;
    }, source);
  }

  function interpolate(template, vars) {
    if (typeof template !== "string") {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        return String(vars[key]);
      }

      return match;
    });
  }

  async function loadTranslations(lang) {
    const localeUrl = new URL(`./${lang}.json`, loaderScriptUrl);
    const response = await fetch(localeUrl);

    if (!response.ok) {
      throw new Error(`Failed to load locale ${lang}: ${response.status}`);
    }

    return response.json();
  }

  function normalizeSupportedLangs(supportedLangs) {
    return supportedLangs
      .map((lang) => String(lang || "").toLowerCase())
      .filter(Boolean);
  }

  function resolveRequestedLang(supportedLangs, defaultLang) {
    const params = new URLSearchParams(window.location.search);
    const requestedLang = String(params.get("lang") || "").toLowerCase();

    if (supportedLangs.includes(requestedLang)) {
      return requestedLang;
    }

    return defaultLang;
  }

  function t(key, vars = {}) {
    const value =
      getNestedValue(currentTranslations, key) ?? getNestedValue(defaultTranslations, key);

    if (typeof value === "string") {
      return interpolate(value, vars);
    }

    if (typeof value === "number") {
      return String(value);
    }

    return key;
  }

  function getResolvedTranslation(key, vars = {}) {
    const translatedValue = t(key, vars);
    return translatedValue === key ? null : translatedValue;
  }

  function applyTranslation(root, selector, callback) {
    if (!root) {
      return;
    }

    if (typeof root.matches === "function" && root.matches(selector)) {
      callback(root);
    }

    if (typeof root.querySelectorAll === "function") {
      root.querySelectorAll(selector).forEach(callback);
    }
  }

  function apply(root = document) {
    applyTranslation(root, "[data-i18n]", (element) => {
      const translatedValue = getResolvedTranslation(element.dataset.i18n);
      if (translatedValue !== null) {
        element.textContent = translatedValue;
      }
    });

    applyTranslation(root, "[data-i18n-html]", (element) => {
      const translatedValue = getResolvedTranslation(element.dataset.i18nHtml);
      if (translatedValue !== null) {
        element.innerHTML = translatedValue;
      }
    });

    applyTranslation(root, "[data-i18n-aria-label]", (element) => {
      const translatedValue = getResolvedTranslation(element.dataset.i18nAriaLabel);
      if (translatedValue !== null) {
        element.setAttribute("aria-label", translatedValue);
      }
    });

    applyTranslation(root, "[data-i18n-data-description]", (element) => {
      const translatedValue = getResolvedTranslation(element.dataset.i18nDataDescription);
      if (translatedValue !== null) {
        element.setAttribute("data-description", translatedValue);
      }
    });

    applyTranslation(root, "[data-i18n-alt]", (element) => {
      const translatedValue = getResolvedTranslation(element.dataset.i18nAlt);
      if (translatedValue !== null) {
        element.setAttribute("alt", translatedValue);
      }
    });

    applyTranslation(root, "[data-i18n-placeholder]", (element) => {
      const translatedValue = getResolvedTranslation(element.dataset.i18nPlaceholder);
      if (translatedValue !== null) {
        element.setAttribute("placeholder", translatedValue);
      }
    });
  }

  function translateCategory(value) {
    if (typeof value !== "string") {
      return value;
    }

    const normalizedValue = value.trim();
    const categoryKey = CATEGORY_KEY_MAP[normalizedValue];

    if (!categoryKey) {
      return value;
    }

    return t(`categories.${categoryKey}.label`);
  }

  async function init(options = {}) {
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      const supportedLangs = normalizeSupportedLangs(options.supportedLangs || [FALLBACK_LANG]);
      const defaultLang = supportedLangs.includes(String(options.defaultLang || "").toLowerCase())
        ? String(options.defaultLang).toLowerCase()
        : FALLBACK_LANG;
      const requestedLang = resolveRequestedLang(supportedLangs, defaultLang);

      currentLang = requestedLang;

      try {
        defaultTranslations = await loadTranslations(defaultLang);
      } catch (error) {
        console.error("Failed to load default locale:", error);
        defaultTranslations = {};
      }

      if (requestedLang === defaultLang) {
        currentTranslations = defaultTranslations;
      } else {
        try {
          currentTranslations = await loadTranslations(requestedLang);
        } catch (error) {
          console.error(`Failed to load locale "${requestedLang}", falling back to English:`, error);
          currentTranslations = defaultTranslations;
          currentLang = defaultLang;
        }
      }

      const titleKey = typeof options.titleKey === "string" && options.titleKey
        ? options.titleKey
        : "meta.title";
      const translatedTitle = t(titleKey);
      if (translatedTitle && translatedTitle !== titleKey) {
        document.title = translatedTitle;
      }

      document.documentElement.lang = currentLang;
      return currentTranslations;
    })();

    return initPromise;
  }

  window.i18n = {
    init,
    t,
    apply,
    translateCategory,
    getLocale() {
      return currentLang;
    }
  };
})();
