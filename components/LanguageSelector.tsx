import React, { useState, useRef, useEffect } from 'react';
import { Language, supportedLanguages } from '../i18n';

interface LanguageSelectorProps {
    language: Language;
    setLanguage: (lang: Language) => void;
    inQuiz?: boolean;
}

const LanguageSelector = ({ language, setLanguage, inQuiz = false }: LanguageSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const currentLang = supportedLanguages.find(l => l.code === language) || supportedLanguages[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);
    
    const handleSelect = (langCode: Language) => {
        setLanguage(langCode);
        setIsOpen(false);
    };

    const buttonClasses = inQuiz 
        ? "p-2 rounded-full bg-slate-700/80 hover:bg-slate-600 text-white transition-colors flex items-center gap-2"
        : "bg-slate-700/50 hover:bg-slate-600/80 text-white font-semibold py-2 px-4 rounded-full shadow-md transition-all duration-300 ease-in-out transform hover:scale-105 flex items-center gap-2";

    const dropdownClasses = inQuiz
        ? "absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-xl"
        : "absolute top-full right-0 mt-2 w-48 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg shadow-xl";

    return (
        <div className="relative inline-block text-left" ref={wrapperRef}>
            <div>
                <button
                    type="button"
                    className={buttonClasses}
                    id="options-menu"
                    aria-haspopup="true"
                    aria-expanded="true"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span className="text-xl">{currentLang.flag}</span>
                    {!inQuiz && <span className="hidden sm:inline">{currentLang.name}</span>}
                    {!inQuiz && (
                        <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            </div>

            {isOpen && (
                <div className={`${dropdownClasses} z-50`}>
                    <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                        {supportedLanguages.map(lang => (
                            <button
                                key={lang.code}
                                onClick={() => handleSelect(lang.code)}
                                className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 hover:text-cyan-300 transition-colors"
                                role="menuitem"
                            >
                                <span className="text-xl">{lang.flag}</span>
                                <span>{lang.name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LanguageSelector;
