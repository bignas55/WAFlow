import React, { useState, useRef } from 'react';
import {
  Shield, Settings, MessageSquare, BookOpen, Clock,
  Plus, Pencil, Trash2, X, ChevronDown, Check, Bot, Users,
  FileText, Link, Upload, Globe, File, AlertCircle, CheckCircle,
  Loader2, Menu, Sparkles, Hash, ToggleLeft, ToggleRight, Save,
  ChevronRight, ChevronLeft,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { Spinner } from '../components/ui/Spinner';

// ────────────────────────────────────────────────────────────────────────────
// Admin Guard Component
// ────────────────────────────────────────────────────────────────────────────

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <Shield className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h2>
        <p className="text-gray-600">Only administrators can manage tenant configurations.</p>
      </div>
    );
  }
  return <>{children}</>;
}

// ────────────────────────────────────────────────────────────────────────────
// Languages
// ────────────────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'ko', name: 'Korean' },
  { code: 'id', name: 'Indonesian' },
];

const TIMEZONES = [
  'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Cairo',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
];

// ────────────────────────────────────────────────────────────────────────────
// Templates Modal
// ────────────────────────────────────────────────────────────────────────────

interface TemplateModalProps {
  isOpen: boolean;
  isEditing: boolean;
  template?: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}

