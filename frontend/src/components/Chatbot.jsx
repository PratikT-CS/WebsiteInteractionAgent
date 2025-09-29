import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Chatbot.css";

// Configuration
const AGENT_API_URL = "http://127.0.0.1:8000/agent";
const WS_URL = "ws://127.0.0.1:8000/ws";

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
      text: "Hello! I'm your AI assistant. How can I help you today?",
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

  // Speech-to-Speech state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [speechError, setSpeechError] = useState(null);
  const [autoSpeak, setAutoSpeak] = useState(true);

  // Speech API refs
  const recognitionRef = useRef(null);
  const synthesisRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  // Create tool registry with navigate function
  const toolRegistry = createToolRegistry(navigate);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize Speech APIs
  useEffect(() => {
    const initializeSpeechAPIs = () => {
      // Check for Speech Recognition support
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const SpeechSynthesis = window.speechSynthesis;

      if (SpeechRecognition && SpeechSynthesis) {
        setSpeechSupported(true);

        // Initialize Speech Recognition
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.maxAlternatives = 1;

        // Speech Recognition event handlers
        recognition.onstart = () => {
          console.log("🎤 Speech recognition started");
          setIsListening(true);
          setSpeechError(null);
          setCurrentTranscript(""); // Clear previous transcript when starting
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
          setCurrentTranscript(finalTranscript || interimTranscript);

          if (finalTranscript) {
            console.log("🎤 Final transcript:", finalTranscript);
            setInputMessage(finalTranscript.trim());
          }
        };

        recognition.onend = () => {
          console.log("🎤 Speech recognition ended");
          setIsListening(false);
          // Don't clear transcript immediately - let user see the final result
          // setCurrentTranscript will be cleared when user sends message or starts new recognition
        };

        recognition.onerror = (event) => {
          console.error("🎤 Speech recognition error:", event.error);
          setIsListening(false);
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
          client_id: clientId,
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
        setTimeout(() => speakText(agentResponse.content), 500);
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
        setTimeout(() => speakText(fallbackResponse.text), 500);
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
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setSpeechError("Failed to start speech recognition");
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  // Speech Synthesis Functions
  const speakText = (text) => {
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
    };

    utterance.onend = () => {
      console.log("🔊 Speech synthesis ended");
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    };

    utterance.onerror = (event) => {
      console.error("🔊 Speech synthesis error:", event.error);
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    };

    currentUtteranceRef.current = utterance;
    synthesisRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
    }
  };

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
      if (isListening && recognitionRef.current) {
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
      if (isListening && recognitionRef.current) {
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
  }, [isListening]);

  return (
    <div className="chatbot-container">
      {/* Chat Window */}
      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="chatbot-avatar">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <div className="chatbot-info">
              <h3>AI Assistant</h3>
              <span
                className={`status ${
                  isConnected ? "connected" : "disconnected"
                }`}
              >
                {isConnected ? "Connected" : "Offline"}
              </span>
              {isProcessingQueue && (
                <span className="processing-indicator">
                  🔄 Processing tools...
                </span>
              )}
              {speechSupported && (
                <span className="speech-status ready">🎤 Voice Ready</span>
              )}
              {isListening && (
                <span className="speech-status listening">🎙️ Listening...</span>
              )}
              {isSpeaking && (
                <span className="speech-status speaking">🔊 Speaking...</span>
              )}
            </div>
            <button className="close-button" onClick={toggleChatbot}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${
                  message.sender === "user" ? "user-message" : "ai-message"
                }`}
              >
                {message.sender === "ai" && (
                  <div className="message-avatar">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  </div>
                )}
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
              <div className="message ai-message typing">
                <div className="message-avatar">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            {/* Speech transcript display */}
            {currentTranscript && (
              <div className="message user-message speech-transcript">
                <div className="message-avatar">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                  </svg>
                </div>
                <div className="message-content">
                  <p className="transcript-text">{currentTranscript}</p>
                  <span className="message-time">Speaking...</span>
                </div>
              </div>
            )}

            {/* Speech error display */}
            {speechError && (
              <div className="message ai-message speech-error">
                <div className="message-avatar">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <div className="message-content">
                  <p className="error-text">⚠️ {speechError}</p>
                  <span className="message-time">Error</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-input">
            <div className="input-container">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="message-input"
              />

              {/* Speech Controls */}
              {speechSupported && (
                <div className="speech-controls">
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isSpeaking}
                    className={`microphone-button ${
                      isListening ? "listening" : ""
                    }`}
                    title={isListening ? "Stop listening" : "Start voice input"}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                    </svg>
                  </button>

                  {isSpeaking && (
                    <button
                      onClick={stopSpeaking}
                      className="stop-speaking-button"
                      title="Stop speaking"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M6 6h12v12H6z" />
                      </svg>
                    </button>
                  )}

                  <button
                    onClick={toggleAutoSpeak}
                    className={`auto-speak-button ${autoSpeak ? "active" : ""}`}
                    title={
                      autoSpeak ? "Disable auto-speak" : "Enable auto-speak"
                    }
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                  </button>
                </div>
              )}

              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim()}
                className="send-button"
              >
                <svg
                  width="18"
                  height="18"
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

      {/* Floating Buttons */}
      <div className="floating-buttons">
        {speechSupported && !isOpen && (
          <button
            className="floating-microphone"
            onClick={startListening}
            disabled={isSpeaking}
            title="Start voice input"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
          </button>
        )}

        <button className="chatbot-toggle" onClick={toggleChatbot}>
          {isOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default Chatbot;
