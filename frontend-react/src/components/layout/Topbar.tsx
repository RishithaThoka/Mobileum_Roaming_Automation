import React, { useState } from 'react';
import {
  Search,
  Bell,
  Sun,
  Moon,
  Upload,
  HelpCircle,
  ChevronDown,
  UserCheck,
  CheckCircle2,
  Shield,
  X,
  LogOut,
  Activity
} from 'lucide-react';
import { useStore } from '../../store/useStore';

export const Topbar: React.FC = () => {
  const {
    darkMode,
    toggleDarkMode,
    helpMode,
    toggleHelpMode,
    searchQuery,
    setSearchQuery,
    setQuickUploadOpen,
    notifications,
    markAllNotificationsRead,
    markNotificationRead,
    setActiveTab,
    heartbeatStatus,
    logout
  } = useStore();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      {/* Left: Global Search */}
      <div className="flex items-center space-x-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search operators, MCC/MNC, IR.21 documents, GT routing..."
            className="w-full pl-9 pr-12 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
          />
          <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Actions, Heartbeat Indicator, Help Mode, Notifications, Profile */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Heartbeat Status Indicator */}
        {heartbeatStatus && (
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-mono">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${heartbeatStatus.running ? 'bg-emerald-400' : 'bg-slate-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${heartbeatStatus.running ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              Heartbeat: {heartbeatStatus.running ? 'Scanning' : 'Idle'}
            </span>
            {heartbeatStatus.last_scan && (
              <span className="text-slate-400 font-bold">
                ({heartbeatStatus.last_scan.slice(11, 16)})
              </span>
            )}
          </div>
        )}

        {/* Help Mode Toggle */}
        <button
          onClick={toggleHelpMode}
          title="Toggle 'What is this?' explanatory mode"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            helpMode
              ? 'bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/40 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          <span className="hidden md:inline">Help Mode</span>
        </button>

        {/* Quick Upload Button */}
        <button
          onClick={() => setQuickUploadOpen(true)}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Upload Document</span>
        </button>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="relative p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-200">System Notifications</span>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        markNotificationRead(n.id);
                        if (n.actionUrl) {
                          setActiveTab(n.actionUrl as any);
                          setNotifDropdownOpen(false);
                        }
                      }}
                      className={`p-3 text-xs cursor-pointer transition-colors ${
                        n.read ? 'bg-slate-50/40 dark:bg-slate-900/40 text-slate-500' : 'bg-blue-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-bold text-slate-900 dark:text-slate-200">{n.title}</span>
                        <span className="text-[10px] text-slate-500">{n.timestamp}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dark / Light Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          title="Toggle Light / Dark theme"
          className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Profile Avatar */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center space-x-2 pl-2"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 p-0.5 shadow-md">
              <div className="w-full h-full bg-white dark:bg-slate-950 rounded-[10px] flex items-center justify-center text-xs font-bold text-blue-600 dark:text-cyan-400">
                AD
              </div>
            </div>
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-200">Mobileum Administrator</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">admin@mobileum.com</p>
              </div>
              <div className="my-1 space-y-1 text-xs">
                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Platform Settings
                </button>
                <button
                  onClick={() => {
                    logout();
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors flex items-center space-x-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
