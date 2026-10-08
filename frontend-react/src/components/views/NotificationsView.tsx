import React from 'react';
import { Bell, BellOff, CheckCheck, AlertTriangle, Info, CheckCircle2, RotateCcw, Upload } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { HelpTooltip } from '../common/HelpTooltip';

const getTypeIcon = (type?: string) => {
  switch (type) {
    case 'alert':   return <AlertTriangle className="w-4 h-4 text-rose-500" />;
    case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'rollback': return <RotateCcw className="w-4 h-4 text-orange-500" />;
    case 'upload':  return <Upload className="w-4 h-4 text-blue-500" />;
    default:        return <Info className="w-4 h-4 text-blue-500" />;
  }
};

export const NotificationsView: React.FC = () => {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useStore();

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Bell className="w-6 h-6 text-rose-500 dark:text-rose-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              System Notifications
            </h1>
            <HelpTooltip
              title="System Notifications"
              explanation="Real-time alerts for document uploads, approval decisions, workflow state changes, rollback events, and pipeline errors."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up — no unread notifications'}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllNotificationsRead()}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark all as read</span>
          </button>
        )}
      </div>

      {/* Notification count badge */}
      {notifications.length > 0 && (
        <div className="flex items-center space-x-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono">{notifications.length} total</span>
          <span>·</span>
          <span className="text-rose-500 font-bold">{unreadCount} unread</span>
          <span>·</span>
          <span>{notifications.length - unreadCount} read</span>
        </div>
      )}

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3">
          <BellOff className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">No notifications yet.</p>
          <p className="text-slate-400 dark:text-slate-500 text-xs font-mono">
            Notifications appear here when documents are uploaded, approvals complete, or pipeline events occur.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex items-start space-x-4 p-4 rounded-2xl border transition-all ${
                notif.read
                  ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/40 shadow-sm'
              }`}
            >
              {/* Icon */}
              <div className="mt-0.5 shrink-0 w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                {getTypeIcon((notif as any).type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold leading-snug ${
                  notif.read ? 'text-slate-600 dark:text-slate-300' : 'text-slate-900 dark:text-white'
                }`}>
                  {notif.message}
                </p>
                {(notif as any).detail && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono leading-relaxed">
                    {(notif as any).detail}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1.5">
                  {(notif as any).timestamp || (notif as any).time || ''}
                </p>
              </div>

              {/* Unread indicator + mark-read */}
              <div className="flex items-center space-x-2 shrink-0 pt-0.5">
                {!notif.read ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <button
                      onClick={() => markNotificationRead(notif.id)}
                      className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                    >
                      Mark read
                    </button>
                  </>
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
