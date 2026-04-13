import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";
import ar from "./locales/ar.json";
import hi from "./locales/hi.json";
import ko from "./locales/ko.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    pt: { translation: pt },
    ja: { translation: ja },
    zh: { translation: zh },
    ar: { translation: ar },
    hi: { translation: hi },
    ko: { translation: ko },
  },
  lng: localStorage.getItem("gainedge_language") || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
