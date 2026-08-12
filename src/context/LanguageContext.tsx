import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ar } from "../locales/ar";
import { en } from "../locales/en";
import { safeLocalStorage } from "../utils/safeStorage";

export type Language = "ar" | "en";

interface LanguageContextType {
  language: Language;
  dir: "rtl" | "ltr";
  isArabic: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (path: string, params?: Record<string, any>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const dictionaries: Record<Language, any> = { ar, en };

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = safeLocalStorage.getItem("app_language") as Language;
      if (saved === "ar" || saved === "en") return saved;
    }
    return "ar"; // Arabic is the mandatory default
  });

  const dir = language === "ar" ? "rtl" : "ltr";
  const isArabic = language === "ar";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = dir;
      if (document.body) {
        document.body.dir = dir;
      }
      safeLocalStorage.setItem("app_language", language);
    }
  }, [language, dir]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      safeLocalStorage.setItem("app_language", lang);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "ar" ? "en" : "ar");
  };

  const t = (path: string, params?: Record<string, any>): string => {
    const keys = path.split(".");
    let current: any = dictionaries[language] || dictionaries["ar"];

    for (const key of keys) {
      if (current && typeof current === "object" && key in current) {
        current = current[key];
      } else {
        // Fallback to English if key missing in dictionary
        let fallback: any = dictionaries["en"];
        for (const fk of keys) {
          if (fallback && typeof fallback === "object" && fk in fallback) {
            fallback = fallback[fk];
          } else {
            fallback = undefined;
            break;
          }
        }
        current = fallback || path;
        break;
      }
    }

    if (typeof current !== "string") {
      return path;
    }

    let result = current;
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        result = result.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, "g"), String(value));
      });
    }

    return result;
  };

  return (
    <LanguageContext.Provider value={{ language, dir, isArabic, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
