// @google/genai-sdk comment: Add imports for Gemini API response types.
import { GoogleGenAI, Type, GenerateContentResponse, GenerateImagesResponse, LiveServerMessage, Modality, Blob, FunctionDeclaration, LiveSession } from '@google/genai';
import React, { useState, useCallback, useEffect, lazy, Suspense, useRef, useMemo } from 'react';
import Introduction from './components/Introduction';
import QuestionCard from './components/QuestionCard';
import ProgressBar from './components/ProgressBar';
import VoiceAnswerModal from './components/VoiceAnswerModal';
import { initialQuestions } from './questions';
import { Answer, GeneratedOption, Question, ChatMessage } from './types';
import { t, Language, supportedLanguages, getSpeechLang, getLanguageName } from './i18n';
import LanguageSelector from './components/LanguageSelector';

const Results = lazy(() => import('./Results'));

type AppState = 'introduction' | 'quiz' | 'results';
export type VoiceModalStatus = 'idle' | 'listening' | 'processing' | 'error' | 'initializing';
export interface SavedResult {
    timestamp: number;
    answers: [number, Answer][];
    worldviewImageUrl: string | null;
}

const BATCH_SIZE = 5;

// ================== AUDIO HELPER FUNCTIONS (for Live API) ==================
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}
// ========================================================================


const loadLanguage = (): Language => {
    try {
        const savedLang = localStorage.getItem('quizLanguage');
        return (supportedLanguages.some(l => l.code === savedLang) ? savedLang : 'ru') as Language;
    } catch {
        return 'ru';
    }
};

