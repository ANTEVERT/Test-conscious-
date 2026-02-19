import React, { useState, useEffect } from 'react';
import { Question, Answer, GeneratedOption } from '../types';
import { Language, t, getSpeechLang } from '../i18n';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (answer: Omit<Answer, 'remark'> & { remark: string }) => void;
  onNext: () => void;
  onPrevious: () => void;
  isFirst: boolean;
  isLast: boolean;
  currentAnswer?: Answer;
  currentOptions?: GeneratedOption[];
  isLoading: boolean;
  error: string | null;
  isTtsEnabled: boolean;
  onStartVoiceAnswer: () => void;
  language: Language;
}

const optionColors = ['cyan', 'teal', 'indigo', 'purple', 'pink', 'sky'] as const;
type Color = typeof optionColors[number];

const colorMap: Record<Color, { hoverBorder: string; selectedBg: string; selectedBorder: string; ring: string; bulletBg: string; }> = {
    cyan: { hoverBorder: 'hover:border-cyan-500', selectedBg: 'bg-cyan-500', selectedBorder: 'border-cyan-400', ring: 'ring-cyan-400', bulletBg: 'bg-cyan-600/80' },
    teal: { hoverBorder: 'hover:border-teal-500', selectedBg: 'bg-teal-500', selectedBorder: 'border-teal-400', ring: 'ring-teal-400', bulletBg: 'bg-teal-600/80' },
    indigo: { hoverBorder: 'hover:border-indigo-500', selectedBg: 'bg-indigo-500', selectedBorder: 'border-indigo-400', ring: 'ring-indigo-400', bulletBg: 'bg-indigo-600/80' },
    purple: { hoverBorder: 'hover:border-purple-500', selectedBg: 'bg-purple-500', selectedBorder: 'border-purple-400', ring: 'ring-purple-400', bulletBg: 'bg-purple-600/80' },
    pink: { hoverBorder: 'hover:border-pink-500', selectedBg: 'bg-pink-500', selectedBorder: 'border-pink-400', ring: 'ring-pink-400', bulletBg: 'bg-pink-600/80' },
    sky: { hoverBorder: 'hover:border-sky-500', selectedBg: 'bg-sky-500', selectedBorder: 'border-sky-400', ring: 'ring-sky-400', bulletBg: 'bg-sky-600/80' },
};

const getButtonClass = (index: number, isSelected: boolean) => {
    const color = optionColors[index % optionColors.length];
    const selectedColorClasses = colorMap[color];
    const baseClass = `w-full text-left p-4 rounded-lg border-2 transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-4 text-slate-200 flex items-center`;

    if (isSelected) {
        return `${baseClass} ${selectedColorClasses.selectedBg} ${selectedColorClasses.selectedBorder} shadow-lg ring-2 ring-offset-2 ring-offset-slate-800 ${selectedColorClasses.ring}`;
    }
    return `${baseClass} bg-slate-700/50 border-slate-600 hover:bg-slate-700 ${selectedColorClasses.hoverBorder}`;
};

const speak = (text: string, lang: Language) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Cancel any previous speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLang(lang);
    window.speechSynthesis.speak(utterance);
  }
};


