import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Download, Trash2, FolderArchive, User, Calendar, AlertCircle, X, Plus, FileArchive, File as FileIcon } from 'lucide-react';
import { subscribeToRepoFiles, uploadRepoFile, deleteRepoFile } from '../../services/firestoreService';
import { auth } from '../../config/firebase';

export default function RepositoryPanel({ projectId, isOwner }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    const unsub = subscribeToRepoFiles(projectId, (f) => {
      setFiles(f);
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString();
  };

  const handleDelete = async (file) => {
    if (!window.confirm(`Delete "${file.name}"?`)) return;
    try {
      await deleteRepoFile(file.id, file.storage_path);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const myUid = auth.currentUser?.uid;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Repository Files</h2>
          <p className="text-sm text-gray-500 mt-1">Upload project ZIPs and files for the whole team to download</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add File
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">Loading...</div>
      ) : files.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <FolderArchive className="h-14 w-14 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-800 mb-1">No files yet</h3>
          <p className="text-sm text-gray-500 mb-4">Upload a ZIP or any project file so teammates can download it</p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-5 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium"
          >
            Upload First File
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {files.map((file, i) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
            >
              <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                {file.name?.endsWith('.zip') || file.name?.endsWith('.rar') ? (
                  <FileArchive className="h-6 w-6 text-red-600" />
                ) : (
                  <FileIcon className="h-6 w-6 text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{file.name}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500">
                  {file.size ? <span>{formatSize(file.size)}</span> : null}
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{file.uploader_name}</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(file.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={file.download_url}
                  download={file.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-black transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
                {(isOwner || file.uploaded_by === myUid) && (
                  <button
                    onClick={() => handleDelete(file)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUploadModal && (
          <UploadModal
            projectId={projectId}
            onClose={() => setShowUploadModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UploadModal({ projectId, onClose }) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setError('File too large. Maximum 200 MB.');
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError('');
    try {
      await uploadRepoFile({ projectId, file: selectedFile, onProgress: setProgress });
      onClose();
    } catch (err) {
      setError('Upload failed: ' + (err.message || 'Unknown error'));
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Upload File</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!selectedFile ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-red-400 hover:bg-gray-50'
            }`}
          >
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Drag & drop a file here</p>
            <p className="text-xs text-gray-500 mt-1">or click to browse</p>
            <p className="text-xs text-gray-400 mt-3">ZIP, PDF, images, code — max 200 MB</p>
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 p-4 flex items-center gap-3 mb-4">
            <FileArchive className="h-8 w-8 text-red-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{formatSize(selectedFile.size)}</p>
            </div>
            {!uploading && (
              <button onClick={() => setSelectedFile(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {uploading && (
          <div className="mt-3 mb-1">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-red-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} disabled={uploading} className="flex-1 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? `Uploading ${progress}%` : 'Upload'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
