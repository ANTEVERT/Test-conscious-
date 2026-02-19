import React, { useMemo, useState, useEffect } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, ResponsiveContainer } from 'recharts';
import { Answer } from './types';
import { initialQuestionsData } from './questions';
import { Language, t } from './i18n';
import { SavedResult } from './App';

interface ResultsProps {
  answers: Map<number, Answer>;
  onRestart: () => void;
  worldviewImageUrl?: string | null;
  language: Language;
  isViewingSaved: boolean;
  onReturnToHome: () => void;
}

const MAX_SCORE_PER_QUESTION = 5;

const getInterpretation = (score: number, maxScore: number, language: Language) => {
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  if (percentage <= 25) return {
    title: t('interpretation_low_title', language),
    description: t('interpretation_low_desc', language),
    color: "text-red-400"
  };
  if (percentage <= 50) return {
    title: t('interpretation_developing_title', language),
    description: t('interpretation_developing_desc', language),
    color: "text-yellow-400"
  };
  if (percentage <= 80) return {
    title: t('interpretation_formed_title', language),
    description: t('interpretation_formed_desc', language),
    color: "text-green-400"
  };
  return {
    title: t('interpretation_high_title', language),
    description: t('interpretation_high_desc', language),
    color: "text-cyan-400"
  };
};

const mbtiQuestionMap: { [key: number]: 'EI' | 'SN' | 'TF' | 'JP' } = {
  133: 'EI', 134: 'EI', // Introversion (low score) vs Extraversion (high score)
  135: 'SN', 136: 'SN', // Sensing (low score) vs Intuition (high score)
  137: 'TF', 138: 'TF', // Feeling (low score) vs Thinking (high score)
  139: 'JP', 140: 'JP', // Perceiving (low score) vs Judging (high score)
};

const getMbtiDescriptions = (language: Language) => ({
  I: t('mbti_i_desc', language),
  E: t('mbti_e_desc', language),
  S: t('mbti_s_desc', language),
  N: t('mbti_n_desc', language),
  F: t('mbti_f_desc', language),
  T: t('mbti_t_desc', language),
  P: t('mbti_p_desc', language),
  J: t('mbti_j_desc', language),
});


// Custom Tooltip for Radar Chart
const CustomTooltip = ({ active, payload, language }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/80 backdrop-blur-sm p-4 border border-slate-600 rounded-lg shadow-lg text-left">
          <p className="label font-bold text-cyan-400">{`${data.title}`}</p>
          <p className="intro text-slate-200 mt-2">{`${t('radar_tooltip_level', language)}: ${data.percentage}%`}</p>
          <p className="desc text-slate-400 text-sm">{`${t('radar_tooltip_score', language)}: ${data.score} / ${data.maxScore}`}</p>
        </div>
      );
    }
    return null;
};


