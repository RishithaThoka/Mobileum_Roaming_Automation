import React, { useState } from 'react';
import { Mail, Paperclip, CheckCircle2, RefreshCw, Send } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { OutlookEmailCategory, EmailMessage } from '../../types';
import { HelpTooltip } from '../common/HelpTooltip';

export const EmailCenter: React.FC = () => {
  const { emails, processEmailAttachment } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedEmailId, setSelectedEmailId] = useState<string>(emails[0]?.id || '');

  const categories: string[] = ['All', 'Pending Approval', 'Approved', 'Rejected', 'Rollback Alert', 'Reminder', 'Completion'];

  const filteredEmails = emails.filter((e) => selectedCategory === 'All' || e.category === selectedCategory);
  const currentEmail = emails.find((e) => e.id === selectedEmailId) || filteredEmails[0] || emails[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Mail className="w-6 h-6 text-blue-600 dark:text-cyan-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Outlook Email Notification Center</h1>
            <HelpTooltip
              title="Email Center"
              explanation="Microsoft Outlook split-pane notification hub parsing IR.21 XML and RAEX OpData attachments directly into the Difference Checker pipeline."
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Enterprise inbox for GSMA roaming updates & stage authorization alerts.</p>
        </div>
      </div>

      {/* CATEGORY FILTER BAR */}
      <div className="flex items-center space-x-2 overflow-x-auto p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* OUTLOOK SPLIT-PANE CONTAINER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm flex flex-col md:flex-row min-h-[520px]">
        {/* Left Pane: Email List */}
        <div className="w-full md:w-80 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 shrink-0">
          {filteredEmails.map((email) => {
            const isSelected = email.id === currentEmail?.id;
            return (
              <div
                key={email.id}
                onClick={() => setSelectedEmailId(email.id)}
                className={`p-3.5 cursor-pointer transition-colors space-y-1 ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-600/20 border-l-4 border-blue-600'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{email.sender}</span>
                  <span className="text-[10px] text-slate-400">{email.receivedDate.split(' ')[1] || email.receivedDate}</span>
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-300 line-clamp-1">{email.subject}</div>
                <div className="flex items-center justify-between pt-1">
                  <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {email.category}
                  </span>
                  {email.hasAttachment && <Paperclip className="w-3 h-3 text-slate-400" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Pane: Reading Pane */}
        {currentEmail ? (
          <div className="flex-1 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                    {currentEmail.category}
                  </span>
                  <span className="text-xs text-slate-500">{currentEmail.receivedDate}</span>
                </div>

                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{currentEmail.subject}</h2>

                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5 font-mono">
                  <div>From: <span className="text-slate-900 dark:text-slate-200 font-bold">{currentEmail.sender}</span> ({currentEmail.senderEmail})</div>
                  <div>To: <span className="text-slate-900 dark:text-slate-200 font-bold">{currentEmail.recipient}</span></div>
                </div>
              </div>

              {/* Email Body */}
              <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 whitespace-pre-wrap">
                {currentEmail.body}
              </div>

              {/* ATTACHMENT ACTION BAR */}
              {currentEmail.hasAttachment && (
                <div className="p-4 bg-blue-50/50 dark:bg-slate-950 rounded-2xl border border-blue-200 dark:border-blue-500/30 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Paperclip className="w-5 h-5 text-blue-600 dark:text-cyan-400" />
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{currentEmail.attachmentName}</div>
                      <div className="text-[10px] text-slate-500">{currentEmail.attachmentType} • Auto Schema Inspection Ready</div>
                    </div>
                  </div>

                  {currentEmail.processedStatus === 'Auto-Ingested' ? (
                    <span className="inline-flex items-center px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 rounded-xl text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Ingested to Difference Engine
                    </span>
                  ) : (
                    <button
                      onClick={() => processEmailAttachment(currentEmail.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center space-x-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Ingest Attachment to Pipeline</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-12 text-center text-xs text-slate-500 flex items-center justify-center">
            Select an email message to view contents
          </div>
        )}
      </div>
    </div>
  );
};
