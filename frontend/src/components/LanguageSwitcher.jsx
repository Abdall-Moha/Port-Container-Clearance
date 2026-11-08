import { useLanguage } from "../context/LanguageContext.jsx";

// Let visitors and signed-in users change the shared interface language.
function LanguageSwitcher({ dark = false }) {
  const { language, setLanguage, t } = useLanguage();
  const style = dark
    ? "border-white/20 text-white"
    : "border-slate-200 bg-white text-slate-700";
  return (
    <label
      className={
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold " +
        style
      }
    >
      <span className="sr-only">{t("Choose language")}</span>
      <select
        aria-label={t("Choose language")}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        className="cursor-pointer bg-transparent outline-none"
      >
        <option value="en">English</option>
        <option value="so">Somali</option>
      </select>
    </label>
  );
}

export default LanguageSwitcher;
