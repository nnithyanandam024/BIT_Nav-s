import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Navigation2,
  Clock,
  Flame,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Volume2,
  RotateCcw,
  MapPin,
  X,
  SlidersHorizontal,
  Bot,
  Building,
  Compass,
  Play,
  Sparkles,
  Key,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { testGeminiApiKey } from '../services/nlpEngine';

const SAMPLE_PROMPTS = [
  "Where is Mechatronics Lab?",
  "Take me to Main Auditorium",
  "Switch to satellite view",
  "Find nearest Canteen",
  "Where is ECE Seminar Hall?",
  "Route from Cauvery Hostel to Sports Ground"
];

export default function AIAssistant({
  landmarks,
  activeRoute,
  onCalculateRoute,
  onCalculateNearest,
  onClearRoute,
  onProcessAIQuery,
  soundEnabled,
  apiKey,
  onSaveApiKey,
  onOpenSettings,
  isOpen,
  onToggleOpen
}) {
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: "BIT NAV'S Assistant for Bannari Amman Institute of Technology (BIT). Ask for directions or search any room or building on campus.",
      timestamp: new Date()
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [manualFrom, setManualFrom] = useState('as-main-left');
  const [manualTo, setManualTo] = useState('main-auditorium');

  const [showKeyBar, setShowKeyBar] = useState(false);
  const [inlineKey, setInlineKey] = useState('');
  const [isInlineTesting, setIsInlineTesting] = useState(false);
  const [inlineStatus, setInlineStatus] = useState(null);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (activeRoute?.turnByTurn) {
      setActiveTab('directions');
    }
  }, [activeRoute]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputQuery(transcript);
        handleSend(transcript);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const speakInstruction = (text) => {
    if (!soundEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const handleInlineSaveAndTest = async () => {
    if (!inlineKey.trim()) return;
    setIsInlineTesting(true);
    setInlineStatus(null);
    try {
      const res = await testGeminiApiKey(inlineKey.trim());
      setInlineStatus(res);
      if (res.success && onSaveApiKey) {
        onSaveApiKey(inlineKey.trim());
        setInlineKey('');
        setTimeout(() => setShowKeyBar(false), 1600);
      }
    } catch (err) {
      setInlineStatus({ success: false, message: err.message || 'Test failed' });
    } finally {
      setIsInlineTesting(false);
    }
  };

  const handleSend = async (queryText = inputQuery) => {
    const query = (queryText || '').trim();
    if (!query || isLoading) return;

    // Direct Gemini API Key Detection (e.g. AIzaSy... or long key string pasted into chat)
    const clean = query.trim();
    const isApiKey = clean.startsWith('AIza') || (clean.length >= 35 && !clean.includes(' ') && /^[A-Za-z0-9_-]+$/.test(clean));
    if (isApiKey) {
      setInputQuery('');
      setIsLoading(true);
      const masked = clean.length > 10 ? `${clean.slice(0, 6)}...${clean.slice(-4)}` : '***';
      const userMsg = {
        id: Date.now().toString(),
        role: 'user',
        text: `Saved API Key (${masked})`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMsg]);

      const testRes = await testGeminiApiKey(clean);
      if (testRes.success) {
        if (onSaveApiKey) onSaveApiKey(clean);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: `Gemini API Key connected and activated!\n\n${testRes.message}\nGenerative AI reasoning is now live. Ask me any question like "Where is Mechatronics Lab?" or "Directions from Main Gate to Auditorium".`,
          timestamp: new Date()
        }]);
      } else {
        if (onSaveApiKey) onSaveApiKey(clean);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: `Key saved to storage, but verification test returned: "${testRes.message}".\nPlease ensure your key is valid and Generative Language API is enabled in Google AI Studio.`,
          timestamp: new Date()
        }]);
      }
      setIsLoading(false);
      return;
    }

    setInputQuery('');
    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: query,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const result = await onProcessAIQuery(query, messages);
      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: result?.aiParsed?.conversational_response || "Here is your navigation route.",
        aiParsed: result?.aiParsed,
        routeResult: result?.routeResult,
        nearestResult: result?.nearestResult,
        matchingPlaces: result?.matchingPlaces,
        destinationPlace: result?.routeResult?.to || result?.aiParsed?.destPlace || null,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (result?.routeResult) {
        speakInstruction(`Route to ${result.routeResult.to.name}. ${result.routeResult.route.totalDistance} meters, about ${result.routeResult.route.walkingMinutes} minutes walk.`);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: "Could not calculate route. Please try another query.",
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRoute = () => {
    if (manualFrom === manualTo) return;
    onCalculateRoute(manualFrom, manualTo);
  };

  const handleSwap = () => {
    const temp = manualFrom;
    setManualFrom(manualTo);
    setManualTo(temp);
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: 20,
      zIndex: 40,
      width: isOpen ? 380 : 250,
      maxWidth: 'calc(100vw - 40px)',
      maxHeight: isOpen ? 'calc(100vh - 110px)' : 'auto',
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'auto'
    }}>
      {/* Header */}
      <div className="minimal-panel" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottomLeftRadius: isOpen ? 0 : 'var(--radius-lg)',
        borderBottomRightRadius: isOpen ? 0 : 'var(--radius-lg)',
        cursor: 'pointer'
      }} onClick={onToggleOpen}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26,
            height: 26,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F2F4F2'
          }}>
            <Bot size={15} />
          </div>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              BIT NAV'S Assistant
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {apiKey ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenSettings) onOpenSettings();
              }}
              className="minimal-btn"
              style={{
                padding: '2px 7px',
                fontSize: '0.64rem',
                color: '#10B981',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              title="Google Gemini AI is active. Click to manage settings."
            >
              <Sparkles size={11} /> Gemini 1.5
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowKeyBar(!showKeyBar);
              }}
              className="minimal-btn"
              style={{
                padding: '2px 7px',
                fontSize: '0.64rem',
                color: 'var(--color-accent)',
                background: 'rgba(92, 225, 230, 0.1)',
                border: '1px solid rgba(92, 225, 230, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              title="Click to paste Gemini API key"
            >
              <Key size={11} /> Paste Key
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded Container */}
      {isOpen && (
        <div className="minimal-panel" style={{
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderTop: 'none',
          display: 'flex',
          flexDirection: 'column',
          height: 480,
          overflow: 'hidden'
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            padding: '5px 10px',
            gap: 6,
            background: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border-subtle)'
          }}>
            <button
              onClick={() => setActiveTab('chat')}
              className={`minimal-btn ${activeTab === 'chat' ? 'active' : ''}`}
              style={{ flex: 1, padding: '5px 6px', fontSize: '0.72rem' }}
            >
              AI Chat
            </button>
            {activeRoute && (
              <button
                onClick={() => setActiveTab('directions')}
                className={`minimal-btn ${activeTab === 'directions' ? 'active' : ''}`}
                style={{ flex: 1.2, padding: '5px 6px', fontSize: '0.72rem' }}
              >
                Directions ({activeRoute.turnByTurn?.length || 0})
              </button>
            )}
            <button
              onClick={() => setActiveTab('manual')}
              className={`minimal-btn ${activeTab === 'manual' ? 'active' : ''}`}
              style={{ flex: 1, padding: '5px 6px', fontSize: '0.72rem' }}
            >
              Selector
            </button>
          </div>

          {/* Active Route Summary Bar */}
          {activeRoute && (
            <div style={{
              background: '#131E17',
              borderBottom: '1px solid var(--border-active)',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                  Active Route
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => speakInstruction(`Start from ${activeRoute.from.name}, walk to ${activeRoute.to.name}. Distance is ${activeRoute.route.totalDistance} meters.`)}
                    style={{ fontSize: '0.7rem', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 3 }}
                  >
                    <Volume2 size={13} /> Listen
                  </button>
                  <button onClick={onClearRoute} style={{ color: 'var(--text-secondary)' }}>
                    <X size={13} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{activeRoute.from?.shortName}</span>
                <ArrowRight size={12} color="var(--text-secondary)" />
                <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{activeRoute.to?.shortName}</span>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <span className="minimal-badge" style={{ fontSize: '0.65rem' }}>
                  {activeRoute.route.totalDistance}m
                </span>
                <span className="minimal-badge" style={{ fontSize: '0.65rem' }}>
                  ~{activeRoute.route.walkingMinutes} min
                </span>
                <span className="minimal-badge" style={{ fontSize: '0.65rem' }}>
                  {activeRoute.route.caloriesBurned} kcal
                </span>
              </div>
            </div>
          )}

          {/* TAB 1: AI CHAT */}
          {activeTab === 'chat' && (
            <>
              {(!apiKey || showKeyBar) && (
                <div style={{
                  margin: '8px 10px 0 10px',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: '#131D16',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <Key size={13} color="var(--color-accent)" />
                      <span>{apiKey ? 'Update Gemini API Key' : 'Paste Gemini Key (Optional)'}</span>
                    </div>
                    {apiKey && (
                      <button
                        onClick={() => setShowKeyBar(false)}
                        style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="password"
                      placeholder="Paste AIzaSy... here"
                      value={inlineKey}
                      onChange={(e) => {
                        setInlineKey(e.target.value);
                        setInlineStatus(null);
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: '#0D140F',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.74rem',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <button
                      onClick={handleInlineSaveAndTest}
                      disabled={isInlineTesting || !inlineKey.trim()}
                      className="minimal-btn minimal-btn-primary"
                      style={{ fontSize: '0.72rem', padding: '5px 10px', whiteSpace: 'nowrap' }}
                    >
                      {isInlineTesting ? 'Testing...' : 'Save & Test'}
                    </button>
                  </div>
                  {inlineStatus && (
                    <div style={{
                      fontSize: '0.69rem',
                      color: inlineStatus.success ? '#10B981' : '#FCA5A5',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      {inlineStatus.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      <span>{inlineStatus.message}</span>
                    </div>
                  )}
                </div>
              )}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      gap: 3
                    }}
                  >
                    <div style={{
                      maxWidth: '90%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: msg.role === 'user' ? 'var(--color-primary)' : '#141D17',
                      border: msg.role === 'user' ? '1px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                      fontSize: '0.8rem',
                      lineHeight: '1.4',
                      color: 'var(--text-primary)'
                    }}>
                      {msg.text}

                      {/* Room/Lab Match Card */}
                      {msg.aiParsed?.roomDetails && (
                        <div style={{
                          marginTop: 8,
                          padding: '7px 9px',
                          background: 'rgba(92, 225, 230, 0.08)',
                          border: '1px solid rgba(92, 225, 230, 0.25)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.72rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--color-accent)' }}>
                            <Building size={13} />
                            <span>{msg.aiParsed.roomDetails.roomName}</span>
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.66rem', marginTop: 2 }}>
                            {msg.aiParsed.roomDetails.floorName} • {msg.aiParsed.roomDetails.building}
                          </div>
                        </div>
                      )}

                      {/* Route Summary Card */}
                      {msg.routeResult?.route && (
                        <div style={{
                          marginTop: 8,
                          padding: '7px 9px',
                          background: 'rgba(43, 174, 114, 0.1)',
                          border: '1px solid rgba(43, 174, 114, 0.25)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <span className="minimal-badge" style={{ fontSize: '0.62rem' }}>
                              {msg.routeResult.route.totalDistance}m
                            </span>
                            <span className="minimal-badge" style={{ fontSize: '0.62rem' }}>
                              ~{msg.routeResult.route.walkingMinutes} min
                            </span>
                          </div>
                          <button
                            onClick={() => speakInstruction(`Route to ${msg.routeResult.to?.name}. ${msg.routeResult.route.totalDistance} meters, about ${msg.routeResult.route.walkingMinutes} minutes.`)}
                            className="minimal-btn"
                            title="Read Directions"
                            style={{ padding: '2px 6px', fontSize: '0.65rem', gap: 3 }}
                          >
                            <Volume2 size={11} /> Speak
                          </button>
                        </div>
                      )}

                      {/* Intent & AI Engine Pill */}
                      {msg.aiParsed && (
                        <div style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 4
                        }}>
                          <span className="minimal-badge" style={{ fontSize: '0.6rem' }}>
                            {msg.aiParsed.intent}
                          </span>
                          <span className="minimal-badge" style={{ fontSize: '0.6rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {msg.aiParsed.engine?.includes('Gemini') ? (
                              <>
                                <Sparkles size={10} color="var(--color-accent)" />
                                {msg.aiParsed.engine}
                              </>
                            ) : (
                              <>
                                <Navigation2 size={10} />
                                {msg.aiParsed.engine}
                              </>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Alternatives list */}
                      {msg.nearestResult?.alternatives?.length > 0 && (
                        <div style={{
                          marginTop: 6,
                          padding: '6px',
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.7rem'
                        }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-accent)', marginBottom: 2 }}>
                            Alternatives:
                          </div>
                          {msg.nearestResult.alternatives.map((alt, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                              <span>• {alt.place.shortName}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{alt.distance}m</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Step-by-Step Directions */}
                      {msg.routeResult?.turnByTurn && (
                        <div style={{
                          marginTop: 6,
                          padding: '6px',
                          background: 'rgba(0,0,0,0.25)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}>
                          <div style={{ fontWeight: 600, fontSize: '0.72rem', color: 'var(--color-accent)' }}>
                            Directions:
                          </div>
                          {msg.routeResult.turnByTurn.map(step => (
                            <div key={step.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: '0.7rem' }}>
                              <span style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: 'var(--color-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.58rem',
                                flexShrink: 0
                              }}>
                                {step.step}
                              </span>
                              <div>
                                <span>{step.instruction}</span>
                                {step.detail && <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>{step.detail}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: '#141D17',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.75rem',
                    color: 'var(--color-accent)'
                  }}>
                    Calculating route...
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Sample Prompts */}
              <div style={{
                display: 'flex',
                gap: 5,
                padding: '5px 10px',
                overflowX: 'auto',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-primary)'
              }}>
                {SAMPLE_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(prompt)}
                    className="minimal-btn"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.68rem',
                      whiteSpace: 'nowrap',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Input Box */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 10px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)'
              }}>
                <button
                  onClick={toggleVoiceInput}
                  className={`minimal-btn ${isListening ? 'active' : ''}`}
                  title="Voice input"
                  style={{ width: 30, height: 30, padding: 0 }}
                >
                  {isListening ? <MicOff size={14} color="#f43f5e" /> : <Mic size={14} />}
                </button>

                <input
                  type="text"
                  placeholder={isListening ? "Listening..." : "Ask directions or nearest facility..."}
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    fontSize: '0.82rem',
                    color: 'var(--text-primary)'
                  }}
                />

                <button
                  onClick={() => handleSend()}
                  disabled={!inputQuery.trim() || isLoading}
                  className="minimal-btn minimal-btn-primary"
                  style={{ width: 30, height: 30, padding: 0 }}
                >
                  <Send size={13} />
                </button>
              </div>
            </>
          )}

          {/* TAB: TURN-BY-TURN ROAD DIRECTIONS */}
          {activeTab === 'directions' && activeRoute && (
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 4
              }}>
                <span className="minimal-badge" style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center' }}>
                  <Navigation2 size={12} style={{ marginRight: 4 }} /> Strict Road Navigation
                </span>
                <button
                  onClick={() => {
                    const text = activeRoute.turnByTurn.map(s => s.instruction).join('. ');
                    speakInstruction(text);
                  }}
                  className="minimal-btn"
                  style={{ padding: '3px 8px', fontSize: '0.68rem', gap: 4 }}
                >
                  <Volume2 size={12} /> Read Steps
                </button>
              </div>

              {activeRoute.turnByTurn?.map((step) => (
                <div
                  key={step.step}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: '#141D17',
                    border: '1px solid var(--border-subtle)',
                    alignItems: 'flex-start'
                  }}
                >
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: step.type === 'arrive' ? 'var(--color-accent)' : 'var(--color-primary)',
                    color: '#F2F4F2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {step.step}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {step.instruction}
                    </div>
                    {step.detail && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                        {step.detail}
                      </div>
                    )}
                  </div>
                  {step.distance > 0 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-accent)', fontWeight: 600, flexShrink: 0 }}>
                      {step.distance}m
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: MANUAL SELECTOR */}
          {activeTab === 'manual' && (
            <div style={{
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              overflowY: 'auto'
            }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  START (FROM)
                </label>
                <select
                  value={manualFrom}
                  onChange={(e) => setManualFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    marginTop: 4,
                    borderRadius: 'var(--radius-sm)',
                    background: '#141D17',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                >
                  {landmarks.map(l => (
                    <option key={l.id} value={l.id} style={{ background: '#101713' }}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={handleSwap}
                  className="minimal-btn"
                  style={{ width: 30, height: 30, padding: 0 }}
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  DESTINATION (TO)
                </label>
                <select
                  value={manualTo}
                  onChange={(e) => setManualTo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    marginTop: 4,
                    borderRadius: 'var(--radius-sm)',
                    background: '#141D17',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem'
                  }}
                >
                  {landmarks.map(l => (
                    <option key={l.id} value={l.id} style={{ background: '#101713' }}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleManualRoute}
                className="minimal-btn minimal-btn-primary"
                style={{
                  padding: '9px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.84rem',
                  marginTop: 6
                }}
              >
                Calculate Route
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
