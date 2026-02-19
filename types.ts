export interface GeneratedOption {
  text: string;
  score: number;
}

export interface Answer {
  questionId: number;
  score: number;
  optionText: string;
  remark: string;
}

export interface Question {
  id: number;
  text: string;
  categoryKey: string;
  categoryTitle: string;
}

export interface Category {
  title: string;
  key: string;
  questions: { id: number; text: string; }[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Fix for SpeechRecognition API types.
// This is a browser feature that is not included in TypeScript's default DOM types.
// These definitions make TypeScript aware of the API.
export interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  // Fix: Add onstart property to SpeechRecognition interface to match the Web Speech API.
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  start(): void;
  stop(): void;
  // FIX: Add abort method to SpeechRecognition interface to match the Web Speech API and fix error in VoiceAnswerModal.tsx.
  abort(): void;
}

declare global {
  var SpeechRecognition: {
    prototype: SpeechRecognition;
    new(): SpeechRecognition;
  };

  var webkitSpeechRecognition: {
    prototype: SpeechRecognition;
    new(): SpeechRecognition;
  };

  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof webkitSpeechRecognition;
    // FIX: Add webkitAudioContext to Window interface for Safari compatibility.
    webkitAudioContext: typeof AudioContext;
  }
}
