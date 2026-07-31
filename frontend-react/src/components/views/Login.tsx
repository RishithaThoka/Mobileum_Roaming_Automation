import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { Sparkles, KeyRound, User, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, setActiveTab } = useStore();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const success = await login(username, password);
      if (!success) {
        setError('Invalid admin credentials. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-cyan-600/20 blur-3xl" />

      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 space-y-8 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 p-0.5 shadow-lg shadow-blue-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white block">
              MOBILEUM PORTAL
            </h1>
            <p className="text-[10px] text-cyan-400 font-mono tracking-wider">
              ROAMING AUTOMATION CONTROL CENTER
            </p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center space-x-3 text-xs text-rose-300 animate-pulse">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Verify Credentials & Enter</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2 flex flex-col items-center space-y-2">
          <p className="text-[10px] text-slate-500 font-mono">
            Secure Admin Access Gate • Session v14.2-GSMA
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('landing')}
            className="text-[11px] text-slate-400 hover:text-cyan-400 font-mono transition-colors"
          >
            ← Back to Home
          </button>
        </div>

      </div>
    </div>
  );
};
