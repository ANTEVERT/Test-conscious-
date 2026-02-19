import React, { useEffect, useRef } from 'react';
import { VoiceModalStatus } from '../App';
import { ChatMessage } from '../types';
import { Language, t } from '../i18n';

interface VoiceAnswerModalProps {
    isOpen: boolean;
    onClose: () => void;
    status: VoiceModalStatus;
    error: string | null;
    chatHistory: ChatMessage[];
    language: Language;
    isAiSpeaking?: boolean;
}

interface ChatBubbleProps {
    role: 'user' | 'model';
    text: string;
    isLoading?: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ role, text, isLoading }) => {
    const isUser = role === 'user';
    const bubbleClass = isUser
        ? 'bg-cyan-600 self-end rounded-l-2xl rounded-tr-2xl'
        : 'bg-slate-700 self-start rounded-r-2xl rounded-tl-2xl';

    if (isLoading) {
        return (
            <div className={`p-3 max-w-xs md:max-w-md transition-opacity duration-300 ${bubbleClass}`}>
                <div className="flex items-center justify-center space-x-1">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                </div>
            </div>
        );
    }
    
    return (
        <div className={`p-3 text-slate-100 max-w-xs md:max-w-md transition-opacity duration-300 ${bubbleClass}`}>
            {text}
        </div>
    );
};

// SORP Visualizer (Sound Orb Ripple Pulse)
const SorpVisualizer = () => {
    return (
        <div className="relative flex items-center justify-center w-20 h-20">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-20 animate-ping"></span>
            <span className="absolute inline-flex h-[80%] w-[80%] rounded-full bg-cyan-500 opacity-30 animate-pulse"></span>
            <span className="relative inline-flex h-[60%] w-[60%] rounded-full bg-cyan-600 shadow-[0_0_15px_rgba(6,182,212,0.6)]"></span>
            
             {/* Wave lines simulation */}
            <div className="absolute flex gap-1 items-center justify-center h-full w-full">
                <div className="w-1 bg-white/60 h-3 animate-[pulse_1s_ease-in-out_infinite]"></div>
                <div className="w-1 bg-white/60 h-6 animate-[pulse_1.2s_ease-in-out_infinite_0.1s]"></div>
                <div className="w-1 bg-white/60 h-4 animate-[pulse_0.8s_ease-in-out_infinite_0.2s]"></div>
            </div>
        </div>
    );
};


const VoiceAnswerModal = ({ isOpen, onClose, status, error, chatHistory, language, isAiSpeaking }: VoiceAnswerModalProps) => {
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory, status]);
    
    const renderStatusText = () => {
        switch(status) {
            case 'initializing':
                return t('voice_status_initializing', language);
            case 'listening':
                return t('voice_status_listening', language);
            case 'processing':
                 return t('voice_status_processing', language);
            case 'error':
                 return error || t('voice_status_error', language);
            case 'idle':
                return t('voice_status_idle', language);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-xl max-w-lg w-full h-[80vh] max-h-[700px] text-center flex flex-col items-center p-6">
                <h2 className="text-2xl font-bold text-slate-100 mb-4 font-display">{t('voice_modal_title', language)}</h2>
                
                <div ref={chatContainerRef} className="flex-grow w-full mb-4 p-4 flex flex-col space-y-4 overflow-y-auto bg-slate-900/50 rounded-lg border border-slate-700">
                    {chatHistory.map((msg, index) => (
                         <ChatBubble key={index} role={msg.role} text={msg.text} />
                    ))}
                    {status === 'processing' && (
                        <ChatBubble role="model" text="..." isLoading={true} />
                    )}
                </div>

                <div className="h-16 flex items-center justify-center">
                    <p className={`text-center transition-opacity duration-300 ${status === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                        {renderStatusText()}
                    </p>
                </div>

                <div className="my-4">
                    {isAiSpeaking ? (
                        <SorpVisualizer />
                    ) : (
                        <button 
                            disabled={true}
                            className={`rounded-full w-20 h-20 flex items-center justify-center transition-all duration-300
                                ${status === 'listening' ? 'bg-cyan-600 animate-pulse' : 'bg-slate-600'}
                            `}
                            aria-label={t('voice_status_listening', language)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>
                    )}
                </div>
                
                <button 
                    onClick={onClose} 
                    className="mt-4 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-6 rounded-lg disabled:opacity-50"
                    disabled={status === 'processing' || status === 'initializing'}
                >
                    {t('close', language)}
                </button>
            </div>
        </div>
    );
};

export default VoiceAnswerModal;