const QuestionCard = ({ question, questionNumber, onAnswer, onNext, onPrevious, isFirst, isLast, currentAnswer, currentOptions, isLoading, error, isTtsEnabled, onStartVoiceAnswer, language }: QuestionCardProps) => {
  const [selectedOption, setSelectedOption] = useState<GeneratedOption | null>(null);
  const [remark, setRemark] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    const transitionTimer = setTimeout(() => {
      const previouslySelectedOption = currentOptions?.find(opt => opt.text === currentAnswer?.optionText) || null;
      setSelectedOption(previouslySelectedOption);
      setRemark(currentAnswer?.remark || '');
      setIsVisible(true);
    }, 150);
  
    return () => {
      window.speechSynthesis.cancel();
      clearTimeout(transitionTimer);
    };
  }, [question.id, currentAnswer, currentOptions]);

  useEffect(() => {
    if (isTtsEnabled && !isLoading && isVisible) {
      speak(question.text, language);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTtsEnabled, isLoading, question.text, isVisible]); // language is implicitly handled via question.text

  const handleOptionClick = (option: GeneratedOption) => {
    if (selectedOption?.text === option.text) {
        // Deselect if already selected
        setSelectedOption(null);
    } else {
        setSelectedOption(option);
    }
  };

  const handleNext = () => {
    if (selectedOption) {
      onAnswer({
        questionId: question.id,
        score: selectedOption.score,
        optionText: selectedOption.text,
        remark: remark,
      });
      onNext();
    } else if (remark.trim()) {
        onAnswer({
            questionId: question.id,
            score: 0, // Custom answers get a neutral score
            optionText: t('custom_answer_text', language),
            remark: remark.trim(),
        });
        onNext();
    } else {
      alert(t('alert_select_option', language));
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
           <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          <p className="mt-4 text-slate-400">{t('loading_options', language)}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="font-bold text-red-400">{t('error_title', language)}</p>
          <p className="text-slate-300">{error}</p>
        </div>
      );
    }
    
    if(!currentOptions){
        return null;
    }

    return (
        <>
            <div className="space-y-4 mb-8">
                {currentOptions.map((option, index) => {
                    const isSelected = selectedOption?.text === option.text;
                    return (
                        <button key={index} onClick={() => handleOptionClick(option)} className={getButtonClass(index, isSelected)}>
                             <span className={`font-bold text-lg mr-4 ${colorMap[optionColors[index % optionColors.length]].bulletBg} rounded-full w-8 h-8 flex-shrink-0 flex items-center justify-center`}>
                                {index + 1}
                             </span>
                            <span className="flex-grow text-slate-200">{option.text}</span>
                            <span className={`ml-4 flex-shrink-0 px-3 py-1 text-sm font-semibold text-cyan-200 bg-cyan-900/80 rounded-full border border-cyan-700/60 transition-all duration-300 ease-in-out transform ${isSelected ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
                                {option.score} / 5
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="my-8">
                 <button 
                    onClick={onStartVoiceAnswer}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-cyan-300 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-all transform hover:scale-105"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z" />
                      <path fillRule="evenodd" d="M5.5 10.5a.5.5 0 01.5-.5h2a.5.5 0 010 1h-2a.5.5 0 01-.5-.5z" clipRule="evenodd" />
                      <path d="M10 18.5a1 1 0 01-1-1v-2.06a8.005 8.005 0 01-5.446-5.446H1.5a1 1 0 110-2h2.06A8.005 8.005 0 017.006 2.56V1.5a1 1 0 112 0v1.06A8.005 8.005 0 0113.44 7.006h2.06a1 1 0 110 2h-2.06a8.005 8.005 0 01-5.446 5.446V17.5a1 1 0 01-1 1zM8.5 10a1.5 1.5 0 113 0v-1a1.5 1.5 0 11-3 0v1z" />
                    </svg>
                    {t('voice_answer_button', language)}
                 </button>
            </div>


            <div className="relative mb-8">
                <label htmlFor="remark" className="block text-slate-400 text-sm font-medium mb-2">
                    {t('your_comment_label', language)}
                </label>
                <textarea
                    id="remark"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    rows={3}
                    placeholder={t('comment_placeholder', language)}
                    className="w-full bg-slate-900/80 border border-slate-600 rounded-lg p-3 pr-4 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                />
            </div>
        </>
    );
  };


  return (
    <div className={`transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}>
        <p className="text-sm font-semibold text-cyan-400 mb-2">{question.categoryTitle}</p>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-100 mb-8 font-display cursor-pointer" onClick={() => speak(question.text, language)}>
            <span className="text-slate-500 mr-2">{questionNumber}.</span>{question.text}
        </h2>

        {renderContent()}

        <div className="flex justify-between items-center">
            <button
                onClick={onPrevious}
                disabled={isFirst}
                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {t('back_button', language)}
            </button>
            <button
                onClick={handleNext}
                disabled={(!selectedOption && !remark.trim()) || isLoading || !!error}
                className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold py-2 px-6 rounded-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLast ? t('finish_button', language) : t('next_button', language)}
            </button>
        </div>
    </div>
  );
};

export default QuestionCard;