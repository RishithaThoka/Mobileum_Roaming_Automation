import React, { useState, useRef } from 'react';
import { Upload, X, FileCode, CheckCircle2, AlertCircle, FileUp } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { DocumentType } from '../../types';

export const QuickUploadModal: React.FC = () => {
  const { quickUploadOpen, setQuickUploadOpen, uploadDocument } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docTitle, setDocTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!quickUploadOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setDocTitle(file.name.replace(/\.[^/.]+$/, "") + ' Upload');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setDocTitle(file.name.replace(/\.[^/.]+$/, "") + ' Upload');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isSubmitting) {
      if (!selectedFile) alert('Please select a file first.');
      return;
    }
    setIsSubmitting(true);
    uploadDocument(selectedFile, docTitle)
      .then(() => {
        setQuickUploadOpen(false);
        setSelectedFile(null);
        setDocTitle('');
        setIsSubmitting(false);
      })
      .catch((err) => {
        alert(err.message || 'Ingestion failed');
        setIsSubmitting(false);
      });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative z-50 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Manual Ingest / IR.21 XML Upload</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Process GSMA roaming data into Difference Checker</p>
            </div>
          </div>
          <button
            onClick={() => setQuickUploadOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 my-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Document Title (Optional)</label>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="e.g. Inbound IR.21 XML Baseline"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* REAL FILE PICKER & DRAG & DROP AREA */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xml,.json,.zip,.txt"
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-blue-500 rounded-2xl p-6 text-center bg-slate-50/80 dark:bg-slate-950/50 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
              <FileUp className="w-6 h-6" />
            </div>

            {selectedFile ? (
              <div>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  <span>Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Click to choose a different file</p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Click to choose file or drag & drop here</p>
                <p className="text-[11px] text-slate-500 mt-1">Supports GSMA Table 14.2, XML, Zip packages up to 50MB</p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setQuickUploadOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 text-white text-xs font-semibold rounded-xl shadow-lg transition-all flex items-center space-x-2 ${isSubmitting ? 'bg-blue-400 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'}`}
            >
              <Upload className="w-4 h-4" />
              <span>{isSubmitting ? 'Processing...' : 'Ingest & Check Differences'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
