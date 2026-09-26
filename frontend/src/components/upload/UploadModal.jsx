import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PhosphorIcon } from '../ui/PhosphorIcon';

export function UploadModal() {
  const { uploadModalOpen, setUploadModalOpen, uploadDataset, loading } = useApp();
  const [activeMode, setActiveMode] = useState('files'); // 'files' | 'folder' | 'bundled'
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState([]);
  const [customPath, setCustomPath] = useState('/Users/anwarmohammedkoji/test/SIBLIX_Test');

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
      setActiveMode('files');
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
      setActiveMode('files');
    }
  };

  const handleIngest = () => {
    if (activeMode === 'folder') {
      uploadDataset({ folderPath: customPath, overwrite: true, runPipeline: true });
    } else if (files.length > 0) {
      uploadDataset({ files, overwrite: true, runPipeline: true });
    } else {
      uploadDataset({ overwrite: true, runPipeline: true });
    }
  };

  return (
    <Modal
      isOpen={uploadModalOpen}
      onClose={() => setUploadModalOpen(false)}
      title="Upload & Sync Dataset"
      subtitle="Ingest shipping emails, attachments, or test folders into the verification pipeline"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        {/* Source Mode Switcher */}
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setActiveMode('files')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all ${
              activeMode === 'files'
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload Files / ZIP
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('folder')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all ${
              activeMode === 'folder'
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sync Local Folder
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('bundled')}
            className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-all ${
              activeMode === 'bundled'
                ? 'bg-white text-brand-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bundled 520 Dataset
          </button>
        </div>

        {/* Mode 1: Drag & Drop Files */}
        {activeMode === 'files' && (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`p-6 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer ${
                dragOver
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
              onClick={() => document.getElementById('file-upload-input')?.click()}
            >
              <input
                id="file-upload-input"
                type="file"
                multiple
                accept=".json,.pdf,.txt,.docx,.xlsx,.eml,.zip"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="w-12 h-12 rounded-2xl bg-white shadow-subtle border border-slate-200 text-brand-600 flex items-center justify-center mx-auto mb-3">
                <PhosphorIcon name="UploadSimple" size={24} weight="duotone" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800">
                {files.length > 0 ? `${files.length} file(s) selected` : 'Drop email JSONs or attachments here'}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Select .json email bundles, .txt / .pdf documents, or a .zip archive
              </p>
            </div>

            {/* Selected files preview */}
            {files.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1 p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between px-2 pb-1 border-b border-slate-200/60 text-[11px] font-semibold text-slate-600">
                  <span>Selected Files ({files.length})</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                    }}
                    className="text-red-500 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs text-slate-700 py-1 px-2 rounded hover:bg-white"
                  >
                    <span className="truncate max-w-[320px] font-mono text-[11px]">{file.name}</span>
                    <span className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mode 2: Sync Local Folder */}
        {activeMode === 'folder' && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1">
                Custom Dataset Directory Path
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Path to a directory containing <code className="text-brand-600 font-mono">inbox/</code> (emails) and <code className="text-brand-600 font-mono">attachments/</code>
              </p>
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="/path/to/test/dataset"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCustomPath('/Users/anwarmohammedkoji/test/SIBLIX_Test')}
                className="text-[11px] text-brand-600 hover:underline"
              >
                Use SIBLIX_Test Path
              </button>
            </div>
          </div>
        )}

        {/* Mode 3: Bundled Standard Dataset */}
        {activeMode === 'bundled' && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              Bundled Standard 520 Dataset
            </div>
            <p className="text-xs text-slate-500">
              Synchronize or reset the database back to the bundled 520 shipping emails from <code className="text-brand-600 font-mono">storage/inbox</code>.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setUploadModalOpen(false)}
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            loading={loading}
            onClick={handleIngest}
          >
            {activeMode === 'folder'
              ? 'Sync Folder & Run Pipeline'
              : activeMode === 'files'
              ? (files.length > 0 ? `Upload ${files.length} File(s) & Ingest` : 'Upload & Ingest')
              : 'Sync Bundled 520 Dataset'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default UploadModal;
