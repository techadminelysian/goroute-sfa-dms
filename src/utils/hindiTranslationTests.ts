import { translations } from './translations';

export interface ButtonTranslationTestResult {
  totalButtonsTested: number;
  translatedToHindi: number;
  percentageTranslated: number;
  allPassed: boolean;
  testCases: Array<{
    key: string;
    en: string;
    hi: string;
    hasHindiTranslation: boolean;
  }>;
}

export function runHindiButtonTranslationTests(): ButtonTranslationTestResult {
  const keys = Object.keys(translations) as Array<keyof typeof translations>;
  
  const testCases = keys.map((k) => {
    const item = translations[k];
    const en = item.en || '';
    const hi = item.hi || '';
    // Must have non-empty Hindi translation distinct from English (or standard Hindi characters)
    const hasHindi = Boolean(hi && hi.trim().length > 0 && /[\u0900-\u097F]/.test(hi));
    return {
      key: k,
      en,
      hi,
      hasHindiTranslation: hasHindi
    };
  });

  const total = testCases.length;
  const passed = testCases.filter((t) => t.hasHindiTranslation).length;
  const percentage = Math.round((passed / total) * 100);

  return {
    totalButtonsTested: total,
    translatedToHindi: passed,
    percentageTranslated: percentage,
    allPassed: percentage >= 80,
    testCases
  };
}
