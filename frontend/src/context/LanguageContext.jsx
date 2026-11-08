import { createContext, useCallback, useContext, useMemo, useState } from "react";
import english from "../translations/en.js";
import somali from "../translations/so.js";

const LanguageContext = createContext(null);
const dictionaries = { en: english, so: somali };
const storageKey = "port-clearance-language";

// Read a saved language safely and default to English for new visitors.
function getInitialLanguage() {
  try {
    const savedLanguage = window.localStorage.getItem(storageKey);
    return savedLanguage === "so" || savedLanguage === "en"
      ? savedLanguage
      : "en";
  } catch {
    return "en";
  }
}

// Provide the selected language and translations throughout the application.
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  // Apply and persist a supported language immediately.
  const setLanguage = useCallback((nextLanguage) => {
    if (!Object.hasOwn(dictionaries, nextLanguage)) return;
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(storageKey, nextLanguage);
    } catch {
      // Keep the in-memory language choice for the current session.
    }
  }, []);

  // Translate a dictionary key, falling back to its English source text.
  const t = useCallback((key) => {
    return dictionaries[language][key] || key;
  }, [language]);

  // Choose an existing Somali or English field from a notification without altering API data.
  const localizeRecord = useCallback((record, englishField, somaliField) => {
    return language === "so"
      ? record?.[somaliField] || record?.[englishField] || ""
      : record?.[englishField] || "";
  }, [language]);

  // Format visible dates in the selected locale without changing stored values.
  const formatDate = useCallback((value, options = { dateStyle: "medium" }) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(
      language === "so" ? "so-SO" : "en-GB",
      options,
    ).format(date);
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t, formatDate, localizeRecord }),
    [language, setLanguage, t, formatDate, localizeRecord],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// Read the shared language tools from any application component.
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context)
    throw new Error("useLanguage must be used inside LanguageProvider.");
  return context;
}
