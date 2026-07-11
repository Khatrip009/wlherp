// src/components/AIChat/AIChat.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, X, Trash2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../api/supabase";
import "./AIChat.css";

const STORAGE_KEY = "vidhyamitra_chat_history";
const aiChatFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const AIChat = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [currentSuggestions, setCurrentSuggestions] = useState([]);
  const [currentActions, setCurrentActions] = useState([]);
  const messagesEndRef = useRef(null);

  // Persist messages to localStorage (keep last 50)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
  }, [messages]);

  // Set role from context
  useEffect(() => {
    if (profile?.role) {
      setUserRole(profile.role.toLowerCase());
    }
  }, [profile]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (messageText) => {
    const text = messageText || input.trim();
    if (!text || loading) return;

    if (!messageText) setInput("");

    const userMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setCurrentSuggestions([]);
    setCurrentActions([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please log in to use the AI assistant.");

      const history = [...messages, userMessage].slice(-10);

      const response = await fetch(aiChatFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "AI request failed");
      }

      const data = await response.json();

      const assistantMessage = { role: "assistant", content: data.reply };
      setMessages((prev) => [...prev, assistantMessage]);

      if (data.suggestions) setCurrentSuggestions(data.suggestions);
      if (data.actions) setCurrentActions(data.actions);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Error: ${error.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => sendMessage(suggestion);

  const handleActionClick = (action) => {
    switch (action.action) {
      case "navigate":
        if (action.params?.path) { navigate(action.params.path); setIsOpen(false); }
        break;
      case "confirm": sendMessage("confirm"); break;
      case "cancel": sendMessage("cancel"); break;
      case "get_suggestions": sendMessage("suggestions"); break;
      case "query":
        if (action.params?.query) sendMessage(action.params.query);
        break;
      case "mark_attendance": navigate("/attendance"); setIsOpen(false); break;
      case "view_submissions": navigate("/homework"); setIsOpen(false); break;
      case "view_inquiries": navigate("/inquiries"); setIsOpen(false); break;
      case "view_exams": navigate("/exams"); setIsOpen(false); break;
      case "review_leaves": navigate("/leave-management"); setIsOpen(false); break;
      case "generate_report":
        if (action.params?.report === "profit_loss") { navigate("/profit-loss"); setIsOpen(false); }
        break;
      default:
        if (action.label) sendMessage(action.label);
        break;
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    setCurrentSuggestions([]);
    setCurrentActions([]);
  };

  const getWelcomeMessage = () => {
    switch (userRole) {
      case "student": return "📚 Namaste! I am VidhyaMitra, your personal AI tutor. Ask me any doubt — I'll explain concepts, solve problems, and help you learn!";
      case "teacher": return "🧑🏫 Namaste! I am VidhyaMitra. I can help you create quiz questions, summarize topics, or draft lesson plans. How can I assist?";
      case "admin":
      case "super_admin": return "📊 Namaste! I am VidhyaMitra. I can analyze reports, generate insights, or help automate admin tasks.";
      default: return "👋 Namaste! I am VidhyaMitra, your AI friend at ShreeVidhya Academy. How may I help you today?";
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        className={`ai-chat-toggle ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle AI Chat"
      >
        {isOpen ? <X size={28} strokeWidth={2} /> : <MessageCircle size={28} strokeWidth={2} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="ai-chat-window">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <img src="/ChatBotLogo.png" alt="VidhyaMitra Logo" className="h-8 w-auto" />
              <span className="font-semibold text-lg text-gray-800">VidhyaMitra</span>
              <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full capitalize font-medium">
                {userRole || "User"}
              </span>
            </div>
            <div className="flex gap-1">
              <button onClick={clearChat} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded transition" title="Clear chat">
                <Trash2 size={18} />
              </button>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded transition" title="Close chat">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="ai-chat-messages flex-1 p-4 overflow-y-auto bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-center text-gray-600 mt-8">
                <p className="text-base">{getWelcomeMessage()}</p>
                <p className="text-xs text-gray-400 mt-3">💡 Ask follow‑up questions — I remember the context!</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {userRole === "student" && (
                    <>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("My attendance")}>📊 My Attendance</button>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("My results")}>📝 My Results</button>
                    </>
                  )}
                  {userRole === "teacher" && (
                    <>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("My batches")}>🧑🏫 My Batches</button>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("Mark attendance")}>📋 Mark Attendance</button>
                    </>
                  )}
                  {(userRole === "admin" || userRole === "super_admin") && (
                    <>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("Show pending fees")}>💰 Pending Fees</button>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("Profit & Loss")}>📈 P&L</button>
                      <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs px-3 py-1.5 rounded-full transition" onClick={() => sendMessage("Suggestions")}>💡 Suggestions</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-2xl shadow-sm ${
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-none"
                      : "bg-white text-gray-800 rounded-bl-none border border-gray-200"
                  }`}>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    {msg.role === "assistant" && idx === messages.length - 1 && !loading && (
                      <>
                        {currentSuggestions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {currentSuggestions.map((s, i) => (
                              <button key={i} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded-full transition" onClick={() => handleSuggestionClick(s)}>{s}</button>
                            ))}
                          </div>
                        )}
                        {currentActions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {currentActions.map((a, i) => (
                              <button key={i} className="bg-primary text-white text-xs px-3 py-1 rounded-full hover:bg-primary-dark transition" onClick={() => handleActionClick(a)}>{a.label}</button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-800 px-4 py-2 rounded-2xl rounded-bl-none border border-gray-200 shadow-sm flex items-center gap-1">
                  <span className="animate-bounce delay-0">●</span>
                  <span className="animate-bounce delay-200">●</span>
                  <span className="animate-bounce delay-300">●</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask VidhyaMitra..."
              rows="1"
              className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="bg-primary hover:bg-primary-dark text-white rounded-xl px-4 py-2 transition disabled:opacity-50"
            >
              {loading ? "⏳" : "➤"}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChat;
