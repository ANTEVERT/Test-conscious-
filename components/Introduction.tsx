import React, { useState, useEffect } from 'react';
import { Language, t } from '../i18n';
import LanguageSelector from './LanguageSelector';
import { SavedResult } from '../App';

interface IntroductionProps {
  onStart: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  onViewSavedResult: (result: SavedResult) => void;
}

const Introduction = ({ onStart, language, setLanguage, onViewSavedResult }: IntroductionProps) => {
  const [savedResults, setSavedResults] = useState<SavedResult[]>([]);

  useEffect(() => {
    try {
      const results = JSON.parse(localStorage.getItem('quizSavedResults') || '[]');
      setSavedResults(results.sort((a: SavedResult, b: SavedResult) => b.timestamp - a.timestamp));
    } catch (error) {
      console.error("Failed to load saved results", error);
    }
  }, []);

  const handleClearResults = () => {
    if (window.confirm(t('confirm_clear_results', language))) {
        try {
            localStorage.removeItem('quizSavedResults');
            setSavedResults([]);
        } catch (error) {
            console.error("Failed to clear saved results", error);
        }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl w-full bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-12 border border-slate-700">
        
        <div className="absolute top-6 right-6 z-10 print-hidden">
            <LanguageSelector language={language} setLanguage={setLanguage} />
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500 mb-6 font-display text-center">
          {t('main_title', language)}
        </h1>
        <p className="text-lg sm:text-xl text-slate-300 mb-8 text-center">
          {t('main_subtitle', language)}
        </p>

        <div className="text-left bg-slate-900/70 p-6 rounded-lg border border-slate-700 space-y-4 mb-10">
          <h2 className="text-2xl font-bold text-cyan-400 font-display mb-4">{t('instruction_title', language)}</h2>
          <p className="text-slate-300">{t('instruction_1', language)}</p>
          <p className="text-slate-300">{t('instruction_2', language)}</p>
          <p className="text-slate-300"><strong className="text-cyan-300">{t('instruction_new_feature', language)}:</strong> {t('instruction_3', language)}</p>
          <p className="text-slate-300">{t('instruction_4', language)}</p>
          <p className="text-slate-300 pt-2">{t('instruction_5', language)}</p>
        </div>
        
        <div className="text-center">
            <button
              onClick={onStart}
              className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold text-xl py-4 px-10 rounded-full shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 ease-in-out transform hover:scale-105"
            >
              {t('start_quiz', language)}
            </button>
        </div>

        {savedResults.length > 0 && (
            <div className="mt-12 pt-8 border-t border-slate-700">
                <h2 className="text-2xl font-bold text-cyan-400 font-display mb-4 text-center">{t('saved_results_title', language)}</h2>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {savedResults.map((result) => (
                        <div key={result.timestamp} className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 flex justify-between items-center">
                            <span className="text-slate-300 font-medium">
                                {new Date(result.timestamp).toLocaleString(language, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button 
                                onClick={() => onViewSavedResult(result)}
                                className="bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-bold py-1 px-3 rounded-md transition-colors"
                            >
                                {t('view_button', language)}
                            </button>
                        </div>
                    ))}
                </div>
                <div className="text-center mt-6">
                    <button
                        onClick={handleClearResults}
                        className="text-red-400 hover:text-red-300 text-sm font-semibold transition-colors"
                    >
                        {t('clear_results_button', language)}
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default Introduction;