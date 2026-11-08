import { useLanguage } from "../context/LanguageContext.jsx";

// Render a static English interface phrase in the currently selected language.
function LocalizedText({ text }) {
  const { t } = useLanguage();
  return t(text);
}

export default LocalizedText;