const Results = ({ answers, onRestart, worldviewImageUrl, language, isViewingSaved, onReturnToHome }: ResultsProps) => {
  const [saveButtonText, setSaveButtonText] = useState(t('save_results_button', language));
  const [shareButtonText, setShareButtonText] = useState(t('share_results_button', language));
  const [isSaved, setIsSaved] = useState(false);

  const totalScore = useMemo(() => {
    let score = 0;
    answers.forEach(answer => score += answer.score);
    return score;
  }, [answers]);

  const maxScore = initialQuestionsData.allQuestions.length * MAX_SCORE_PER_QUESTION;
  const interpretation = getInterpretation(totalScore, maxScore, language);
  const mbtiDescriptions = getMbtiDescriptions(language);

  const categoryData = useMemo(() => {
    return initialQuestionsData.questionCategories.map((category) => {
      const categoryQuestions = category.questions;
      const maxCategoryScore = categoryQuestions.length * MAX_SCORE_PER_QUESTION;
      let userCategoryScore = 0;
      categoryQuestions.forEach(q => {
        if (answers.has(q.id)) {
          userCategoryScore += answers.get(q.id)!.score;
        }
      });
      const percentage = maxCategoryScore > 0 ? (userCategoryScore / maxCategoryScore) * 100 : 0;
      return {
        name: category.key,
        title: t(`cat_title_${category.key}`, language),
        score: userCategoryScore,
        maxScore: maxCategoryScore,
        percentage: parseFloat(percentage.toFixed(1)),
      };
    });
  }, [answers, language]);

  const mbtiResult = useMemo(() => {
    const scores = { EI: 0, SN: 0, TF: 0, JP: 0 };
    const maxAbsScore = 2.5 * 2; // Max deviation for 2 questions is 5

    answers.forEach((answer, questionId) => {
      const axis = mbtiQuestionMap[questionId];
      if (axis) {
        // Score is 0-5. Midpoint is 2.5. Contribution is score - 2.5
        scores[axis] += answer.score - 2.5;
      }
    });

    const type = [
      scores.EI < 0 ? 'I' : 'E',
      scores.SN < 0 ? 'S' : 'N',
      scores.TF < 0 ? 'F' : 'T',
      scores.JP < 0 ? 'P' : 'J',
    ].join('');

    return {
      type,
      scores,
      maxAbsScore,
    };
  }, [answers]);
  
  useEffect(() => {
    try {
        const savedResults: SavedResult[] = JSON.parse(localStorage.getItem('quizSavedResults') || '[]');
        const currentAnswersString = JSON.stringify(Array.from(answers.entries()));
        
        const alreadySaved = savedResults.some(res => 
            JSON.stringify(res.answers) === currentAnswersString
        );

        if (alreadySaved) {
            setIsSaved(true);
            setSaveButtonText(t('results_saved_button', language));
        } else {
            setIsSaved(false);
            setSaveButtonText(t('save_results_button', language));
        }
    } catch (e) {
        console.error("Failed to check saved results", e);
    }
  }, [answers, language]);


  const handleExportText = () => {
    let content = `${t('main_title', language)}\n`;
    content += `======================================================\n\n`;
    content += `${t('export_date', language)}: ${new Date().toLocaleString(language)}\n\n`;

    content += `--- ${t('export_total_result', language).toUpperCase()} ---\n`;
    content += `${t('export_total_score', language)}: ${totalScore} / ${maxScore}\n`;
    content += `${t('export_interpretation', language)}: ${interpretation.title}\n`;
    content += `${interpretation.description}\n\n`;

    content += `--- ${t('export_mbti_profile', language).toUpperCase()} ---\n`;
    content += `${t('mbti_your_type', language)}: ${mbtiResult.type}\n`;
    content += `- ${t('mbti_energy_source', language)}: ${t(mbtiResult.type[0] === 'I' ? 'mbti_introversion' : 'mbti_extraversion', language)}\n`;
    content += `- ${t('mbti_perception_method', language)}: ${t(mbtiResult.type[1] === 'S' ? 'mbti_sensing' : 'mbti_intuition', language)}\n`;
    content += `- ${t('mbti_decision_making', language)}: ${t(mbtiResult.type[2] === 'F' ? 'mbti_feeling' : 'mbti_thinking', language)}\n`;
    content += `- ${t('mbti_lifestyle', language)}: ${t(mbtiResult.type[3] === 'P' ? 'mbti_perceiving' : 'mbti_judging', language)}\n\n`;

    content += `--- ${t('results_by_category', language).toUpperCase()} ---\n`;
    categoryData.forEach(cat => {
      content += `${cat.title} (${cat.name}): ${cat.score} / ${cat.maxScore} (${cat.percentage.toFixed(1)}%)\n`;
    });
    content += `\n`;

    content += `--- ${t('export_detailed_answers', language).toUpperCase()} ---\n`;
    initialQuestionsData.allQuestions.forEach(question => {
      const answer = answers.get(question.id);
      if (answer) {
        content += `\n${t('export_category', language)}: ${t(`cat_title_${question.categoryKey}`, language)}\n`;
        content += `${t('report_question', language)}: ${t(`q_${question.id}`, language)}\n`;
        content += `  - ${t('report_your_answer', language)}: "${answer.optionText}" (${t('report_score', language)}: ${answer.score})\n`;
        if (answer.remark) {
          content += `  - ${t('export_your_comment', language)}: ${answer.remark}\n`;
        }
      } else {
        content += `\n${t('export_category', language)}: ${t(`cat_title_${question.categoryKey}`, language)}\n`;
        content += `${t('report_question', language)}: ${t(`q_${question.id}`, language)}\n`;
        content += `  - ${t('export_answer_skipped', language)}\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quiz-results-${language}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    window.print();
  };
  
  const handleSaveResults = () => {
    if (isSaved) return;
    try {
        const savedResults: SavedResult[] = JSON.parse(localStorage.getItem('quizSavedResults') || '[]');
        const newResult: SavedResult = {
            timestamp: Date.now(),
            answers: Array.from(answers.entries()),
            worldviewImageUrl: worldviewImageUrl || null,
        };
        savedResults.push(newResult);
        localStorage.setItem('quizSavedResults', JSON.stringify(savedResults));
        setIsSaved(true);
        setSaveButtonText(t('results_saved_button', language));
    } catch (error) {
        console.error("Failed to save results:", error);
        setSaveButtonText(t('save_results_error', language));
    }
  };

  const handleShare = async () => {
    const dataToShare = {
        answers: Array.from(answers.entries()),
        worldviewImageUrl: worldviewImageUrl || null,
    };
    const jsonString = JSON.stringify(dataToShare);
    const encodedData = btoa(jsonString);

    const shareUrl = `${window.location.origin}${window.location.pathname}?r=${encodedData}`;
    
    const shareText = t('share_text', language, {
        score: totalScore,
        maxScore: maxScore,
        type: mbtiResult.type,
    });

    if (navigator.share) {
        try {
            await navigator.share({
                title: t('main_title', language),
                text: shareText,
                url: shareUrl,
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    } else {
        navigator.clipboard.writeText(`${shareText}\n${shareUrl}`).then(() => {
            setShareButtonText(t('share_copied_button', language));
            setTimeout(() => setShareButtonText(t('share_results_button', language)), 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
  };


  const renderMbtiAxis = (
      axis: 'EI' | 'SN' | 'TF' | 'JP',
      leftLabel: string,
      rightLabel: string,
      leftDescKey: 'I'|'S'|'F'|'P',
      rightDescKey: 'E'|'N'|'T'|'J'
  ) => {
      const score = mbtiResult.scores[axis];
      const preference = score < 0 ? leftDescKey : rightDescKey;
      const strength = (Math.abs(score) / mbtiResult.maxAbsScore) * 50; // Percentage of half the bar

      return (
          <div className="py-4">
              <div className="flex justify-between items-center text-slate-300 font-bold mb-2">
                  <span className={preference === leftDescKey ? 'text-cyan-400' : ''}>{leftLabel} ({leftDescKey})</span>
                  <span className={preference === rightDescKey ? 'text-cyan-400' : ''}>{rightLabel} ({rightDescKey})</span>
              </div>
              <div className="w-full bg-slate-700/50 rounded-full h-3 relative">
                  <div className="absolute top-0 bottom-0 left-1/2 -ml-px w-0.5 bg-slate-500/50"></div>
                  <div 
                      className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-cyan-500 to-teal-400"
                      style={{
                          left: score < 0 ? `${50 - strength}%` : '50%',
                          width: `${strength}%`
                      }}
                  ></div>
              </div>
              <p className="text-slate-400 text-sm mt-3 text-center h-10">{mbtiDescriptions[preference]}</p>
          </div>
      );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl w-full bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-6 md:p-10 border border-slate-700 results-container">
        <h1 className="text-4xl sm:text-5xl font-bold text-center mb-4 font-display text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500">
          {t('results_your_results', language)}
        </h1>
        
        <div className="text-center my-8">
          <p className="text-2xl text-slate-300">{t('results_total_score_label', language)}:</p>
          <p className="text-7xl font-extrabold my-2">
            <span className={interpretation.color}>{totalScore}</span>
            <span className="text-4xl text-slate-500"> / {maxScore}</span>
          </p>
          <div className={`mt-4 p-4 bg-slate-900/70 rounded-lg border border-slate-700`}>
             <h3 className={`text-2xl font-bold font-display ${interpretation.color}`}>{interpretation.title}</h3>
             <p className="text-slate-300 mt-2">{interpretation.description}</p>
          </div>
        </div>

        <div className="my-10 pt-8 border-t border-slate-700">
            <h2 className="text-3xl font-bold text-center mb-2 font-display text-cyan-300">{t('mbti_profile_title', language)}</h2>
            <p className="text-center text-slate-400 mb-6">{t('mbti_profile_subtitle', language)}</p>
            <div className="bg-slate-900/70 p-6 rounded-lg border border-slate-700">
                <p className="text-center text-xl text-slate-300 mb-2">{t('mbti_your_type', language)}:</p>
                <p className="text-center text-6xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500 mb-6">{mbtiResult.type}</p>
                <div className="divide-y divide-slate-700">
                    {renderMbtiAxis('EI', t('mbti_introversion', language), t('mbti_extraversion', language), 'I', 'E')}
                    {renderMbtiAxis('SN', t('mbti_sensing', language), t('mbti_intuition', language), 'S', 'N')}
                    {renderMbtiAxis('TF', t('mbti_feeling', language), t('mbti_thinking', language), 'F', 'T')}
                    {renderMbtiAxis('JP', t('mbti_perceiving', language), t('mbti_judging', language), 'P', 'J')}
                </div>
            </div>
        </div>

        {worldviewImageUrl && (
          <div className="my-10 pt-8 border-t border-slate-700">
              <h2 className="text-3xl font-bold text-center mb-6 font-display text-cyan-300">{t('worldview_visualization', language)}</h2>
              <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 flex justify-center">
                  <img src={worldviewImageUrl} alt={t('worldview_visualization', language)} className="rounded-lg shadow-2xl max-w-md w-full h-auto" />
              </div>
              <p className="text-center text-slate-400 mt-4 max-w-2xl mx-auto">{t('worldview_visualization_desc', language)}</p>
          </div>
        )}

        <div className="my-10">
            <h2 className="text-3xl font-bold text-center mb-2 font-display text-cyan-300">{t('results_by_category', language)}</h2>
            <p className="text-center text-slate-400 mb-6 max-w-2xl mx-auto">{t('results_by_category_desc', language)}</p>
            <div className="w-full h-96">
                <ResponsiveContainer>
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={categoryData}>
                        <defs>
                            <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.3}/>
                            </linearGradient>
                        </defs>
                        <PolarGrid stroke="#475569" />
                        <PolarAngleAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 14 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name={t('radar_maturity', language)} dataKey="percentage" stroke="#06b6d4" fill="url(#radarFill)" />
                        <Tooltip content={<CustomTooltip language={language} />} cursor={{ stroke: '#06b6d4', strokeWidth: 1, fill: 'rgba(6, 182, 212, 0.1)' }}/>
                    </RadarChart>
                </ResponsiveContainer>
            </div>
        </div>

        <div className="text-left bg-slate-900/70 p-6 rounded-lg border border-slate-700 space-y-4 mb-10">
          <h2 className="text-2xl font-bold text-cyan-400 font-display mb-4">{t('recommendations_title', language)}</h2>
          <ul className="list-disc list-inside space-y-2 text-slate-300">
            <li><strong className="text-white">{t('recommendations_1_title', language)}:</strong> {t('recommendations_1_desc', language, { score: totalScore, maxScore: maxScore })} <span className={interpretation.color}>{interpretation.title.toLowerCase()}</span>.</li>
            <li><strong className="text-white">{t('recommendations_2_title', language)}:</strong> {t('recommendations_2_desc', language, { type: mbtiResult.type })}</li>
            <li><strong className="text-white">{t('recommendations_3_title', language)}:</strong> {t('recommendations_3_desc', language)}</li>
             <li><strong className="text-white">{t('recommendations_4_title', language)}:</strong> {t('recommendations_4_desc', language)}</li>
            <li><strong className="text-white">{t('recommendations_5_title', language)}:</strong> {t('recommendations_5_desc', language)}</li>
          </ul>
        </div>
        
        <div className="mt-8 pt-6 border-t border-slate-600 text-center print-hidden">
            <h3 className="text-xl font-bold text-slate-300 mb-4">{t('export_results', language)}</h3>
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                 <button
                    onClick={handleExportText}
                    className="bg-slate-600 hover:bg-slate-500 text-white font-bold text-md py-2 px-6 rounded-full shadow-md hover:shadow-slate-500/40 transition-all duration-300 ease-in-out transform hover:scale-105 w-full sm:w-auto"
                  >
                    {t('export_txt', language)}
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="bg-slate-600 hover:bg-slate-500 text-white font-bold text-md py-2 px-6 rounded-full shadow-md hover:shadow-slate-500/40 transition-all duration-300 ease-in-out transform hover:scale-105 w-full sm:w-auto"
                  >
                    {t('export_pdf', language)}
                  </button>
                  <button
                    onClick={handleShare}
                    className="bg-slate-600 hover:bg-slate-500 text-white font-bold text-md py-2 px-6 rounded-full shadow-md hover:shadow-slate-500/40 transition-all duration-300 ease-in-out transform hover:scale-105 w-full sm:w-auto"
                  >
                    {shareButtonText}
                  </button>
            </div>
             <div className="mt-4">
                 <button
                     onClick={handleSaveResults}
                     disabled={isSaved}
                     className="bg-teal-700 hover:bg-teal-600 text-white font-bold text-md py-2 px-6 rounded-full shadow-md hover:shadow-teal-600/40 transition-all duration-300 ease-in-out transform hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed w-full sm:w-auto"
                 >
                     {saveButtonText}
                 </button>
             </div>
        </div>

        <div className="text-center mt-8 print-hidden">
          {isViewingSaved ? (
             <button
                onClick={onReturnToHome}
                className="bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white font-bold text-lg py-3 px-8 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105"
              >
                {t('return_to_home_button', language)}
              </button>
          ) : (
             <button
                onClick={onRestart}
                className="bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-600 hover:to-teal-700 text-white font-bold text-lg py-3 px-8 rounded-full shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 ease-in-out transform hover:scale-105"
              >
                {t('restart_quiz', language)}
              </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Results;