function TemplateModal({ isOpen, isEditing, template, onClose, onSubmit, isLoading }: TemplateModalProps) {
  const [form, setForm] = useState({
    name: template?.name || '',
    keywords: template?.keywords?.join(', ') || '',
    response: template?.response || '',
    category: template?.category || 'general',
    priority: template?.priority || 0,
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = form.keywords.split(',').map((k: string) => k.trim()).filter(Boolean);
    onSubmit({
      ...(isEditing && { id: template.id }),
      name: form.name,
      keywords,
      response: form.response,
      category: form.category,
      priority: form.priority,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            {isEditing ? 'Edit Template' : 'New Template'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Greeting"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (comma-separated)</label>
            <input
              type="text"
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., hello, hi, greetings"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Response</label>
            <textarea
              value={form.response}
              onChange={(e) => setForm({ ...form, response: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
              placeholder="Enter the response message"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="general"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Spinner size="sm" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AI & Prompt Tab
// ────────────────────────────────────────────────────────────────────────────

function AIPromptTab({ tenantId, config }: { tenantId: number; config: any }) {
  const [form, setForm] = useState(config || {
    businessName: '',
    systemPrompt: '',
    aiModel: 'gemma4:latest',
    aiApiUrl: 'http://localhost:11434/v1',
    language: 'en',
    enableMultiLanguage: false,
  });

  const updateConfigMutation = trpc.admin.updateTenantConfig.useMutation();

  const handleSave = async () => {
    await updateConfigMutation.mutateAsync({
      tenantId,
      businessName: form.businessName,
      systemPrompt: form.systemPrompt,
      aiModel: form.aiModel,
      aiApiUrl: form.aiApiUrl,
      language: form.language,
      enableMultiLanguage: form.enableMultiLanguage,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
        <input
          type="text"
          value={form.businessName}
          onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Sarah's Beauty Salon"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">System Prompt</label>
        <textarea
          value={form.systemPrompt}
          onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-32"
          placeholder="You are a helpful assistant for {businessName}. You help customers with booking appointments and answering FAQs..."
        />
        <p className="text-xs text-gray-500 mt-1">Use &#123;businessName&#125; to reference the business name</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">AI Model</label>
          <input
            type="text"
            value={form.aiModel}
            onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="gemma4:latest"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">API URL</label>
          <input
            type="text"
            value={form.aiApiUrl}
            onChange={(e) => setForm({ ...form, aiApiUrl: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="http://localhost:11434/v1"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enableMultiLanguage}
              onChange={(e) => setForm({ ...form, enableMultiLanguage: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Auto-detect Language</span>
          </label>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={updateConfigMutation.isPending}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
      >
        {updateConfigMutation.isPending && <Spinner size="sm" />}
        <Check className="w-4 h-4" />
        Save Configuration
      </button>

      {updateConfigMutation.isSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Configuration saved successfully!
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Templates Tab
// ────────────────────────────────────────────────────────────────────────────

function TemplatesTab({ tenantId }: { tenantId: number }) {
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  const { data: templatesData, isLoading, refetch } = trpc.admin.getTenantTemplates.useQuery({ tenantId });
  const createMutation = trpc.admin.createTenantTemplate.useMutation({
    onSuccess: () => { refetch(); setShowModal(false); setEditingTemplate(null); }
  });
  const updateMutation = trpc.admin.updateTenantTemplate.useMutation({
    onSuccess: () => { refetch(); setShowModal(false); setEditingTemplate(null); }
  });
  const deleteMutation = trpc.admin.deleteTenantTemplate.useMutation({ onSuccess: () => refetch() });

  if (isLoading) return <Spinner />;

  const handleSubmit = async (data: any) => {
    if (editingTemplate) {
      await updateMutation.mutateAsync({ id: editingTemplate.id, ...data });
    } else {
      await createMutation.mutateAsync({ tenantId, ...data });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{templatesData?.total || 0} templates</p>
        <button
          onClick={() => { setEditingTemplate(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      <div className="space-y-2">
        {templatesData?.templates?.map((template: any) => (
          <div key={template.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300">
            <div className="flex-1">
              <div className="font-medium text-gray-900">{template.name}</div>
              <div className="flex items-center gap-2 mt-2">
                {template.keywords?.map((kw: string, idx: number) => (
                  <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    {kw}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-2 truncate">{template.response}</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => { setEditingTemplate(template); setShowModal(true); }}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => deleteMutation.mutate({ id: template.id })}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <TemplateModal
        isOpen={showModal}
        isEditing={!!editingTemplate}
        template={editingTemplate}
        onClose={() => { setShowModal(false); setEditingTemplate(null); }}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Knowledge Base Tab  (text / file / URL)
// ────────────────────────────────────────────────────────────────────────────

type KBAddMode = 'text' | 'file' | 'url';

function KBAddModal({
  tenantId,
  onClose,
  onSuccess,
}: {
  tenantId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<KBAddMode>('text');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Text mode state ────────────────────────────────────
  const [textForm, setTextForm] = useState({ title: '', content: '', category: 'general' });

  // ── URL mode state ─────────────────────────────────────
  const [urlForm, setUrlForm] = useState({ url: '', category: 'general' });

  // ── File mode state ────────────────────────────────────
  const [fileCategory, setFileCategory] = useState('general');
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createTextMutation = trpc.admin.createTenantKBEntry.useMutation({
    onSuccess: () => { setStatus({ ok: true, text: 'Entry added!' }); setTimeout(onSuccess, 1000); },
    onError: e => setStatus({ ok: false, text: e.message }),
  });

  const addUrlMutation = trpc.admin.addKBFromUrl.useMutation({
    onSuccess: (data) => {
      setStatus({ ok: true, text: `Imported "${data.title}" (${data.wordCount?.toLocaleString()} words)` });
      setTimeout(onSuccess, 1500);
    },
    onError: e => setStatus({ ok: false, text: e.message }),
  });

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    createTextMutation.mutate({ tenantId, ...textForm });
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    addUrlMutation.mutate({ tenantId, ...urlForm });
  };

  const uploadFile = async (file: File) => {
    const allowed = ['.pdf', '.docx', '.txt', '.md', '.csv'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setStatus({ ok: false, text: `Unsupported file type. Allowed: ${allowed.join(', ')}` });
      return;
    }
    setUploadingFile(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tenantId', String(tenantId));
      fd.append('category', fileCategory);
      const resp = await fetch('/api/admin/knowledge-base/upload', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');
      setStatus({ ok: true, text: `"${file.name}" uploaded and processing in the background.` });
      setTimeout(onSuccess, 1500);
    } catch (err: any) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const modes: { id: KBAddMode; label: string; icon: React.ReactNode }[] = [
    { id: 'text',  label: 'Write Text',      icon: <FileText className="w-4 h-4" /> },
    { id: 'file',  label: 'Upload Document', icon: <Upload className="w-4 h-4" /> },
    { id: 'url',   label: 'Import from URL', icon: <Globe className="w-4 h-4" /> },
  ];

  const isWorking = createTextMutation.isPending || addUrlMutation.isPending || uploadingFile;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">Add Knowledge</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-200">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setStatus(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition ${
                mode === m.id
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {m.icon}{m.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Status banner */}
          {status && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              status.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {status.ok ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {status.text}
            </div>
          )}

          {/* ── TEXT mode ── */}
          {mode === 'text' && (
            <form onSubmit={handleTextSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text" required value={textForm.title}
                  onChange={e => setTextForm({ ...textForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Business Hours FAQ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  required value={textForm.content}
                  onChange={e => setTextForm({ ...textForm, content: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-32"
                  placeholder="Enter the information the AI should know about this topic…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input type="text" value={textForm.category}
                  onChange={e => setTextForm({ ...textForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="general"
                />
              </div>
              <button type="submit" disabled={isWorking}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-2">
                {isWorking && <Loader2 className="w-4 h-4 animate-spin" />} Add Entry
              </button>
            </form>
          )}

          {/* ── FILE mode ── */}
          {mode === 'file' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Upload a PDF, Word doc, or text file. The AI will read its content automatically.</p>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                  dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
              >
                {uploadingFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-600">Uploading…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <File className="w-10 h-10 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">Drop a file here or <span className="text-blue-600">click to browse</span></p>
                    <p className="text-xs text-gray-400">PDF, DOCX, TXT, MD, CSV · max 20 MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input type="text" value={fileCategory}
                  onChange={e => setFileCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="general"
                />
              </div>
            </div>
          )}

          {/* ── URL mode ── */}
          {mode === 'url' && (
            <form onSubmit={handleUrlSubmit} className="space-y-3">
              <p className="text-sm text-gray-500">Paste the business website URL. We'll fetch the page and extract the text for the AI to learn from.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="url" required value={urlForm.url}
                    onChange={e => setUrlForm({ ...urlForm, url: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://www.yourbusiness.com/about"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Works best with About, Services, FAQ, or Pricing pages.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input type="text" value={urlForm.category}
                  onChange={e => setUrlForm({ ...urlForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="general"
                />
              </div>
              <button type="submit" disabled={isWorking}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg flex items-center justify-center gap-2">
                {isWorking ? <><Loader2 className="w-4 h-4 animate-spin" /> Fetching page…</> : <><Globe className="w-4 h-4" /> Import Page</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function KnowledgeBaseTab({ tenantId }: { tenantId: number }) {
  const [showModal, setShowModal] = useState(false);

  const { data: kbData, isLoading, refetch } = trpc.admin.getTenantKnowledgeBase.useQuery({ tenantId });
  const deleteMutation = trpc.admin.deleteTenantKBEntry.useMutation({ onSuccess: () => refetch() });

  if (isLoading) return <Spinner />;

  const typeIcon = (type: string) => {
    if (type === 'link') return <Globe className="w-4 h-4 text-blue-500" />;
    if (type === 'pdf')  return <File className="w-4 h-4 text-red-500" />;
    if (type === 'docx') return <FileText className="w-4 h-4 text-blue-600" />;
    return <FileText className="w-4 h-4 text-gray-500" />;
  };

  const statusBadge = (status: string) => {
    if (status === 'ready')      return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ready</span>;
    if (status === 'processing') return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Processing</span>;
    if (status === 'error')      return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Error</span>;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{kbData?.total || 0} knowledge entries</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Knowledge
        </button>
      </div>

      {/* Entry list */}
      <div className="space-y-2">
        {kbData?.articles?.map((article: any) => (
          <div key={article.id} className="flex items-start justify-between bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="mt-0.5 flex-shrink-0">{typeIcon(article.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 truncate">{article.title}</span>
                  {statusBadge(article.status)}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{article.category}</span>
                  {article.sourceUrl && (
                    <a href={article.sourceUrl} target="_blank" rel="noreferrer"
                       className="text-xs text-blue-500 hover:underline truncate max-w-xs flex items-center gap-1">
                      <Link className="w-3 h-3 flex-shrink-0" />{article.sourceUrl}
                    </a>
                  )}
                  {article.fileName && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <File className="w-3 h-3" />{article.fileName}
                    </span>
                  )}
                </div>
                {article.status === 'ready' && (
                  <p className="text-xs text-gray-500 mt-1.5 truncate">{article.content?.substring(0, 100)}…</p>
                )}
              </div>
            </div>
            <button
              onClick={() => deleteMutation.mutate({ id: article.id })}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg ml-3 flex-shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {kbData?.total === 0 && (
          <div className="text-center py-10 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No knowledge entries yet</p>
            <p className="text-xs mt-1">Add text, upload a document, or import from a website URL</p>
          </div>
        )}
      </div>

      {showModal && (
        <KBAddModal
          tenantId={tenantId}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); refetch(); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Business Hours Tab
// ────────────────────────────────────────────────────────────────────────────

function BusinessHoursTab({ tenantId, config }: { tenantId: number; config: any }) {
  const [form, setForm] = useState({
    enableBusinessHours: config?.enableBusinessHours || false,
    businessHoursStart: config?.businessHoursStart || '09:00',
    businessHoursEnd: config?.businessHoursEnd || '17:00',
    businessDays: config?.businessDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    timezone: config?.timezone || 'Africa/Johannesburg',
    afterHoursMessage: config?.afterHoursMessage || 'Thank you for contacting us! We\'ll respond during business hours.',
  });

  const updateConfigMutation = trpc.admin.updateTenantConfig.useMutation();

  const toggleDay = (day: string) => {
    setForm({
      ...form,
      businessDays: form.businessDays.includes(day)
        ? form.businessDays.filter((d: string) => d !== day)
        : [...form.businessDays, day]
    });
  };

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  const handleSave = async () => {
    await updateConfigMutation.mutateAsync({
      tenantId,
      enableBusinessHours: form.enableBusinessHours,
      businessHoursStart: form.businessHoursStart,
      businessHoursEnd: form.businessHoursEnd,
      businessDays: form.businessDays,
      timezone: form.timezone,
      afterHoursMessage: form.afterHoursMessage,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.enableBusinessHours}
            onChange={(e) => setForm({ ...form, enableBusinessHours: e.target.checked })}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Enable Business Hours Restriction</span>
        </label>
      </div>

      {form.enableBusinessHours && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Operating Days</label>
            <div className="grid grid-cols-4 gap-2">
              {daysOfWeek.map(day => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-2 rounded-lg font-medium text-sm capitalize transition ${
                    form.businessDays.includes(day)
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}
                >
                  {day.substring(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
              <input
                type="time"
                value={form.businessHoursStart}
                onChange={(e) => setForm({ ...form, businessHoursStart: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
              <input
                type="time"
                value={form.businessHoursEnd}
                onChange={(e) => setForm({ ...form, businessHoursEnd: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">After-Hours Message</label>
            <textarea
              value={form.afterHoursMessage}
              onChange={(e) => setForm({ ...form, afterHoursMessage: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
              placeholder="Thank you for contacting us! We'll respond during business hours."
            />
          </div>
        </>
      )}

      <button
        onClick={handleSave}
        disabled={updateConfigMutation.isPending}
        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
      >
        {updateConfigMutation.isPending && <Spinner size="sm" />}
        <Check className="w-4 h-4" />
        Save Business Hours
      </button>

      {updateConfigMutation.isSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Business hours saved successfully!
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Menu Options Tab  (Admin-only)
// ────────────────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  reply:     { label: 'Reply',       color: 'bg-blue-100 text-blue-700'   },
  escalate:  { label: 'Hand to Human', color: 'bg-orange-100 text-orange-700' },
  booking:   { label: 'Booking Flow', color: 'bg-green-100 text-green-700' },
  kb_search: { label: 'Search KB',   color: 'bg-purple-100 text-purple-700' },
};

const SAMPLE_SETS = [
  'General Business',
  'Beauty & Salon',
  'Medical / Healthcare',
  'Restaurant & Food',
  'Real Estate',
] as const;

interface MenuItem {
  id?: number;
  itemNumber: number;
  title: string;
  description: string;
  response: string;
  actionType: 'reply' | 'escalate' | 'booking' | 'kb_search';
  isActive: boolean;
  sortOrder: number;
}

const BLANK_ITEM: MenuItem = {
  itemNumber: 1, title: '', description: '', response: '',
  actionType: 'reply', isActive: true, sortOrder: 0,
};

function MenuItemEditor({
  item, onSave, onCancel,
}: { item: MenuItem; onSave: (i: MenuItem) => void; onCancel: () => void }) {
  const [form, setForm] = useState<MenuItem>(item);
  const f = <K extends keyof MenuItem>(k: K, v: MenuItem[K]) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Option Number</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={form.itemNumber} onChange={e => f('itemNumber', parseInt(e.target.value))}>
            {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Action Type</label>
          <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={form.actionType} onChange={e => f('actionType', e.target.value as MenuItem['actionType'])}>
            <option value="reply">Reply (send text)</option>
            <option value="escalate">Escalate to human</option>
            <option value="booking">Booking flow</option>
            <option value="kb_search">Search knowledge base</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Title (shown in menu) *</label>
        <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="📅 Book an Appointment" value={form.title} onChange={e => f('title', e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional sub-text)</label>
        <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          placeholder="Schedule a visit with us" value={form.description} onChange={e => f('description', e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Response message *</label>
        <textarea rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Message sent to the customer when they select this option"
          value={form.response} onChange={e => f('response', e.target.value)} />
      </div>
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button type="button" onClick={() => f('isActive', !form.isActive)}
            className={`w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-xs text-gray-600">Active</span>
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={() => onSave(form)}
            disabled={!form.title.trim() || !form.response.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1">
            <Save className="w-3 h-3" /> Save Option
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuOptionsTab({ tenantId }: { tenantId: number }) {
  const utils = trpc.useUtils();

  // Server data
  const { data: menuItems = [], isLoading: itemsLoading } = trpc.menuOptions.list.useQuery({ tenantId });
  const { data: menuCfg, isLoading: cfgLoading }          = trpc.menuOptions.getConfig.useQuery({ tenantId });

  // Mutations
  const updateCfg    = trpc.menuOptions.updateConfig.useMutation({ onSuccess: () => utils.menuOptions.getConfig.invalidate() });
  const upsertItem   = trpc.menuOptions.upsert.useMutation({ onSuccess: () => { utils.menuOptions.list.invalidate(); setEditing(null); setAdding(false); } });
  const deleteItem   = trpc.menuOptions.delete.useMutation({ onSuccess: () => utils.menuOptions.list.invalidate() });
  const applySample  = trpc.menuOptions.applySample.useMutation({ onSuccess: () => { utils.menuOptions.list.invalidate(); utils.menuOptions.getConfig.invalidate(); setShowSamples(false); } });

  // Local UI state
  const [editing, setEditing]       = useState<MenuItem | null>(null);
  const [adding, setAdding]         = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [enabled, setEnabled]       = useState<boolean>(false);
  const [trigger, setTrigger]       = useState('menu');
  const [greeting, setGreeting]     = useState('');
  const [footer, setFooter]         = useState('');
  const [cfgDirty, setCfgDirty]     = useState(false);

  // Sync server state into local form
  React.useEffect(() => {
    if (menuCfg) {
      setEnabled(!!menuCfg.enableMenuMode);
      setTrigger(menuCfg.menuTrigger ?? 'menu');
      setGreeting(menuCfg.menuGreeting ?? '');
      setFooter(menuCfg.menuFooter ?? '');
    }
  }, [menuCfg]);

  const markDirty = () => setCfgDirty(true);

  const saveConfig = () => {
    updateCfg.mutate({ tenantId, enableMenuMode: enabled, menuTrigger: trigger, menuGreeting: greeting, menuFooter: footer },
      { onSuccess: () => setCfgDirty(false) });
  };

  if (itemsLoading || cfgLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  const nextNumber = () => {
    const used = new Set(menuItems.map((i: any) => i.itemNumber));
    for (let n = 1; n <= 9; n++) if (!used.has(n)) return n;
    return 1;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Hash className="w-4 h-4 text-blue-600" /> Numbered Menu Automation
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Customers receive a numbered menu and tap a digit to get an instant reply, book, or be handed to a human.
          </p>
        </div>
        <button onClick={() => setShowSamples(s => !s)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition">
          <Sparkles className="w-4 h-4" />
          {showSamples ? 'Hide Samples' : 'Load a Sample'}
        </button>
      </div>

      {/* ── Sample picker ── */}
      {showSamples && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-purple-700 mb-3">
            ✨ Choose a sample to pre-fill 5 menu options. This will <strong>replace</strong> existing items.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SAMPLE_SETS.map(name => (
              <button key={name}
                disabled={applySample.isPending}
                onClick={() => applySample.mutate({ tenantId, sampleName: name })}
                className="flex items-center gap-2 px-4 py-3 bg-white border border-purple-200 rounded-lg text-sm font-medium text-gray-800 hover:bg-purple-50 hover:border-purple-400 transition text-left">
                <ChevronRight className="w-4 h-4 text-purple-500 flex-shrink-0" />
                {name}
              </button>
            ))}
          </div>
          {applySample.isPending && <p className="text-xs text-purple-600 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Applying sample…</p>}
        </div>
      )}

      {/* ── Enable / Trigger config ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Enable Menu Mode</p>
            <p className="text-xs text-gray-500">When ON, the bot shows the numbered menu when a customer sends the trigger word.</p>
          </div>
          <button onClick={() => { setEnabled(e => !e); markDirty(); }}
            className={`w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Trigger word</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="menu" value={trigger}
              onChange={e => { setTrigger(e.target.value); markDirty(); }} />
            <p className="text-xs text-gray-400 mt-0.5">Customer sends this word to see the menu. Also activates on hi / hello / start.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Footer text (optional)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Reply 0 to speak to a person"
              value={footer} onChange={e => { setFooter(e.target.value); markDirty(); }} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Menu greeting message</label>
          <textarea rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder={`👋 Welcome to My Business!\n\nHow can we help you today? Please reply with a number:`}
            value={greeting} onChange={e => { setGreeting(e.target.value); markDirty(); }} />
        </div>

        {cfgDirty && (
          <button onClick={saveConfig} disabled={updateCfg.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {updateCfg.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        )}
      </div>

      {/* ── Menu items list ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800">Menu Options ({menuItems.length}/9)</h4>
          {menuItems.length < 9 && !adding && (
            <button onClick={() => { setAdding(true); setEditing(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
              <Plus className="w-3.5 h-3.5" /> Add Option
            </button>
          )}
        </div>

        {/* New item editor */}
        {adding && (
          <div className="mb-3">
            <MenuItemEditor
              item={{ ...BLANK_ITEM, itemNumber: nextNumber() }}
              onSave={item => upsertItem.mutate({ tenantId, ...item, isActive: item.isActive })}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {menuItems.length === 0 && !adding ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-gray-300 rounded-xl bg-gray-50 text-center">
            <Hash className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium text-sm">No menu options yet</p>
            <p className="text-gray-400 text-xs mt-1">Click <strong>Load a Sample</strong> above to get started quickly, or add options manually.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(menuItems as any[]).map((item: any) => (
              editing?.id === item.id ? (
                <MenuItemEditor key={item.id}
                  item={{ ...item, isActive: !!item.isActive }}
                  onSave={updated => upsertItem.mutate({ tenantId, ...updated, id: item.id })}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition ${item.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                  {/* Number badge */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                    {item.itemNumber}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ACTION_LABELS[item.actionType]?.color}`}>
                        {ACTION_LABELS[item.actionType]?.label}
                      </span>
                      {!item.isActive && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Inactive</span>}
                    </div>
                    {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
                    <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">"{item.response}"</p>
                  </div>
                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button onClick={() => { setEditing({ ...item, isActive: !!item.isActive }); setAdding(false); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (window.confirm(`Delete option ${item.itemNumber}?`)) deleteItem.mutate({ tenantId, id: item.id }); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* ── Preview ── */}
      {menuItems.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
          <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> WhatsApp Preview
          </p>
          <div className="bg-[#128C7E] rounded-lg p-3 max-w-xs text-sm text-white whitespace-pre-wrap leading-relaxed">
            {greeting || `👋 Welcome to your business!\n\nHow can we help you today? Please reply with a number:`}
            {'\n\n'}
            {(menuItems as any[]).map((i: any) => `*${i.itemNumber}*. ${i.title}${i.description ? ` — ${i.description}` : ''}`).join('\n')}
            {footer ? `\n\n${footer}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────

function TenantSetupInner() {
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'templates' | 'kb' | 'hours' | 'menu'>('ai');

  const { data: tenants, isLoading: tenantsLoading } = trpc.admin.listTenants.useQuery();
  const { data: config, isLoading: configLoading } = trpc.admin.getTenantConfig.useQuery(
    { tenantId: selectedTenantId! },
    { enabled: !!selectedTenantId }
  );

  if (tenantsLoading) return <Spinner />;

  const tabs = [
    { id: 'ai',       label: 'AI & Prompt',     icon: Bot         },
    { id: 'templates', label: 'Templates',       icon: MessageSquare },
    { id: 'kb',       label: 'Knowledge Base',   icon: BookOpen    },
    { id: 'hours',    label: 'Business Hours',   icon: Clock       },
    { id: 'menu',     label: 'Menu Automation',  icon: Hash        },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tenant Configuration</h1>
        <p className="text-gray-600 text-sm mt-0.5">Manage bot configuration for any tenant</p>
      </div>

      {/* Tenant Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Select Tenant
        </label>
        <select
          value={selectedTenantId || ''}
          onChange={(e) => {
            const tenantId = parseInt(e.target.value);
            setSelectedTenantId(tenantId || null);
            setActiveTab('ai');
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose a tenant...</option>
          {tenants?.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
          ))}
        </select>
      </div>

      {!selectedTenantId ? (
        <div className="flex flex-col items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <Settings className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-gray-600 font-medium">Select a tenant to get started</p>
          <p className="text-gray-500 text-sm">Choose a tenant from the dropdown above to configure their bot</p>
        </div>
      ) : configLoading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium text-sm transition ${
                    isActive
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6" key={selectedTenantId}>
            {activeTab === 'ai' && <AIPromptTab tenantId={selectedTenantId} config={config} />}
            {activeTab === 'templates' && <TemplatesTab tenantId={selectedTenantId} />}
            {activeTab === 'kb' && <KnowledgeBaseTab tenantId={selectedTenantId} />}
            {activeTab === 'hours' && <BusinessHoursTab tenantId={selectedTenantId} config={config} />}
            {activeTab === 'menu' && <MenuOptionsTab tenantId={selectedTenantId} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TenantSetup() {
  return (
    <AdminGuard>
      <TenantSetupInner />
    </AdminGuard>
  );
}
