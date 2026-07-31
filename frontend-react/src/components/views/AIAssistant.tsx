import React, { useState } from 'react';
import { Bot, Send, Loader2 } from 'lucide-react';
import { HelpTooltip } from '../common/HelpTooltip';

interface Message {
  sender: 'ai' | 'user';
  text: string;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const AIAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: "Hello! I'm your Roaming Control Center AI Copilot. Ask me about any operator, document, diff, or pending approval currently in the portal." },
  ]);
  const [inputStr, setInputStr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputStr.trim() || loading) return;

    const userMsg = inputStr;
    setInputStr('');
    const nextMessages = [...messages, { sender: 'user' as const, text: userMsg }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const API_BASE = import.meta.env.VITE_API_URL || '';
      const url = `${API_BASE}/api/assistant/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ message: userMsg, history: nextMessages.slice(0, -1) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { sender: 'ai', text: `Sorry, I couldn't reach the AI service: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Bot className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">AI Roaming Process Copilot</h1>
            <HelpTooltip title="AI Assistant" explanation="Answers questions grounded in the portal's live data — operators, documents, diffs, and pending approvals." />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Ask about any operator, document, or workflow currently in the portal.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 h-[480px] flex flex-col justify-between space-y-4 shadow-sm">
        <div className="overflow-y-auto space-y-3 pr-2">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex items-start space-x-3 text-xs ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.sender === 'ai' && (
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`p-3.5 rounded-2xl max-w-lg leading-relaxed ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'}`}>
                {msg.text}
              </div>
              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-bold">ME</div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Thinking…</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="flex items-center space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <input
            type="text"
            value={inputStr}
            onChange={(e) => setInputStr(e.target.value)}
            placeholder="Ask about an operator, document, or pending approval…"
            className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
          />
          <button type="submit" disabled={loading} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-semibold shadow-md transition-colors flex items-center space-x-1">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
