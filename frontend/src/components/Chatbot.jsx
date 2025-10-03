import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./Chatbot.css";

// Configuration
const AGENT_API_URL = "http://127.0.0.1:8000/agent";
const WS_URL = "ws://127.0.0.1:8000/ws";

// Voice Activity Detection Configuration
const VAD_CONFIG = {
  SILENCE_THRESHOLD: 0.04, // Minimum audio level to consider as speech
  SILENCE_DURATION: 1500, // Milliseconds of silence before considering speech ended
  MIN_SPEECH_DURATION: 500, // Minimum speech duration to process
  MAX_SPEECH_DURATION: 30000, // Maximum speech duration before timeout
  SAMPLE_RATE: 16000,
  BUFFER_SIZE: 4096,
  INACTIVITY_TIMEOUT: 9000, // 9 seconds of inactivity before prompting user
  MAX_PROMPT_ATTEMPTS: 2, // Maximum number of times to prompt user before pausing
};

// Random messages to prompt user when silence is detected
const SILENCE_PROMPTS = [
  "Are you still there?",
  "Hello? Can you hear me?",
  "I'm still here if you need any help.",
  // "Did you have any other questions?",
  "Let me know if you need anything else.",
];

// Tool Registry - Safe, whitelisted functions
const createToolRegistry = (navigate, wsConnection) => ({
  highlight_element: async ({ selector, duration = 2000 }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);

    el.classList.add("agent-highlight");
    await new Promise((resolve) => setTimeout(resolve, duration));
    el.classList.remove("agent-highlight");
    return `Highlighted element ${selector} for ${duration}ms`;
  },

  fill_input: async ({ selector, value }) => {
    // Wait for element to be available (up to 5 seconds)
    let el = null;
    const maxWaitTime = 5000;
    const startTime = Date.now();

    while (!el && Date.now() - startTime < maxWaitTime) {
      el = document.querySelector(selector);
      if (!el) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    if (!el)
      throw new Error(
        `Element not found: ${selector} (waited ${maxWaitTime}ms)`
      );

    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
      throw new Error(`Element is not an input field: ${selector}`);
    }

    el.value = value;
    console.log(`🔧 Set DOM value for ${selector}: "${value}"`);

    // Dispatch standard events
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    // Dispatch custom event for React state synchronization
    const customEvent = new CustomEvent("agent-fill", {
      bubbles: true,
      detail: { value, selector },
    });

    console.log(`📤 Dispatching agent-fill event:`, { value, selector });
    el.dispatchEvent(customEvent);

    return `Filled input ${selector} with value '${value}'`;
  },

  navigate_to_page: async ({ path }) => {
    if (!path) throw new Error("Path is required for navigation");

    // Use React Router's navigate function
    navigate(path);
    console.log(`✅ Navigated to: ${path}`);

    // Wait for navigation to complete and DOM to update
    await new Promise((resolve) => setTimeout(resolve, 300));
    return `Navigated to ${path}`;
  },

  click_element: async ({ selector }) => {
    // Wait for element to be available (up to 5 seconds)
    let el = null;
    const maxWaitTime = 5000;
    const startTime = Date.now();

    while (!el && Date.now() - startTime < maxWaitTime) {
      el = document.querySelector(selector);
      if (!el) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (!el)
      throw new Error(
        `Element not found: ${selector} (waited ${maxWaitTime}ms)`
      );

    el.click();
    return `Clicked element ${selector}`;
  },

  wait_for_element: async ({ selector, timeout = 5000 }) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkElement = () => {
        const el = document.querySelector(selector);
        if (el) {
          resolve(`Element ${selector} found`);
        } else if (Date.now() - startTime > timeout) {
          reject(
            new Error(`Element ${selector} not found within ${timeout}ms`)
          );
        } else {
          setTimeout(checkElement, 100);
        }
      };

      checkElement();
    });
  },

  scroll_to_element: async ({ selector }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for scroll to complete
    return `Scrolled to element ${selector}`;
  },

  get_element_text: async ({ selector }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);

    const text = el.textContent || el.innerText || "";
    return `Text from ${selector}: "${text}"`;
  },

  take_screenshot: async ({ filename = null }) => {
    // This is a placeholder - actual screenshot would require a more complex implementation
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotName = filename || `screenshot-${timestamp}`;

    // For now, we'll just return a success message
    // In a real implementation, you might use html2canvas or similar
    return `Screenshot taken: ${screenshotName}`;
  },
});