async function withRetry<T>(apiCall: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await apiCall();
        } catch (error: any) {
            const isRateLimitError = error.toString().includes('429') || error.toString().includes('RESOURCE_EXHAUSTED');
            
            if (isRateLimitError && attempt < maxRetries - 1) {
                attempt++;
                const delay = initialDelay * Math.pow(2, attempt - 1) * (0.5 + Math.random()); // Exponential backoff with jitter
                console.warn(`Rate limit exceeded. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries - 1})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error; // Re-throw other errors or if max retries are reached
            }
        }
    }
    throw new Error("Max retries reached. This should not happen.");
}

const loadInitialState = () => {
  try {
    const savedRaw = localStorage.getItem('quizProgress');
    if (savedRaw) {
      const savedState = JSON.parse(savedRaw);
      if (savedState && typeof savedState.appState === 'string') {
        const validShuffled = Array.isArray(savedState.shuffledQuestions) && savedState.shuffledQuestions.every((q: any) => typeof q?.id === 'number');

        return {
          appState: savedState.appState as AppState,
          currentQuestionIndex: savedState.currentQuestionIndex || 0,
          answers: new Map<number, Answer>(savedState.answers || []),
          optionsCache: new Map<number, GeneratedOption[]>(savedState.optionsCache || []),
          shuffledQuestions: validShuffled ? savedState.shuffledQuestions : initialQuestions,
          worldviewImageHistory: savedState.worldviewImageHistory || [],
        };
      }
    }
  } catch (error) {
    console.error("Failed to load or parse saved state from localStorage.", error);
    localStorage.removeItem('quizProgress');
  }
  
  return {
    appState: 'introduction' as AppState,
    currentQuestionIndex: 0,
    answers: new Map<number, Answer>(),
    optionsCache: new Map<number, GeneratedOption[]>(),
    shuffledQuestions: initialQuestions, // Start with unshuffled
    worldviewImageHistory: [],
  };
};

const loadTtsSetting = () => {
  try {
    const saved = localStorage.getItem('ttsEnabled');
    return saved === 'true';
  } catch {
    return false;
  }
};

const initialState = loadInitialState();

const App = () => {
  const [appState, setAppState] = useState<AppState>(initialState.appState);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialState.currentQuestionIndex);
  const [answers, setAnswers] = useState<Map<number, Answer>>(initialState.answers);
  const [optionsCache, setOptionsCache] = useState<Map<number, GeneratedOption[]>>(initialState.optionsCache);
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>(initialState.shuffledQuestions);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [language, setLanguage] = useState<Language>(loadLanguage);

  // Intermediate reports and worldview image
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [intermediateReportText, setIntermediateReportText] = useState('');
  const [worldviewImageHistory, setWorldviewImageHistory] = useState<string[]>(initialState.worldviewImageHistory);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // For viewing past results
  const [viewingAnswers, setViewingAnswers] = useState<Map<number, Answer> | null>(null);
  const [viewingWorldviewImage, setViewingWorldviewImage] = useState<string | null>(null);

  // Text-to-Speech
  const [isTtsEnabled, setIsTtsEnabled] = useState(loadTtsSetting);
  const [isTtsActive, setIsTtsActive] = useState(false);

  // Voice Answer Modal
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [voiceModalStatus, setVoiceModalStatus] = useState<VoiceModalStatus>('idle');
  const [voiceModalError, setVoiceModalError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Refs for Live API resources
  const liveSessionRef = useRef<LiveSession | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);


  const localizedShuffledQuestions = useMemo(() => {
      return shuffledQuestions.map(q => ({
          ...q,
          text: t(`q_${q.id}`, language),
          categoryTitle: t(`cat_${q.categoryKey}`, language)
      }));
  }, [shuffledQuestions, language]);

  const speak = useCallback((text: string, lang: Language): Promise<void> => {
    return new Promise((resolve) => {
        if (!isTtsEnabled || !('speechSynthesis' in window) || !text) {
            return resolve();
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = getSpeechLang(lang);

        utterance.onstart = () => {
             setIsTtsActive(true);
        };

        utterance.onend = () => {
            setIsTtsActive(false);
            resolve();
        };
        utterance.onerror = (event) => {
            console.error('SpeechSynthesis error:', event.error);
            setIsTtsActive(false);
            resolve(); // Resolve even on error to not block the flow
        };

        window.speechSynthesis.speak(utterance);
    });
  }, [isTtsEnabled]);

  // Effect to handle loading shared results from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const resultsData = urlParams.get('r');

    if (resultsData) {
        try {
            const decodedJson = atob(resultsData);
            const parsedData: { answers: [number, Answer][], worldviewImageUrl: string | null } = JSON.parse(decodedJson);

            if (parsedData && Array.isArray(parsedData.answers)) {
                localStorage.removeItem('quizProgress'); // Clear any saved progress to avoid confusion.
                
                setViewingAnswers(new Map(parsedData.answers));
                setViewingWorldviewImage(parsedData.worldviewImageUrl);
                setAppState('results');

                // Clean the URL so a refresh doesn't try to load the same data again.
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (error) {
            console.error("Failed to parse shared results from URL:", error);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (appState === 'quiz') {
      const quizProgress = {
        appState,
        currentQuestionIndex,
        answers: Array.from(answers.entries()),
        optionsCache: Array.from(optionsCache.entries()),
        shuffledQuestions,
        worldviewImageHistory,
      };
      localStorage.setItem('quizProgress', JSON.stringify(quizProgress));
    } else if (appState === 'introduction') {
      // Clear progress when we are back to the intro screen (unless viewing old results)
       if (!viewingAnswers) {
           localStorage.removeItem('quizProgress');
       }
    }
  }, [appState, currentQuestionIndex, answers, optionsCache, shuffledQuestions, worldviewImageHistory, viewingAnswers]);

  useEffect(() => {
    try {
        localStorage.setItem('ttsEnabled', String(isTtsEnabled));
    } catch (error) {
        console.error("Could not save TTS setting to localStorage", error);
    }
  }, [isTtsEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('quizLanguage', language);
      document.documentElement.lang = language;
    } catch (error) {
      console.error("Could not save language to localStorage", error);
    }
  }, [language]);


  const generateBatchQuestionOptions = useCallback(async (questions: Pick<Question, 'id' | 'text'>[], lang: Language): Promise<Map<number, GeneratedOption[]>> => {
    if (questions.length === 0) {
      return new Map();
    }
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API-ключ не предоставлен. Убедитесь, что переменная окружения API_KEY установлена.");
    }
    const ai = new GoogleGenAI({ apiKey });
    const languageName = getLanguageName(lang);

    const systemInstruction = `You are an expert in philosophy, psychology, and sociology. Your task is to generate 4 to 6 nuanced answer options in ${languageName} for the list of questions provided by the user in a JSON string format.
For each question, the options must represent a spectrum of views, from simplistic or common misconceptions to deeply reflective and integrated perspectives. Some options should be subtly misleading to test critical thinking.
Crucially, each answer option's text must be very concise, ideally under 15 words, while preserving its core philosophical meaning.
For each option, provide:
1. "text": The concise answer option text in ${languageName}.
2. "score": An integer score from 0 to 5, where 0 is naive and 5 is highly mature.
Your entire output MUST be a JSON array of objects, conforming to the provided schema. Each object in the array will correspond to one of the input questions and must contain the question's ID and its generated options. Do not include any explanatory text, markdown formatting, or anything outside of the JSON array.`;
    
    const prompt = JSON.stringify(questions.map(({ id, text }) => ({ id, text })));

    try {
      // @google/genai-sdk comment: Add 'GenerateContentResponse' type to correctly type the API response.
      const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "A list of objects, each containing a question ID and its generated options.",
            items: {
              type: Type.OBJECT,
              properties: {
                questionId: { type: Type.INTEGER, description: "The ID of the question from the input." },
                options: {
                  type: Type.ARRAY,
                  description: "A list of 4 to 6 possible answer options for the question.",
                  items: {
                    type: Type.OBJECT,
                    description: "A single answer option.",
                    properties: {
                      text: { type: Type.STRING, description: "The answer option text." },
                      score: { type: Type.INTEGER, description: "An integer score from 0 (naive) to 5 (highly mature)." },
                    },
                    required: ["text", "score"],
                  },
                },
              },
              required: ["questionId", "options"],
            },
          },
        },
      }));

      // FIX: Handle case where text might be missing
      const jsonText = response.text ? response.text.trim() : "";
      if (!jsonText) throw new Error("Received empty response from API");

      // Robust extraction of JSON array
      const start = jsonText.indexOf('[');
      const end = jsonText.lastIndexOf(']');
      let cleanedJsonText = jsonText;
      if (start !== -1 && end !== -1) {
          cleanedJsonText = jsonText.substring(start, end + 1);
      }
      
      // @google/genai-sdk comment: Add explicit type to the parsed JSON to ensure type safety.
      const results: { questionId: number; options: GeneratedOption[] }[] = JSON.parse(cleanedJsonText);

      if (!Array.isArray(results)) {
        throw new Error("API response is not an array.");
      }

      const optionsMap = new Map<number, GeneratedOption[]>();
      for (const item of results) {
        if (item && typeof item.questionId === 'number' && Array.isArray(item.options) && item.options.every((opt: any) => typeof opt.text === 'string' && typeof opt.score === 'number')) {
          optionsMap.set(item.questionId, item.options);
        } else {
          console.warn("Invalid item structure in API response:", item);
        }
      }

      if (optionsMap.size !== questions.length) {
        console.warn(`API did not return options for all requested questions. Requested: ${questions.length}, Received: ${optionsMap.size}`);
      }
      return optionsMap;

    } catch (error) {
      console.error("Error generating batch question options:", error);
      if (error instanceof SyntaxError) {
        throw new Error(t('error_json_parse', lang));
      }
      throw new Error(t('error_api_generation', lang));
    }
  }, []);
  
  
  useEffect(() => {
    const fetchCurrentAndPrefetchNext = async () => {
        if (appState !== 'quiz' || localizedShuffledQuestions.length === 0) return;

        const currentQuestion = localizedShuffledQuestions[currentQuestionIndex];

        if (!optionsCache.has(currentQuestion.id)) {
            setIsLoadingOptions(true);
            setError(null);

            const batchStartIndex = Math.floor(currentQuestionIndex / BATCH_SIZE) * BATCH_SIZE;
            const batchEndIndex = Math.min(batchStartIndex + BATCH_SIZE, localizedShuffledQuestions.length);
            
            const batchToFetch = localizedShuffledQuestions
                .slice(batchStartIndex, batchEndIndex)
                .filter(q => !optionsCache.has(q.id))
                .map(({ id, text }) => ({ id, text }));

            if (batchToFetch.length > 0) {
                try {
                    const generatedOptionsMap = (await withRetry(() => generateBatchQuestionOptions(batchToFetch, language))) as Map<number, GeneratedOption[]>;
                    setOptionsCache(prev => {
                        const newCache = new Map(prev);
                        generatedOptionsMap.forEach((opts, id) => newCache.set(id, opts));
                        return newCache;
                    });
                } catch (e: any) {
                    setError(e.message || t('error_unknown_options', language));
                    setIsLoadingOptions(false);
                    return;
                }
            }
            
            setIsLoadingOptions(false);

            const prefetchStartIndex = batchEndIndex;
            if (prefetchStartIndex < localizedShuffledQuestions.length) {
                const prefetchEndIndex = Math.min(prefetchStartIndex + BATCH_SIZE, localizedShuffledQuestions.length);
                const batchToPrefetch = localizedShuffledQuestions
                    .slice(prefetchStartIndex, prefetchEndIndex)
                    .filter(q => !optionsCache.has(q.id))
                    .map(({ id, text }) => ({ id, text }));
                
                if (batchToPrefetch.length > 0) {
                    withRetry(() => generateBatchQuestionOptions(batchToPrefetch, language))
                        .then((generatedOptionsMap: Map<number, GeneratedOption[]>) => {
                            setOptionsCache(prev => {
                                const newCache = new Map(prev);
                                generatedOptionsMap.forEach((opts, id) => newCache.set(id, opts));
                                return newCache;
                            });
                        })
                        .catch(e => {
                            console.error("Background pre-fetch failed:", e);
                        });
                }
            }
        }
    };

    fetchCurrentAndPrefetchNext();
  }, [currentQuestionIndex, appState, localizedShuffledQuestions, optionsCache, generateBatchQuestionOptions, language]);

    const updateWorldviewImage = useCallback(async (answeredCount: number, totalCount: number) => {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            console.error("API_KEY is not set. Cannot generate image.");
            return;
        }
        const ai = new GoogleGenAI({ apiKey });

        const prompts = [
            "A single, tiny, shimmering seed of light in an infinite dark void. Ethereal, minimalist, monochrome. Abstract digital art.",
            "The seed of light has sprouted faint, glowing tendrils. A soft nebula of cosmic dust begins to form around it. Hints of cool colors like blue and violet appear. Abstract digital art.",
            "A young cosmic sapling made of light. The structure is becoming more defined, with delicate branches reaching out. The surrounding nebula is brighter and more colorful. Abstract digital art.",
            "The cosmic structure is growing, resembling a complex fractal pattern or a young galaxy. It glows with a steady, internal light. Multiple colors are now present. Abstract digital art.",
            "The structure now looks like a detailed neural network or a cosmic web. Interconnected nodes of light pulse with energy. The colors are becoming more vibrant. Abstract digital art.",
            "A clear, defined Cosmic Tree is visible, its roots and branches spreading through space. It's surrounded by a luminous aura. Abstract digital art.",
            "The Cosmic Tree has grown larger and more intricate. Small, star-like elements appear on its branches, representing nascent ideas. Abstract digital art.",
            "The form is highly complex and beautiful, resembling a celestial mandala. It radiates energy and harmony. The colors are rich and deep. Abstract digital art.",
            "The structure is now vast and awe-inspiring, a fully-fledged cosmic entity. It contains miniature galaxies within its branches. Abstract digital art.",
            "The visual is incredibly detailed, showing a perfect balance between order and chaos, structure and fluidity. It feels alive and conscious. Abstract digital art.",
            "The Cosmic Tree is now adorned with symbolic elements, representing a rich and nuanced worldview. The light it emits is brilliant and multifaceted. Abstract digital art.",
            "The image is a breathtaking masterpiece of cosmic art, showing a complete, integrated, and profound worldview. It inspires a sense of wonder. Digital art.",
            "The structure is almost complete, a universe unto itself. It is a testament to complexity and depth of thought, glowing with wisdom. Digital art.",
            "A magnificent, vibrant, and fully formed Cosmic Tree of Life. Its intricate branches are filled with galaxies and stars. The background is a breathtaking, colorful nebula. It represents a mature, complex, and integrated worldview. Masterpiece, digital art."
        ];
        
        const stage = Math.min(prompts.length - 1, Math.floor((answeredCount - 1) / 10));
        const prompt = prompts[stage];

        try {
            // @google/genai-sdk comment: Add 'GenerateImagesResponse' type to correctly type the API response.
            const response: GenerateImagesResponse = await withRetry(() => ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: { numberOfImages: 1, outputMimeType: 'image/jpeg', aspectRatio: '1:1' },
            }));
            if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0]?.image) {
                const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
                const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                setWorldviewImageHistory(prev => {
                    const newHistory = [...prev];
                    newHistory[stage] = imageUrl;
                    return newHistory;
                });
            } else {
                console.warn("Image generation succeeded but returned no images.", response);
            }
        } catch (error) {
            console.error("Error generating worldview image:", error);
        }
    }, []);

    useEffect(() => {
        const answeredCount = answers.size;
        if (appState === 'quiz' && answeredCount > 0 && answeredCount % 10 === 0) {
            const currentStageIndex = Math.floor((answeredCount - 1) / 10);
            if (!worldviewImageHistory[currentStageIndex]) {
                withRetry(() => updateWorldviewImage(answeredCount, shuffledQuestions.length));
            }
        }
    }, [answers, appState, shuffledQuestions.length, updateWorldviewImage, worldviewImageHistory]);


  const handleStartQuiz = () => {
    localStorage.removeItem('quizProgress');
    const array = [...initialQuestions];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    setShuffledQuestions(array);
    setCurrentQuestionIndex(0);
    setAnswers(new Map());
    setOptionsCache(new Map());
    setError(null);
    setWorldviewImageHistory([]);
    setViewingAnswers(null);
    setViewingWorldviewImage(null);
    setAppState('quiz');
  };

  const handleAnswer = useCallback((answer: Answer) => {
    setAnswers(prev => new Map(prev).set(answer.questionId, answer));
  }, []);

  const handleNextQuestion = () => {
    if (currentQuestionIndex < shuffledQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setAppState('results');
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      // FIX: Decrement the question index instead of incrementing.
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleViewSavedResult = (result: SavedResult) => {
    setViewingAnswers(new Map(result.answers));
    setViewingWorldviewImage(result.worldviewImageUrl);
    setAppState('results');
  };

  const handleReturnToHome = () => {
      setViewingAnswers(null);
      setViewingWorldviewImage(null);
      setAppState('introduction');
  }

   const confirmExit = () => {
    localStorage.removeItem('quizProgress');
    setAppState('introduction');
    setCurrentQuestionIndex(0);
    setAnswers(new Map());
    setOptionsCache(new Map());
    setWorldviewImageHistory([]);
    setIsExitConfirmOpen(false);
  };
  
    const generateIntermediateReportText = async () => {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            return t('error_api_key_not_found', language);
        }
        const ai = new GoogleGenAI({ apiKey });

        const answeredCount = answers.size;
        const totalCount = shuffledQuestions.length;
        const completionPercentage = ((answeredCount / totalCount) * 100).toFixed(0);
        const languageName = getLanguageName(language);

        const formattedAnswers = Array.from(answers.values()).map((ans: Answer) => {
            const questionText = t(`q_${ans.questionId}`, language);
            return `- ${t('report_question', language)}: "${questionText}"\n  - ${t('report_your_answer', language)}: "${ans.optionText}" (${t('report_score', language)}: ${ans.score}/5)`;
        }).join('\n');

        const prompt = `You are a wise philosophical analyst. A user is taking a comprehensive worldview quiz in ${languageName}. They have answered ${answeredCount} out of ${totalCount} questions.
Here are their answers so far:
${formattedAnswers}

Based ONLY on these answers, provide a brief, intermediate analysis of their emerging worldview in ${languageName}.
Your analysis should:
1. Start with a warning: "${t('report_warning_intermediate', language, { completionPercentage })}"
2. Identify 2-3 key themes or recurring ideas in their responses.
3. Point out any potential areas of tension or contradiction if they exist.
4. Keep the tone encouraging and insightful.
5. The entire response must be in ${languageName} and be no more than 150 words.`;

        try {
            // @google/genai-sdk comment: Add 'GenerateContentResponse' type to correctly type the API response.
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            }));
            return response.text ? response.text : t('error_generate_report', language);
        } catch (e) {
            console.error(e);
            return t('error_generate_report', language);
        }
    };


    const handleGenerateReport = async () => {
        setIsGeneratingReport(true);
        setIntermediateReportText('');
        const report = await generateIntermediateReportText();
        setIntermediateReportText(report);
        setIsReportModalOpen(true);
        setIsGeneratingReport(false);
    };

    const cleanupAudioResources = useCallback(() => {
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        
        audioProcessorNodeRef.current?.disconnect();
        audioProcessorNodeRef.current = null;
        
        mediaStreamSourceRef.current?.disconnect();
        mediaStreamSourceRef.current = null;
    
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close().then(() => inputAudioContextRef.current = null);
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close().then(() => outputAudioContextRef.current = null);
        }
    }, []);

    const handleCloseVoiceModal = useCallback(() => {
        setIsVoiceModalOpen(false);
        liveSessionRef.current?.close();
        cleanupAudioResources();
        setChatHistory([]);
        setIsAiSpeaking(false);
    }, [cleanupAudioResources]);
    
    const handleStartLiveConversation = async () => {
        setIsVoiceModalOpen(true);
        setVoiceModalStatus('initializing');
        setVoiceModalError(null);
        setChatHistory([]);
        setIsAiSpeaking(false);
    
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            setVoiceModalError(t('error_api_key_voice', language));
            setVoiceModalStatus('error');
            return;
        }
    
        const currentQuestion = localizedShuffledQuestions[currentQuestionIndex];
        const currentOptions = optionsCache.get(currentQuestion.id);
    
        if (!currentOptions) {
            setVoiceModalError(t('error_options_not_loaded', language));
            setVoiceModalStatus('error');
            return;
        }
    
        const ai = new GoogleGenAI({ apiKey });
        const languageName = getLanguageName(language);

        const submitAnswerFunctionDeclaration: FunctionDeclaration = {
          name: 'submitAnswer',
          parameters: {
            type: Type.OBJECT,
            description: 'Submits the user\'s final answer choice and a summary of their reasoning.',
            properties: {
              selectedOptionIndex: {
                type: Type.INTEGER,
                description: `The zero-based index of the option that best matches the user's viewpoint. Options: ${currentOptions.map((o, i) => `${i}: ${o.text}`).join('; ')}`,
              },
              comment: {
                type: Type.STRING,
                description: `A brief, one-sentence summary in ${languageName} of the user's reasoning.`,
              },
              farewell: {
                type: Type.STRING,
                description: `A short, encouraging closing remark in ${languageName} to be spoken to the user.`,
              }
            },
            required: ['selectedOptionIndex', 'comment', 'farewell'],
          },
        };

        const systemInstruction = `You are a conversational AI assistant acting as a philosophical guide. Your goal is to have a brief, natural conversation in ${languageName} to explore the user's thoughts on a specific question.
The question is: "${currentQuestion.text}"
Your task is to understand the user's viewpoint and then call the 'submitAnswer' function with the index of the option that best matches their view, along with a comment summarizing their reasoning. Do not prolong the conversation. Be efficient. Start by asking an open-ended question about the main topic.`;
    
        let nextStartTime = 0;
        const sources = new Set<AudioBufferSourceNode>();
        const currentInputTranscription = { current: '' };
        const currentOutputTranscription = { current: '' };

        // FIX: Use a deferred promise pattern to resolve the session for the callback closure
        // This prevents 'sessionPromise' from being used before initialization.
        let resolveSession: (s: LiveSession) => void;
        const internalSessionPromise = new Promise<LiveSession>((resolve) => {
            resolveSession = resolve;
        });
    
        try {
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' }}},
                    systemInstruction,
                    tools: [{ functionDeclarations: [submitAnswerFunctionDeclaration] }],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: async () => {
                        console.log('Live session opened.');
                        setVoiceModalStatus('listening');
                        inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        mediaStreamRef.current = stream;
                        
                        const source = inputAudioContextRef.current.createMediaStreamSource(stream);
                        mediaStreamSourceRef.current = source;
                        
                        const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        audioProcessorNodeRef.current = scriptProcessor;
                        
                        scriptProcessor.onaudioprocess = (event) => {
                            const inputData = event.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            // Use the internal promise which we ensure is available in scope
                            internalSessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.toolCall) {
                            for (const fc of message.toolCall.functionCalls) {
                                if (fc.name === 'submitAnswer') {
                                    // FIX: Add type assertion for function call arguments to prevent potential 'unknown' type errors.
                                    const args = fc.args as { selectedOptionIndex: number; comment: string; farewell: string };
                                    const { selectedOptionIndex, comment, farewell } = args;
                                    const option = currentOptions[selectedOptionIndex];
                                    if (option) {
                                        handleAnswer({
                                            questionId: currentQuestion.id,
                                            score: option.score,
                                            optionText: option.text,
                                            remark: comment || '',
                                        });
                                    }
                                    if (farewell) await speak(farewell, language);
                                    handleCloseVoiceModal();
                                }
                            }
                        }

                        if (message.serverContent?.outputTranscription) {
                            currentOutputTranscription.current += message.serverContent.outputTranscription.text;
                        }
                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscription.current += message.serverContent.inputTranscription.text;
                        }

                        if (message.serverContent?.turnComplete) {
                            const newHistory: ChatMessage[] = [];
                            const userInput = currentInputTranscription.current.trim();
                            const modelOutput = currentOutputTranscription.current.trim();
                            if (userInput) newHistory.push({ role: 'user', text: userInput });
                            if (modelOutput) newHistory.push({ role: 'model', text: modelOutput });
                            if (newHistory.length > 0) setChatHistory(prev => [...prev, ...newHistory]);
                            currentInputTranscription.current = '';
                            currentOutputTranscription.current = '';
                        }
    
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
                               outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
                            }
                            const outputAudioContext = outputAudioContextRef.current;
                            nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                            const source = outputAudioContext.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContext.destination);
                            
                            source.onended = () => {
                                sources.delete(source);
                                if (sources.size === 0) {
                                    setIsAiSpeaking(false);
                                }
                            };
                            
                            setIsAiSpeaking(true);
                            source.start(nextStartTime);
                            nextStartTime += audioBuffer.duration;
                            sources.add(source);
                        }
    
                        if (message.serverContent?.interrupted) {
                            sources.forEach(source => source.stop());
                            sources.clear();
                            nextStartTime = 0;
                            setIsAiSpeaking(false);
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Live session error:', e);
                        setVoiceModalError(t('error_chat_message', language));
                        setVoiceModalStatus('error');
                    },
                    onclose: () => {
                        console.log('Live session closed.');
                        cleanupAudioResources();
                    }
                }
            });
            
            // Resolve the internal promise now that we have the session promise
            sessionPromise.then(s => resolveSession(s));
            liveSessionRef.current = await sessionPromise;

        } catch (e: any) {
            console.error("Error starting live session:", e);
            setVoiceModalError(e.message || t('error_start_chat', language));
            setVoiceModalStatus('error');
        }
    };

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center min-h-screen text-slate-100">
       <svg className="animate-spin h-12 w-12 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8
 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      <p className="mt-4 text-slate-400">{t('loading_results', language)}</p>
    </div>
  );
  
    const QuizHeader = () => (
        <div className="w-full max-w-2xl mx-auto px-4 pt-4">
             <div className="text-center mb-2">
                <p className="text-slate-400 font-semibold">
                  {t('question_progress', language, { current: currentQuestionIndex + 1, total: shuffledQuestions.length })}
                </p>
              </div>
            <ProgressBar current={currentQuestionIndex + 1} total={shuffledQuestions.length} />
            <div className="flex justify-between items-center mt-4">
                <button
                    onClick={() => setIsExitConfirmOpen(true)}
                    className="bg-red-800/80 hover:bg-red-700 text-white font-bold text-sm py-2 px-4 rounded-lg shadow-md transition-colors"
                >
                    {t('exit', language)}
                </button>
                 <div className="flex items-center gap-2">
                    <button
                        onClick={handleGenerateReport}
                        disabled={isGeneratingReport || answers.size === 0}
                        className="bg-cyan-600/80 hover:bg-cyan-500 text-white font-bold text-sm py-2 px-4 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGeneratingReport ? t('generating_report', language) : t('save_and_report', language)}
                    </button>
                    <button
                        onClick={() => setIsTtsEnabled(prev => !prev)}
                        title={isTtsEnabled ? t('tts_disable', language) : t('tts_enable', language)}
                        className={`p-2 rounded-full transition-colors ${isTtsActive ? 'bg-cyan-600 animate-pulse text-white' : 'bg-slate-700/80 hover:bg-slate-600 text-white'}`}
                        aria-label="Toggle Text-to-Speech"
                    >
                        {isTtsEnabled ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        )}
                    </button>
                    <LanguageSelector language={language} setLanguage={setLanguage} inQuiz={true} />
                 </div>
            </div>
        </div>
    );
    
    const ExitConfirmationModal = () => (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-8 max-w-sm w-full">
                <h2 className="text-2xl font-bold text-slate-100 mb-4">{t('confirm_exit_title', language)}</h2>
                <p className="text-slate-400 mb-6">{t('confirm_exit_text', language)}</p>
                <div className="flex justify-end gap-4">
                    <button onClick={() => setIsExitConfirmOpen(false)} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg">{t('cancel', language)}</button>
                    <button onClick={confirmExit} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-lg">{t('exit', language)}</button>
                </div>
            </div>
        </div>
    );

    const ReportModal = () => {
        const latestImage = worldviewImageHistory.length > 0 ? worldviewImageHistory.slice().reverse().find(img => img) : null;
        const completionPercentage = ((answers.size / shuffledQuestions.length) * 100).toFixed(0);

        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <h2 className="text-3xl font-bold text-cyan-400 font-display mb-4">{t('report_intermediate_title', language)}</h2>
                    <p className="text-slate-400 mb-6">{t('progress', language)}: {answers.size} / {shuffledQuestions.length} ({completionPercentage}%)</p>
                    
                    <div className="bg-slate-900/70 p-6 rounded-lg border border-slate-700 space-y-4 mb-6">
                        <h3 className="text-xl font-bold text-slate-200">{t('report_preliminary_analysis', language)}</h3>
                        <p className="text-slate-300 whitespace-pre-wrap">{intermediateReportText}</p>
                    </div>

                     {latestImage && (
                        <div className="space-y-4">
                             <h3 className="text-xl font-bold text-slate-200">{t('worldview_visualization', language)}</h3>
                             <div className="flex justify-center bg-black/20 p-2 rounded-lg">
                                <img src={latestImage} alt={t('worldview_visualization', language)} className="rounded-md shadow-lg max-w-xs w-full" />
                             </div>
                        </div>
                    )}

                    <div className="flex justify-end mt-8">
                        <button onClick={() => setIsReportModalOpen(false)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg">{t('close', language)}</button>
                    </div>
                </div>
            </div>
        );
    };

  const renderContent = () => {
    switch (appState) {
      case 'introduction':
        return <Introduction onStart={handleStartQuiz} language={language} setLanguage={setLanguage} onViewSavedResult={handleViewSavedResult} />;
      case 'quiz':
        if (localizedShuffledQuestions.length === 0) return null;
        const currentQuestion = localizedShuffledQuestions[currentQuestionIndex];
        return (
          <div className="flex flex-col items-center min-h-screen py-6">
            <QuizHeader />
            <div className="w-full max-w-2xl p-4 sm:p-6 md:p-8">
              <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-6 md:p-8 border border-slate-700">
                  <QuestionCard
                    question={currentQuestion}
                    questionNumber={currentQuestionIndex + 1}
                    totalQuestions={shuffledQuestions.length}
                    onAnswer={handleAnswer}
                    onNext={handleNextQuestion}
                    onPrevious={handlePreviousQuestion}
                    isFirst={currentQuestionIndex === 0}
                    isLast={currentQuestionIndex === shuffledQuestions.length - 1}
                    currentAnswer={answers.get(currentQuestion.id)}
                    currentOptions={optionsCache.get(currentQuestion.id)}
                    isLoading={isLoadingOptions}
                    error={error}
                    isTtsEnabled={isTtsEnabled}
                    onStartVoiceAnswer={handleStartLiveConversation}
                    language={language}
                  />
              </div>
            </div>
            {isExitConfirmOpen && <ExitConfirmationModal />}
            {isReportModalOpen && <ReportModal />}
            {isVoiceModalOpen && (
                <VoiceAnswerModal 
                    isOpen={isVoiceModalOpen}
                    onClose={handleCloseVoiceModal}
                    status={voiceModalStatus}
                    error={voiceModalError}
                    chatHistory={chatHistory}
                    language={language}
                    isAiSpeaking={isAiSpeaking}
                />
            )}
          </div>
        );
      case 'results':
        const finalImage = viewingWorldviewImage ?? (worldviewImageHistory.length > 0 ? worldviewImageHistory.slice().reverse().find(img => img) : null);
        return (
            <Suspense fallback={renderLoading()}>
                <Results 
                    answers={viewingAnswers ?? answers} 
                    onRestart={handleStartQuiz} 
                    worldviewImageUrl={finalImage} 
                    language={language} 
                    isViewingSaved={!!viewingAnswers}
                    onReturnToHome={handleReturnToHome}
                />
            </Suspense>
        );
      default:
        return <Introduction onStart={handleStartQuiz} language={language} setLanguage={setLanguage} onViewSavedResult={handleViewSavedResult} />;
    }
  };

  return (
    <main className="bg-slate-900 min-h-screen antialiased">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-slate-700/[0.2] [mask-image:linear-gradient(to_bottom,white_20%,transparent_100%)]"></div>
      <div className="relative">
          {renderContent()}
      </div>
    </main>
  );
};

export default App;