const Chatbot = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I'm your AI assistant here to help you to interact with our website. How can I help you today?",
      sender: "ai",
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);

  // WebSocket connection state
  const [wsConnection, setWsConnection] = useState(null);
  const [clientId] = useState(
    () => `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );

  // Tool execution queue state
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const toolQueueRef = useRef([]);
  const isProcessingRef = useRef(false);

  // Enhanced Speech-to-Speech state for continuous conversation
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [speechError, setSpeechError] = useState(null);
  const [autoSpeak, setAutoSpeak] = useState(true);

  // Continuous conversation state
  const [conversationMode, setConversationMode] = useState("manual"); // 'manual' | 'continuous' | 'paused'
  const [isInConversation, setIsInConversation] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [isWaitingForSpeech, setIsWaitingForSpeech] = useState(false);
  const [hasWelcomed, setHasWelcomed] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState(null);
  const [silenceAttempts, setSilenceAttempts] = useState(0);
  const [voiceState, setVoiceState] = useState("ready"); // 'idle' | 'ready' | 'listening' | 'speaking' | 'processing'

  // Chat interface state
  const [interfaceMode, setInterfaceMode] = useState("voice"); // 'voice' | 'chat'

  // Memory management state
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [conversationHistory, setConversationHistory] = useState([]);

  // Speech API refs
  const recognitionRef = useRef(null);
  const synthesisRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  // Voice Activity Detection refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const vadTimeoutRef = useRef(null);
  const speechStartTimeRef = useRef(null);
  const lastSpeechTimeRef = useRef(null);
  const isSpeechActiveRef = useRef(false);
  const speechQueueRef = useRef([]);
  const continuousModeRef = useRef(false);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // Conversation flow refs
  const silenceTimeoutRef = useRef(null);
  const isProcessingTranscriptRef = useRef(false);
  const lastProcessedTranscriptRef = useRef("");
  const handleMessageRef = useRef(null);
  const speakTextRef = useRef(null);
  const stopConversationRef = useRef(null);
  const safeStartRecognitionRef = useRef(null);
  const handleSilenceTimeoutRef = useRef(null);
  const pauseConversationRef = useRef(null);
  const silenceAttemptsRef = useRef(0);

  // Create tool registry with navigate function
  const toolRegistry = React.useMemo(() => {
    if (!navigate) return null;
    return createToolRegistry(navigate, wsConnection);
  }, [navigate, wsConnection]);

  // Memory management functions
  const clearMemory = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/memory/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
        }),
      });

      if (response.ok) {
        console.log("Memory cleared successfully");
        // Reset conversation history in frontend
        setConversationHistory([]);
        setMessages([
          {
            id: 1,
            text: "Hello! I'm your AI assistant here to help you to interact with our website. How can I help you today?",
            sender: "ai",
            timestamp: new Date(),
          },
        ]);
      } else {
        console.error("Failed to clear memory");
      }
    } catch (error) {
      console.error("Error clearing memory:", error);
    }
  };

  const getMemorySummary = async () => {
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/memory/summary/${clientId}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log("Memory summary:", data.summary);
        return data.summary;
      }
    } catch (error) {
      console.error("Error getting memory summary:", error);
    }
    return null;
  };

  const toggleMemory = () => {
    setMemoryEnabled(!memoryEnabled);
    if (!memoryEnabled) {
      console.log("Memory enabled");
    } else {
      console.log("Memory disabled");
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Voice Activity Detection is handled by browser's Speech Recognition API
  // No need for custom VAD implementation

  const handleContinuousMessage = useCallback(
    async (messageText) => {
      // Only process if we've welcomed the user
      if (!hasWelcomed) {
        console.log(
          "⏳ Waiting for welcome message to complete before processing"
        );
        return;
      }

      // Clear any existing silence timer since we're processing
      if (silenceTimer) {
        console.log("🔕 Clearing silence timer - processing message");
        clearTimeout(silenceTimer);
        setSilenceTimer(null);
      }

      // Reset silence attempts when user speaks
      console.log("🔄 Resetting silence attempts - user spoke");
      silenceAttemptsRef.current = 0;
      setSilenceAttempts(0);

      const userMessage = {
        id: messages.length + 1,
        text: messageText,
        sender: "user",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsTyping(true);
      setIsProcessing(true);

      try {
        const response = await fetch(AGENT_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: messageText,
            client_id: memoryEnabled ? clientId : null, // Only send client_id if memory is enabled
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const agentResponse = await response.json();

        if (!agentResponse.content) {
          throw new Error("Invalid response format: missing content");
        }

        const aiResponse = {
          id: messages.length + 2,
          text: agentResponse.content,
          sender: "ai",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiResponse]);
        setIsConnected(true);

        // Automatically speak the AI response
        if (autoSpeak && agentResponse.content) {
          setTimeout(() => {
            if (speakTextRef.current) {
              speakTextRef.current(agentResponse.content);
            }
          }, 500);
        }
      } catch (error) {
        console.error("Error calling agent API:", error);
        setIsConnected(false);

        // Speak error message
        if (autoSpeak) {
          setTimeout(() => {
            if (speakTextRef.current) {
              speakTextRef.current("Sorry, there was an error.");
            }
          }, 500);
        }

        const fallbackResponse = {
          id: messages.length + 2,
          text: "Sorry, there was an error.",
          sender: "ai",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, fallbackResponse]);
      } finally {
        setIsTyping(false);
        setIsProcessing(false);
        isProcessingTranscriptRef.current = false;
      }
    },
    [messages.length, clientId, autoSpeak, hasWelcomed, silenceTimer]
  );

  // Store the function in a ref so it can be called from event handlers
  handleMessageRef.current = handleContinuousMessage;

  // Function to handle silence timeout with multiple attempts and random prompts
  const handleSilenceTimeout = useCallback(() => {
    const currentAttempt = silenceAttemptsRef.current;
    console.log("⏰ Silence timeout reached, attempt:", currentAttempt + 1);

    if (currentAttempt < VAD_CONFIG.MAX_PROMPT_ATTEMPTS) {
      // Pick a random prompt message
      const randomPrompt =
        SILENCE_PROMPTS[Math.floor(Math.random() * SILENCE_PROMPTS.length)];
      console.log(
        `🔊 Attempt ${currentAttempt + 1}/${
          VAD_CONFIG.MAX_PROMPT_ATTEMPTS
        } - Asking: "${randomPrompt}"`
      );

      // Increment attempts using ref
      silenceAttemptsRef.current = currentAttempt + 1;
      setSilenceAttempts(currentAttempt + 1);

      if (speechSupported && synthesisRef.current) {
        synthesisRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(randomPrompt);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        utterance.onstart = () => {
          console.log(`🔊 Prompt "${randomPrompt}" started`);
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          setVoiceState("speaking");
        };

        utterance.onend = () => {
          console.log(
            `🔊 Prompt "${randomPrompt}" ended - restarting recognition`
          );
          setIsSpeaking(false);
          isSpeakingRef.current = false;

          // Restart recognition after the prompt - don't show ready state in between
          setTimeout(() => {
            // Make sure recognition is stopped before starting
            if (recognitionRef.current && continuousModeRef.current) {
              try {
                // Stop if it's running
                if (isListeningRef.current) {
                  recognitionRef.current.stop();
                  setIsListening(false);
                  isListeningRef.current = false;
                }

                // Wait a bit for stop to complete, then start
                setTimeout(() => {
                  if (
                    safeStartRecognitionRef.current &&
                    continuousModeRef.current
                  ) {
                    safeStartRecognitionRef.current();

                    // Set up another 7 second timeout
                    const timeoutId = setTimeout(() => {
                      if (recognitionRef.current && isListeningRef.current) {
                        recognitionRef.current.stop();
                        setIsListening(false);
                        isListeningRef.current = false;
                        if (handleSilenceTimeoutRef.current) {
                          handleSilenceTimeoutRef.current(); // Try next attempt
                        }
                      }
                    }, VAD_CONFIG.INACTIVITY_TIMEOUT);

                    setSilenceTimer(timeoutId);
                  }
                }, 100);
              } catch (error) {
                console.error(
                  "Error managing recognition after prompt:",
                  error
                );
              }
            }
          }, 200);
        };

        utterance.onerror = (event) => {
          console.error(`🔊 Prompt "${randomPrompt}" error:`, event.error);
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          setVoiceState("ready");

          // Even if TTS fails, restart recognition
          setTimeout(() => {
            if (safeStartRecognitionRef.current && continuousModeRef.current) {
              safeStartRecognitionRef.current();
            }
          }, 500);
        };

        synthesisRef.current.speak(utterance);
      }
    } else {
      // Max attempts reached - speak hold message then pause conversation
      console.log(
        `🔊 Max attempts (${VAD_CONFIG.MAX_PROMPT_ATTEMPTS}) reached - putting call on hold`
      );
      silenceAttemptsRef.current = 0;
      setSilenceAttempts(0);

      // Speak "putting call on hold" message before pausing
      if (speechSupported && synthesisRef.current) {
        synthesisRef.current.cancel();

        const holdMessage =
          "Putting the call on hold. Press resume when you're ready to continue.";
        const utterance = new SpeechSynthesisUtterance(holdMessage);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        utterance.onstart = () => {
          console.log("🔊 Hold message started");
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          setVoiceState("speaking");
        };

        utterance.onend = () => {
          console.log("🔊 Hold message ended - pausing conversation");
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          setVoiceState("idle");

          // Pause the conversation after speaking
          if (pauseConversationRef.current) {
            pauseConversationRef.current();
          }
        };

        utterance.onerror = (event) => {
          console.error("🔊 Hold message error:", event.error);
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          setVoiceState("idle");

          // Pause anyway even if TTS fails
          if (pauseConversationRef.current) {
            pauseConversationRef.current();
          }
        };

        synthesisRef.current.speak(utterance);
      } else {
        // If speech not supported, just pause
        if (pauseConversationRef.current) {
          pauseConversationRef.current();
        }
      }
    }
  }, [speechSupported]);

  // Store the function in a ref so it can be called from event handlers
  handleSilenceTimeoutRef.current = handleSilenceTimeout;

  // Continuous conversation control functions

  const stopContinuousConversation = useCallback(() => {
    console.log("🛑 Stopping continuous conversation mode");

    continuousModeRef.current = false;
    setConversationMode("manual");
    setIsInConversation(false);
    setVoiceState("ready");
    setIsListening(false);
    isListeningRef.current = false;
    setIsProcessing(false);

    // Stop speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Stop speech synthesis
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }

    // Clear any silence timers
    if (silenceTimer) {
      clearTimeout(silenceTimer);
    }

    setCurrentTranscript("");
  }, [silenceTimer]);

  // Store the function in a ref so it can be called from event handlers
  stopConversationRef.current = stopContinuousConversation;

  // Helper function to safely start speech recognition
  const safeStartRecognition = useCallback(() => {
    if (!speechSupported || !recognitionRef.current) {
      return false;
    }

    try {
      // Always stop first to avoid "already started" error
      if (isListeningRef.current) {
        console.log("🎤 Stopping existing recognition before starting new one");
        recognitionRef.current.stop();
        setIsListening(false);
        isListeningRef.current = false;

        // Wait for stop to complete before starting
        setTimeout(() => {
          try {
            if (recognitionRef.current && !isListeningRef.current) {
              recognitionRef.current.start();
              // State will be set by onstart handler
            }
          } catch (error) {
            console.error("Error starting recognition after stop:", error);
          }
        }, 300);
        return true;
      } else {
        // Not currently listening, safe to start
        recognitionRef.current.start();
        // State will be set by onstart handler
        return true;
      }
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      return false;
    }
  }, [speechSupported]);

  // Store the function in a ref so it can be called from event handlers
  safeStartRecognitionRef.current = safeStartRecognition;

  const pauseConversation = useCallback(() => {
    if (conversationMode === "continuous") {
      setConversationMode("paused");
      continuousModeRef.current = false;
      setIsListening(false);
      isListeningRef.current = false;

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    }
  }, [conversationMode]);

  // Store the function in a ref so it can be called from event handlers
  pauseConversationRef.current = pauseConversation;

  const resumeConversation = useCallback(() => {
    if (conversationMode === "paused") {
      setConversationMode("continuous");
      continuousModeRef.current = true;
      // Start listening directly to avoid circular dependency
      if (safeStartRecognitionRef.current) {
        safeStartRecognitionRef.current();
      }
    }
  }, [conversationMode]);

  // Enhanced Speech Synthesis Functions with interruption support
  const speakText = useCallback(
    (text) => {
      if (!speechSupported || !synthesisRef.current || !autoSpeak) {
        return;
      }

      // Stop any current speech
      synthesisRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // Configure voice settings
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;

      // Try to select a good voice
      const voices = synthesisRef.current.getVoices();
      const preferredVoice = voices.find(
        (voice) =>
          voice.lang.startsWith("en") &&
          (voice.name.includes("Google") ||
            voice.name.includes("Microsoft") ||
            voice.name.includes("Alex"))
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        console.log("🔊 Speech synthesis started");
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        setVoiceState("speaking");
        setIsInterrupted(false);
      };

      utterance.onend = () => {
        console.log("🔊 Speech synthesis ended");
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        currentUtteranceRef.current = null;

        // In continuous mode, restart listening after speaking
        if (
          continuousModeRef.current &&
          conversationMode === "continuous" &&
          hasWelcomed
        ) {
          // Don't set ready state - go straight to listening to avoid flicker
          setTimeout(() => {
            if (
              continuousModeRef.current &&
              !isProcessingTranscriptRef.current
            ) {
              // Start listening and set up silence timeout
              if (
                safeStartRecognitionRef.current &&
                safeStartRecognitionRef.current()
              ) {
                // Set up 7 second silence timeout
                const timeoutId = setTimeout(() => {
                  if (recognitionRef.current && isListeningRef.current) {
                    recognitionRef.current.stop();
                    setIsListening(false);
                    isListeningRef.current = false;
                    if (handleSilenceTimeoutRef.current) {
                      handleSilenceTimeoutRef.current();
                    }
                  }
                }, VAD_CONFIG.INACTIVITY_TIMEOUT);

                setSilenceTimer(timeoutId);
              }
            }
          }, 200);
        } else {
          setVoiceState("idle");
        }
      };

      utterance.onerror = (event) => {
        console.error("🔊 Speech synthesis error:", event.error);
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceState("idle");
        currentUtteranceRef.current = null;
      };

      currentUtteranceRef.current = utterance;
      synthesisRef.current.speak(utterance);
    },
    [speechSupported, autoSpeak, conversationMode, hasWelcomed]
  );

  // Store the function in a ref so it can be called from event handlers
  speakTextRef.current = speakText;

  // New conversation flow functions

  const speakWelcomeMessage = useCallback(() => {
    const welcomeMessage =
      "Hello! I'm your AI assistant here to help you to interact with our website. How can I help you today?";
    console.log("🎤 Speaking welcome message");

    // Don't add welcome message to conversation history since it's already in the initial state
    // Just speak the welcome message with custom onend callback
    if (speechSupported && synthesisRef.current && autoSpeak) {
      // Stop any current speech
      synthesisRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(welcomeMessage);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 0.8;

      // Try to select a good voice
      const voices = synthesisRef.current.getVoices();
      const preferredVoice = voices.find(
        (voice) =>
          voice.lang.startsWith("en") &&
          (voice.name.includes("Google") ||
            voice.name.includes("Microsoft") ||
            voice.name.includes("Alex"))
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        console.log("🔊 Welcome message started");
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        setVoiceState("speaking");
      };

      utterance.onend = () => {
        console.log("🔊 Welcome message ended - starting recognition");
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setHasWelcomed(true);
        // Don't set ready state - go straight to listening

        // Start recognition after welcome message ends
        setTimeout(() => {
          if (
            safeStartRecognitionRef.current &&
            safeStartRecognitionRef.current()
          ) {
            // Set up 7 second silence timeout
            const timeoutId = setTimeout(() => {
              if (recognitionRef.current && isListeningRef.current) {
                recognitionRef.current.stop();
                setIsListening(false);
                isListeningRef.current = false;
                if (handleSilenceTimeoutRef.current) {
                  handleSilenceTimeoutRef.current();
                }
              }
            }, VAD_CONFIG.INACTIVITY_TIMEOUT);

            setSilenceTimer(timeoutId);
          }
        }, 200);
      };

      utterance.onerror = (event) => {
        console.error("🔊 Welcome message error:", event.error);
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceState("idle");
        setHasWelcomed(true);
      };

      currentUtteranceRef.current = utterance;
      synthesisRef.current.speak(utterance);
    } else {
      // If speech not supported, just set hasWelcomed to true
      setHasWelcomed(true);
    }
  }, [speechSupported, autoSpeak]);

  const startPhoneCallMode = useCallback(async () => {
    console.log("📞 Starting phone call mode");

    // Clear any previous errors
    setSpeechError(null);

    setConversationMode("continuous");
    setIsInConversation(true);
    continuousModeRef.current = true;
    setSpeechError(null);
    setHasWelcomed(false); // Reset welcome state
    silenceAttemptsRef.current = 0; // Reset silence attempts
    setSilenceAttempts(0);

    // Speak welcome message first
    speakWelcomeMessage();
  }, [speakWelcomeMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [silenceTimer]);

  // Initialize Speech APIs
  useEffect(() => {
    const initializeSpeechAPIs = () => {
      // Check for Speech Recognition support
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const SpeechSynthesis = window.speechSynthesis;

      if (SpeechRecognition && SpeechSynthesis) {
        setSpeechSupported(true);

        // Initialize Speech Recognition for continuous mode
        const recognition = new SpeechRecognition();
        recognition.continuous = true; // Enable continuous recognition
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.maxAlternatives = 1;

        // Speech Recognition event handlers
        recognition.onstart = () => {
          console.log("🎤 Speech recognition started");
          setIsListening(true);
          isListeningRef.current = true; // Update ref as well
          setVoiceState("listening");
          setIsWaitingForSpeech(true);
          setSpeechError(null);
          setCurrentTranscript(""); // Clear previous transcript when starting

          // Clear any existing silence timer
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            setSilenceTimer(null);
          }

          // Set timeout for silence detection - only if not processing or speaking
          if (!isProcessingTranscriptRef.current && !isSpeakingRef.current) {
            console.log(
              `⏰ Setting ${
                VAD_CONFIG.INACTIVITY_TIMEOUT / 1000
              } second silence timeout`
            );
            const timeoutId = setTimeout(() => {
              console.log(
                `⏰ ${
                  VAD_CONFIG.INACTIVITY_TIMEOUT / 1000
                } second timeout triggered, isListening:`,
                isListeningRef.current,
                "isSpeaking:",
                isSpeakingRef.current
              );
              // Only trigger silence timeout if we're listening and not processing/speaking
              if (
                recognitionRef.current &&
                isListeningRef.current &&
                !isProcessingTranscriptRef.current &&
                !isSpeakingRef.current
              ) {
                recognitionRef.current.stop();
                setIsListening(false);
                isListeningRef.current = false;
                if (handleSilenceTimeoutRef.current) {
                  handleSilenceTimeoutRef.current();
                }
              } else {
                console.log(
                  "⏰ Silence timeout ignored - processing or speaking"
                );
              }
            }, VAD_CONFIG.INACTIVITY_TIMEOUT);

            setSilenceTimer(timeoutId);
          } else {
            console.log(
              "⏰ Skipping silence timeout - already processing or speaking"
            );
          }
        };

        recognition.onresult = (event) => {
          let finalTranscript = "";
          let interimTranscript = "";

          console.log("🎤 Speech recognition result:", event.results);

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          console.log(
            "🎤 Final:",
            finalTranscript,
            "Interim:",
            interimTranscript
          );

          // Update current transcript for display
          setCurrentTranscript(finalTranscript || interimTranscript);

          // Clear silence timer and reset attempts when speech is detected
          if ((finalTranscript || interimTranscript) && silenceTimer) {
            console.log(
              "🔄 Clearing silence timer and resetting attempts - user speaking"
            );
            clearTimeout(silenceTimer);
            setSilenceTimer(null);
            silenceAttemptsRef.current = 0; // Reset silence attempts when user speaks
            setSilenceAttempts(0);
          }

          // Process final transcript with 1 second delay
          if (finalTranscript && finalTranscript.trim()) {
            console.log(
              "🎤 Processing final transcript:",
              finalTranscript.trim()
            );
            // Process transcript directly to avoid closure issues
            const transcript = finalTranscript.trim();
            if (
              !isProcessingTranscriptRef.current &&
              lastProcessedTranscriptRef.current !== transcript
            ) {
              isProcessingTranscriptRef.current = true;
              lastProcessedTranscriptRef.current = transcript;

              // Stop listening while processing
              recognition.stop();
              setCurrentTranscript("");
              setVoiceState("processing");

              // Clear any existing silence timer
              if (silenceTimer) {
                clearTimeout(silenceTimer);
                setSilenceTimer(null);
              }

              // Wait 1 second before processing to allow user to continue speaking
              setTimeout(() => {
                console.log(
                  "🔄 Processing transcript after delay:",
                  transcript
                );
                if (handleMessageRef.current) {
                  handleMessageRef.current(transcript);
                }
              }, 1000);
            }
          }
        };

        recognition.onend = () => {
          console.log("🎤 Speech recognition ended");
          setIsListening(false);
          isListeningRef.current = false;
          setIsWaitingForSpeech(false);

          // Don't change state here - let other handlers manage state transitions
          // This prevents flicker between states

          // Clear silence timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
          }

          // Clear current transcript
          setCurrentTranscript("");

          // Note: No auto-restart here - recognition will be restarted by TTS onend callbacks
        };

        recognition.onerror = (event) => {
          console.error("🎤 Speech recognition error:", event.error);
          setIsListening(false);
          isListeningRef.current = false;
          setCurrentTranscript("");

          let errorMessage = "Speech recognition error";
          switch (event.error) {
            case "no-speech":
              errorMessage = "No speech detected. Please try again.";
              break;
            case "audio-capture":
              errorMessage = "Microphone not found or access denied.";
              break;
            case "not-allowed":
              errorMessage = "Microphone permission denied.";
              break;
            case "network":
              errorMessage = "Network error occurred.";
              break;
            default:
              errorMessage = `Speech recognition error: ${event.error}`;
          }
          setSpeechError(errorMessage);
        };

        recognitionRef.current = recognition;

        // Initialize Speech Synthesis
        synthesisRef.current = SpeechSynthesis;

        // Load voices if they're not already loaded
        const loadVoices = () => {
          const voices = SpeechSynthesis.getVoices();
          if (voices.length > 0) {
            console.log("🎤 Available voices:", voices.length);
          }
        };

        // Load voices immediately if available
        loadVoices();

        // Load voices when they become available (some browsers load them asynchronously)
        SpeechSynthesis.addEventListener("voiceschanged", loadVoices);

        console.log("✅ Speech APIs initialized successfully");
      } else {
        console.warn("⚠️ Speech APIs not supported in this browser");
        setSpeechSupported(false);
        setSpeechError(
          "Speech recognition and synthesis are not supported in this browser."
        );
      }
    };

    initializeSpeechAPIs();

    // Cleanup function
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (currentUtteranceRef.current) {
        synthesisRef.current?.cancel();
      }
    };
  }, []);

  // Tool queue processing function
  const processToolQueue = async () => {
    if (isProcessingRef.current || toolQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    setIsProcessingQueue(true);
    console.log("🔄 Starting tool queue processing...");
    while (toolQueueRef.current.length > 0) {
      const toolCall = toolQueueRef.current.shift();
      console.log(`⚡ Processing tool: ${toolCall.tool}`, toolCall.args);

      try {
        await executeToolCall(toolCall);
        console.log(`✅ Tool ${toolCall.tool} completed successfully`);

        // Add a small delay between tool executions to ensure DOM updates
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`❌ Tool ${toolCall.tool} failed:`, error);
        // Continue with next tool even if one fails
      }
    }

    isProcessingRef.current = false;
    setIsProcessingQueue(false);
    console.log("🏁 Tool queue processing completed");
  };

  // Add tool to queue
  const addToolToQueue = (toolCall) => {
    toolQueueRef.current.push(toolCall);
    console.log(
      `📝 Added tool to queue: ${toolCall.tool}`,
      toolQueueRef.current.length,
      "tools in queue"
    );

    // Start processing if not already processing
    if (!isProcessingRef.current) {
      processToolQueue();
    }
  };

  // WebSocket connection management
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(`${WS_URL}/${clientId}`);

        ws.onopen = () => {
          console.log("WebSocket connected");
          console.log("Client ID:", clientId);
          setWsConnection(ws);
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log("WebSocket message received:", message);

            if (message.tool && message.args) {
              // Add tool to queue for sequential execution
              addToolToQueue({
                tool: message.tool,
                args: message.args,
              });
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        ws.onclose = () => {
          console.log("WebSocket disconnected");
          setWsConnection(null);
          setIsConnected(false);
          // Attempt to reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setIsConnected(false);
        };

        return ws;
      } catch (error) {
        console.error("Failed to create WebSocket connection:", error);
        setIsConnected(false);
        return null;
      }
    };

    const ws = connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [clientId]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: messages.length + 1,
      text: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage("");
    setCurrentTranscript(""); // Clear speech transcript when sending message
    setIsTyping(true);

    try {
      // Call the agent API
      const response = await fetch(AGENT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: currentInput,
          client_id: memoryEnabled ? clientId : null, // Only send client_id if memory is enabled
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const agentResponse = await response.json();

      // Validate the response format
      if (!agentResponse.content) {
        throw new Error("Invalid response format: missing content");
      }

      // Create AI message with the content from the agent response
      const aiResponse = {
        id: messages.length + 2,
        text: agentResponse.content,
        sender: "ai",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiResponse]);
      setIsConnected(true);

      // Automatically speak the AI response
      if (autoSpeak && agentResponse.content) {
        setTimeout(() => {
          if (speakTextRef.current) {
            speakTextRef.current(agentResponse.content);
          }
        }, 500);
      }
    } catch (error) {
      console.error("Error calling agent API:", error);
      setIsConnected(false);

      // Fallback to local response if API fails
      const fallbackResponse = {
        id: messages.length + 2,
        text: "I'm sorry, I'm having trouble connecting to the server right now. Please try again later or contact support.",
        sender: "ai",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, fallbackResponse]);

      // Automatically speak the fallback response
      if (autoSpeak) {
        setTimeout(() => {
          if (speakTextRef.current) {
            speakTextRef.current(fallbackResponse.text);
          }
        }, 500);
      }
    } finally {
      setIsTyping(false);
    }
  };

  // Tool Executor
  const executeToolCall = async (toolCall) => {
    if (!(toolCall.tool in toolRegistry)) {
      throw new Error(`Unknown tool: ${toolCall.tool}`);
    }

    try {
      console.log(`Executing tool: ${toolCall.tool}`, toolCall.args);
      const result = await toolRegistry[toolCall.tool](toolCall.args);
      console.log(`✅ Tool ${toolCall.tool} executed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Error executing tool ${toolCall.tool}:`, error);
      throw error;
    }
  };

  // Fallback response function (kept for error handling)
  const getAIResponse = (userInput) => {
    const input = userInput.toLowerCase();

    if (input.includes("hello") || input.includes("hi")) {
      return "Hello! Nice to meet you. I'm here to help you navigate our website and answer any questions you might have.";
    } else if (input.includes("help") || input.includes("support")) {
      return "I'm here to help! You can ask me about our services, products, or any general questions about our website. What would you like to know?";
    } else if (input.includes("services") || input.includes("service")) {
      return "Our services include web development, mobile app development, and digital marketing solutions. You can visit our Services page to learn more about what we offer.";
    } else if (input.includes("contact") || input.includes("reach")) {
      return "You can contact us through our Contact page, or reach out via email. We're always happy to help with any inquiries you might have.";
    } else if (input.includes("about") || input.includes("company")) {
      return "We are a technology company focused on delivering innovative solutions. Visit our About page to learn more about our mission and team.";
    } else if (
      input.includes("price") ||
      input.includes("cost") ||
      input.includes("pricing")
    ) {
      return "For detailed pricing information, please contact us directly through our Contact page. We provide customized quotes based on your specific needs.";
    } else if (input.includes("thank") || input.includes("thanks")) {
      return "You're very welcome! I'm glad I could help. Is there anything else you'd like to know?";
    } else {
      return "That's an interesting question! While I don't have specific information about that, I'd be happy to help you find the right person to talk to. You can contact us through our Contact page for more detailed assistance.";
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const toggleChatbot = () => {
    setIsOpen(!isOpen);
  };

  const toggleInterfaceMode = () => {
    setInterfaceMode(interfaceMode === "voice" ? "chat" : "voice");
  };

  // Speech Recognition Functions
  const startListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      setSpeechError("Speech recognition not available");
      return;
    }

    try {
      setSpeechError(null);
      setCurrentTranscript(""); // Clear previous transcript when starting new recognition
      console.log("🎤 Starting speech recognition...");
      recognitionRef.current.start();
      setIsListening(true);
      isListeningRef.current = true;
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setSpeechError("Failed to start speech recognition");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListeningRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
    }
  };

  const stopSpeaking = useCallback(() => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      currentUtteranceRef.current = null;
    }
  }, []);

  const toggleAutoSpeak = () => {
    setAutoSpeak(!autoSpeak);
    if (!autoSpeak && isSpeaking) {
      stopSpeaking();
    }
  };

  // Clear speech error after a delay
  useEffect(() => {
    if (speechError) {
      const timer = setTimeout(() => {
        setSpeechError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [speechError]);

  // Handle page visibility changes to pause/resume speech
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isSpeaking) {
        // Pause speech when page becomes hidden
        if (synthesisRef.current) {
          synthesisRef.current.pause();
        }
      } else if (!document.hidden && isSpeaking) {
        // Resume speech when page becomes visible
        if (synthesisRef.current) {
          synthesisRef.current.resume();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isSpeaking]);

  // Handle browser tab focus/blur for speech recognition
  useEffect(() => {
    const handleFocus = () => {
      // Browser regained focus - speech recognition might need restart
      if (isListeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 100);
        } catch (error) {
          console.warn("Error restarting speech recognition on focus:", error);
        }
      }
    };

    const handleBlur = () => {
      // Browser lost focus - stop speech recognition to save resources
      if (isListeningRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.warn("Error stopping speech recognition on blur:", error);
        }
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return (
    <div className="chatbot-container">
      {/* ElevenLabs-Style Voice Interface */}
      {isOpen && (
        <div className="voice-interface">
          {/* Header with minimal controls */}
          <div className="voice-header">
            <div className="connection-status">
              <div
                className={`status-indicator ${
                  isConnected ? "connected" : "disconnected"
                }`}
              ></div>
              <span className="status-text">
                {isConnected ? "Connected" : "Offline"}
                {/* {memoryEnabled && " • Memory"} */}
              </span>
            </div>

            <div className="header-controls">
              {/* <button
                className={`setting-btn ${memoryEnabled ? "active" : ""}`}
                onClick={toggleMemory}
                title={memoryEnabled ? "Disable memory" : "Enable memory"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M15,7V9H12V11H15V13H12V15H15V17H9V7H15M5,3H19A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3M5,5V19H19V5H5Z" />
                </svg>
              </button> */}

              {/* <button
                className="setting-btn"
                onClick={clearMemory}
                title="Clear conversation memory"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
                </svg>
              </button> */}

              <button
                className={`setting-btn ${autoSpeak ? "active" : ""}`}
                onClick={toggleAutoSpeak}
                title={autoSpeak ? "Disable auto-speak" : "Enable auto-speak"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              </button>

              <button
                className="interface-toggle"
                onClick={toggleInterfaceMode}
                title={
                  interfaceMode === "voice"
                    ? "Switch to chat"
                    : "Switch to voice"
                }
              >
                {interfaceMode === "voice" ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                  </svg>
                )}
              </button>

              <button className="close-button" onClick={toggleChatbot}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Main Interface - Voice or Chat */}
          <div className="voice-main">
            {interfaceMode === "voice" ? (
              /* Voice Interface */
              <div className="voice-interface-content">
                {/* Large Voice Animation */}
                <div className="voice-animation-container">
                  <div className={`voice-animation ${voiceState}`}>
                    <div className="voice-circle">
                      <div className="voice-icon">
                        {voiceState === "listening" ? (
                          <svg
                            width="50"
                            height="50"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                          </svg>
                        ) : voiceState === "speaking" ? (
                          <svg
                            width="50"
                            height="50"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                          </svg>
                        ) : voiceState === "processing" ? (
                          <svg
                            width="50"
                            height="50"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
                          </svg>
                        ) : voiceState === "ready" ? (
                          <svg
                            width="50"
                            height="50"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                          </svg>
                        ) : (
                          <svg
                            width="50"
                            height="50"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <circle cx="12" cy="12" r="2" opacity="0.8" />
                            <circle
                              cx="12"
                              cy="12"
                              r="5"
                              opacity="0.4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="8"
                              opacity="0.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Voice Level Waveform */}
                      {voiceState === "listening" && (
                        <div className="voice-waveform">
                          {Array.from({ length: 8 }, (_, i) => (
                            <div
                              key={i}
                              className="wave-bar"
                              style={{
                                "--delay": `${i * 0.1}s`,
                                "--height": `${30 + (i % 2) * 20}px`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Text */}
                <div className="voice-status">
                  {conversationMode === "continuous" && isInConversation ? (
                    <>
                      {voiceState === "listening" && (
                        <span className="status-text">Listening...</span>
                      )}
                      {voiceState === "speaking" && (
                        <span className="status-text">Speaking...</span>
                      )}
                      {voiceState === "processing" && (
                        <span className="status-text">Processing...</span>
                      )}
                      {voiceState === "ready" && (
                        <span className="status-text">Ready to talk</span>
                      )}
                    </>
                  ) : (
                    <span className="status-text">
                      {speechSupported
                        ? "Voice assistant ready"
                        : "Voice not supported"}
                    </span>
                  )}
                </div>

                {/* Current Transcript */}
                {currentTranscript && (
                  <div className="current-transcript">
                    <p>{currentTranscript}</p>
                  </div>
                )}

                {/* Error Display */}
                {speechError && (
                  <div className="voice-error">
                    <div className="error-content">
                      <p>⚠️ {speechError}</p>
                      {speechError.includes("already in use") && (
                        <button
                          className="retry-btn"
                          onClick={startPhoneCallMode}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Conversation Controls */}
                <div className="conversation-controls">
                  {conversationMode === "manual" && (
                    <button
                      className="start-conversation-btn"
                      onClick={startPhoneCallMode}
                      disabled={!speechSupported}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                      </svg>
                      Start Conversation
                    </button>
                  )}

                  {conversationMode === "continuous" && (
                    <div className="continuous-controls">
                      <button
                        className="pause-conversation-btn"
                        onClick={pauseConversation}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                        Pause
                      </button>

                      <button
                        className="end-conversation-btn"
                        onClick={stopContinuousConversation}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z" />
                        </svg>
                        End Call
                      </button>
                    </div>
                  )}

                  {conversationMode === "paused" && (
                    <button
                      className="resume-conversation-btn"
                      onClick={resumeConversation}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Resume
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Chat Interface */
              <div className="chat-interface">
                {/* Chat Messages */}
                <div className="chat-messages">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat-message ${
                        message.sender === "user" ? "user" : "ai"
                      }`}
                    >
                      <div className="message-content">
                        <p>{message.text}</p>
                        <span className="message-time">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="chat-message ai typing">
                      <div className="message-content">
                        <div className="typing-indicator">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input */}
                <div className="chat-input-container">
                  <div className="chat-input-wrapper">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message here..."
                      className="chat-input"
                      rows="1"
                      disabled={isTyping}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isTyping}
                      className="send-button"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <div className="floating-buttons">
        <button className="chatbot-toggle" onClick={toggleChatbot}>
          {isOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default Chatbot;
