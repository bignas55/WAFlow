import React, { useState, useRef, useCallback } from 'react';
import {
  Plus, Search, Trash2, Edit2, BookOpen, Tag, ChevronDown, ChevronUp,
  Globe, FileText, Upload, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Link2, File, X, ExternalLink, Users, Bot, Send, Sparkles,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';

// ── Types ────────────────────────────────────────────────────────────────────

interface KBFormData {
  title: string;
  content: string;
  category: string;
  tags: string;
  isActive: boolean;
}

const emptyForm: KBFormData = { title: '', content: '', category: 'general', tags: '', isActive: true };
const CATEGORIES = ['all', 'general', 'services', 'pricing', 'faq', 'policies', 'products', 'support'];
type ActiveTab = 'articles' | 'add-url' | 'upload' | 'test-ai';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string }) {
  if (!status || status === 'ready') return (
    <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full border border-green-800">
      <CheckCircle2 className="w-3 h-3" /> Ready
    </span>
  );
  if (status === 'processing') return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full border border-blue-800">
      <Clock className="w-3 h-3" /> Processing…
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded-full border border-red-800">
      <AlertCircle className="w-3 h-3" /> Error
    </span>
  );
  return null;
}

function TypeIcon({ type }: { type: string }) {
  if (type === 'link') return <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />;
  if (type === 'pdf')  return <File  className="w-4 h-4 text-red-400  flex-shrink-0" />;
  if (type === 'docx') return <File  className="w-4 h-4 text-blue-400 flex-shrink-0" />;
  if (type === 'txt' || type === 'md') return <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  return <BookOpen className="w-4 h-4 text-green-400 flex-shrink-0" />;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function KnowledgeBaseInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Admin: selected tenant to manage (null = own KB)
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const managingOwnKB = !isAdmin || selectedTenantId === null;

  const [search, setSearch]         = useState('');
  const [category, setCategory]     = useState('all');
  const [activeTab, setActiveTab]   = useState<ActiveTab>('articles');
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<number | null>(null);
  const [form, setForm]             = useState<KBFormData>(emptyForm);
  const [expanded, setExpanded]     = useState<number | null>(null);

  // URL state
  const [urlInput, setUrlInput]     = useState('');
  const [urlCategory, setUrlCategory] = useState('general');
  const [urlTags, setUrlTags]       = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlMsg, setUrlMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Bulk URL mode
  const [bulkMode, setBulkMode]     = useState(false);
  const [bulkUrls, setBulkUrls]     = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  // Test AI state
  const [testQuery, setTestQuery]   = useState('');
  const [testAnswer, setTestAnswer] = useState('');
  const [testSources, setTestSources] = useState<string[]>([]);
  const testQueryMutation = trpc.knowledgeBase.testQuery.useMutation({
    onSuccess: (data: any) => {
      setTestAnswer(data.answer ?? '');
      setTestSources(data.sources ?? []);
    },
  });

  // Upload state
  const [fileCategory, setFileCategory] = useState('general');
  const [fileTags, setFileTags]     = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load tenant list for admin switcher
  const { data: tenantOverview } = trpc.admin.getTenantOverview.useQuery(undefined, { enabled: isAdmin });
  const tenants = tenantOverview ?? [];
  const selectedTenant = tenants.find((t: any) => t.id === selectedTenantId);

  // ── Data queries — switch between own KB and managed tenant KB ────────────
  const ownKBQuery = trpc.knowledgeBase.list.useQuery(
    { search: search || undefined, category: category === 'all' ? undefined : category },
    { enabled: managingOwnKB, refetchInterval: 5000 }
  );
  const tenantKBQuery = trpc.admin.getTenantKnowledgeBase.useQuery(
    { tenantId: selectedTenantId! },
    { enabled: !managingOwnKB && selectedTenantId !== null, refetchInterval: 5000 }
  );

  const rawData = managingOwnKB ? ownKBQuery.data : tenantKBQuery.data;
  const isLoading = managingOwnKB ? ownKBQuery.isLoading : tenantKBQuery.isLoading;
  const refetch = managingOwnKB ? ownKBQuery.refetch : tenantKBQuery.refetch;

  // Filter tenant KB articles by search/category client-side (admin endpoint returns all)
  const data = managingOwnKB ? rawData : {
    articles: (rawData?.articles ?? []).filter((a: any) => {
      const matchSearch = !search || a.title?.toLowerCase().includes(search.toLowerCase()) || a.content?.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === 'all' || a.category === category;
      return matchSearch && matchCat;
    }),
    total: rawData?.total ?? 0,
  };

  // ── Mutations — switch between own KB and admin KB mutations ──────────────
  const createMutation      = trpc.knowledgeBase.create.useMutation({ onSuccess: () => { refetch(); resetForm(); } });
  const updateMutation      = trpc.knowledgeBase.update.useMutation({ onSuccess: () => { refetch(); resetForm(); } });
  const deleteMutation      = trpc.knowledgeBase.delete.useMutation({ onSuccess: () => refetch() });
  const resyncMutation      = trpc.knowledgeBase.resync.useMutation({ onSuccess: () => refetch() });
  const addUrlMutation      = trpc.knowledgeBase.addUrl.useMutation({
    onSuccess: (d) => { setUrlMsg({ type: 'success', text: d.message }); setUrlInput(''); setUrlLoading(false); refetch(); setActiveTab('articles'); },
    onError: (e) => { setUrlMsg({ type: 'error', text: e.message }); setUrlLoading(false); },
  });

  // Admin mutations for other tenants
  const adminCreateMutation = trpc.admin.createTenantKBEntry.useMutation({ onSuccess: () => { refetch(); resetForm(); } });
  const adminUpdateMutation = trpc.admin.updateTenantKBEntry.useMutation({ onSuccess: () => { refetch(); resetForm(); } });
  const adminDeleteMutation = trpc.admin.deleteTenantKBEntry.useMutation({ onSuccess: () => refetch() });
  const adminAddUrlMutation = trpc.admin.addTenantKBUrl.useMutation({
    onSuccess: (d) => { setUrlMsg({ type: 'success', text: d.message }); setUrlInput(''); setUrlLoading(false); refetch(); setActiveTab('articles'); },
    onError: (e) => { setUrlMsg({ type: 'error', text: e.message }); setUrlLoading(false); },
  });

  const resetForm = () => { setForm(emptyForm); setShowForm(false); setEditing(null); };

  const openEdit = (item: any) => {
    setForm({ title: item.title, content: item.content, category: item.category || 'general', tags: (item.tags || []).join(', '), isActive: item.isActive ?? true });
    setEditing(item.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
    if (!managingOwnKB && selectedTenantId) {
      editing
        ? adminUpdateMutation.mutate({ id: editing, title: payload.title, content: payload.content, category: payload.category, isActive: payload.isActive })
        : adminCreateMutation.mutate({ tenantId: selectedTenantId, title: payload.title, content: payload.content, category: payload.category });
    } else {
      editing ? updateMutation.mutate({ id: editing, ...payload }) : createMutation.mutate(payload);
    }
  };

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlMsg(null);
    setUrlLoading(true);
    let url = urlInput.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    if (!managingOwnKB && selectedTenantId) {
      adminAddUrlMutation.mutate({ tenantId: selectedTenantId, url, category: urlCategory });
    } else {
      addUrlMutation.mutate({ url, category: urlCategory, tags: urlTags ? urlTags.split(',').map(t => t.trim()).filter(Boolean) : [] });
    }
  };

  const handleBulkAddUrls = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlMsg(null);
    const rawLines = bulkUrls.split('\n').map(l => l.trim()).filter(Boolean);
    const urls = rawLines.map(u => u.startsWith('http') ? u : 'https://' + u);
    if (!urls.length) return;
    setBulkProgress({ done: 0, total: urls.length });
    setUrlLoading(true);
    let ok = 0; const errors: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        if (!managingOwnKB && selectedTenantId) {
          await new Promise<void>((res, rej) => adminAddUrlMutation.mutate({ tenantId: selectedTenantId, url: urls[i], category: urlCategory }, { onSuccess: () => res(), onError: (e) => rej(e) }));
        } else {
          await new Promise<void>((res, rej) => addUrlMutation.mutate({ url: urls[i], category: urlCategory, tags: [] }, { onSuccess: () => res(), onError: (e) => rej(e) }));
        }
        ok++;
      } catch (e: any) {
        errors.push(`${urls[i]}: ${e?.message ?? 'failed'}`);
      }
      setBulkProgress({ done: i + 1, total: urls.length });
      if (i < urls.length - 1) await new Promise(r => setTimeout(r, 800)); // rate limit
    }
    setUrlLoading(false);
    setBulkProgress(null);
    setBulkUrls('');
    refetch();
    setActiveTab('articles');
    setUrlMsg({ type: errors.length ? 'error' : 'success', text: `${ok} URL${ok !== 1 ? 's' : ''} added${errors.length ? '. Errors: ' + errors.slice(0, 3).join('; ') : ' — processing in background…'}` });
  };

  const handleDelete = (id: number) => {
    if (!managingOwnKB) {
      adminDeleteMutation.mutate({ id });
    } else {
      deleteMutation.mutate({ id });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    setPendingFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploadMsg(null); setUploadLoading(true);
    let ok = 0; const errors: string[] = [];
    for (const f of pendingFiles) {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('category', fileCategory);
      fd.append('tags', JSON.stringify(fileTags ? fileTags.split(',').map(t => t.trim()).filter(Boolean) : []));
      try {
        const res  = await fetch('/api/knowledge-base/upload', { method: 'POST', body: fd, credentials: 'include' });
        const json = await res.json();
        if (res.ok && json.success) ok++; else errors.push(`${f.name}: ${json.error || 'failed'}`);
      } catch (e: any) { errors.push(`${f.name}: ${e.message}`); }
    }
    setUploadLoading(false);
    if (ok > 0) {
      setPendingFiles([]); refetch(); setActiveTab('articles');
      setUploadMsg({ type: errors.length ? 'error' : 'success', text: `${ok} file(s) uploaded${errors.length ? '. Errors: ' + errors.join('; ') : ' — processing in background…'}` });
    } else {
      setUploadMsg({ type: 'error', text: errors.join('\n') || 'Upload failed' });
    }
  };

  const stats = {
    total: data?.total || 0,
    active: data?.articles.filter((a: any) => a.isActive).length || 0,
    urls: data?.articles.filter((a: any) => a.type === 'link').length || 0,
    docs: data?.articles.filter((a: any) => ['pdf', 'docx', 'txt', 'md', 'csv'].includes(a.type)).length || 0,
  };

  return (
    <div className="space-y-6">

      {/* Admin tenant selector */}
      {isAdmin && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-gray-300 text-sm font-medium">
            <Users className="w-4 h-4 text-[#25D366]" />
            Training AI for:
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedTenantId(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                managingOwnKB
                  ? 'bg-[#25D366]/10 border-[#25D366] text-[#25D366]'
                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              My Own AI
            </button>
            {tenants.map((t: any) => (
              <button
                key={t.id}
                onClick={() => setSelectedTenantId(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                  selectedTenantId === t.id
                    ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${t.whatsapp?.status === 'connected' ? 'bg-green-400' : 'bg-gray-500'}`} />
                {t.name || t.email}
              </button>
            ))}
          </div>
          {!managingOwnKB && selectedTenant && (
            <span className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded-lg border border-blue-800">
              ✏️ Editing <strong>{selectedTenant.name || selectedTenant.email}</strong>'s knowledge base
            </span>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {managingOwnKB
              ? 'Add articles, websites & documents — the AI learns from everything here'
              : `Training ${selectedTenant?.name || 'this business'}'s AI receptionist`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setActiveTab('test-ai'); setTestAnswer(''); setTestSources([]); }} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'test-ai' ? 'bg-[#25D366] text-white' : 'bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20'}`}>
            <Bot className="w-4 h-4" /> Ask the AI
          </button>
          <button onClick={() => { setActiveTab('add-url'); setUrlMsg(null); }} className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition">
            <Globe className="w-4 h-4" /> Add Website
          </button>
          <button onClick={() => { setActiveTab('upload'); setUploadMsg(null); }} className="flex items-center gap-1.5 bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-500 transition">
            <Upload className="w-4 h-4" /> Upload Doc
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); setActiveTab('articles'); }} className="flex items-center gap-1.5 btn-primary text-sm">
            <Plus className="w-4 h-4" /> Write Article
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Articles', value: stats.total, icon: BookOpen, color: 'text-blue-400' },
          { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'Websites', value: stats.urls, icon: Globe, color: 'text-sky-400' },
          { label: 'Documents', value: stats.docs, icon: FileText, color: 'text-purple-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-3">
            <Icon className={`w-6 h-6 ${color} flex-shrink-0`} />
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── TEST AI ── */}
      {activeTab === 'test-ai' && (
        <div className="card max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#25D366]" />
              <h2 className="text-lg font-semibold text-white">Ask the AI</h2>
            </div>
            <button onClick={() => setActiveTab('articles')} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Test how your AI receptionist answers questions using your knowledge base. Ask it anything a customer might ask.
          </p>
          <div className="flex gap-2">
            <input
              value={testQuery}
              onChange={e => setTestQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && testQuery.trim()) { setTestAnswer(''); setTestSources([]); testQueryMutation.mutate({ question: testQuery }); } }}
              className="input flex-1"
              placeholder="e.g. What are your opening hours?"
            />
            <button
              onClick={() => { setTestAnswer(''); setTestSources([]); testQueryMutation.mutate({ question: testQuery }); }}
              disabled={!testQuery.trim() || testQueryMutation.isPending}
              className="btn-primary flex items-center gap-2 px-4"
            >
              {testQueryMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Ask
            </button>
          </div>

          {testQueryMutation.isError && (
            <div className="mt-4 p-3 rounded-lg bg-red-900/30 text-red-300 border border-red-800 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {testQueryMutation.error.message}
            </div>
          )}

          {testAnswer && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#25D366]" />
                <span className="text-sm font-medium text-[#25D366]">AI Response</span>
              </div>
              <div className="bg-gray-800/60 border border-[#25D366]/20 rounded-xl p-4 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                {testAnswer}
              </div>
              {testSources.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Sources used:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {testSources.map((src, i) => (
                      <span key={i} className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">{src}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!testAnswer && !testQueryMutation.isPending && (
            <div className="mt-6 p-3 bg-gray-800/40 rounded-lg text-xs text-gray-500">
              <p className="font-medium text-gray-400 mb-1.5">💡 Example questions to try</p>
              <div className="flex flex-wrap gap-1.5">
                {["What services do you offer?", "What are your prices?", "How do I book an appointment?", "What are your opening hours?"].map(q => (
                  <button key={q} onClick={() => setTestQuery(q)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full px-2.5 py-1 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ADD WEBSITE ── */}
      {activeTab === 'add-url' && (
        <div className="card max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Add Website / URL</h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Single / Bulk toggle */}
              <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
                <button onClick={() => setBulkMode(false)} className={`px-3 py-1.5 font-medium transition ${!bulkMode ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Single</button>
                <button onClick={() => setBulkMode(true)}  className={`px-3 py-1.5 font-medium transition ${bulkMode  ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Bulk</button>
              </div>
              <button onClick={() => setActiveTab('articles')} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {urlMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${urlMsg.type === 'success' ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}`}>
              {urlMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {urlMsg.text}
            </div>
          )}

          {bulkProgress && (
            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
              <div className="flex items-center justify-between text-xs text-blue-300 mb-1.5">
                <span>Scraping URLs… {bulkProgress.done}/{bulkProgress.total}</span>
                <span>{Math.round((bulkProgress.done / bulkProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {!bulkMode ? (
            /* ── Single URL ── */
            <>
              <p className="text-sm text-gray-400 mb-4">Enter any public webpage — homepage, FAQ, pricing, services, blog posts. The AI will read and learn from the content automatically.</p>
              <form onSubmit={handleAddUrl} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Website URL *</label>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input required type="text" value={urlInput} onChange={e => setUrlInput(e.target.value)} className="input pl-9" placeholder="https://yourwebsite.com/faq" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Examples: /about, /services, /pricing, /faq, /contact, blog posts</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                    <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)} className="input">
                      {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
                    <input value={urlTags} onChange={e => setUrlTags(e.target.value)} className="input" placeholder="website, faq" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={urlLoading || !urlInput.trim()} className="btn-primary flex items-center gap-2">
                    {urlLoading ? <Spinner size="sm" /> : <Globe className="w-4 h-4" />}
                    {urlLoading ? 'Scraping…' : 'Fetch & Learn'}
                  </button>
                  <button type="button" onClick={() => setActiveTab('articles')} className="btn-secondary">Cancel</button>
                </div>
              </form>
            </>
          ) : (
            /* ── Bulk URLs ── */
            <>
              <p className="text-sm text-gray-400 mb-4">Paste multiple URLs, one per line — the AI will scrape and learn from each automatically.</p>
              <form onSubmit={handleBulkAddUrls} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">URLs <span className="text-gray-500">(one per line)</span></label>
                  <textarea
                    required rows={6}
                    value={bulkUrls}
                    onChange={e => setBulkUrls(e.target.value)}
                    className="input resize-none font-mono text-xs"
                    placeholder={`https://yoursite.com/about\nhttps://yoursite.com/services\nhttps://yoursite.com/pricing\nhttps://yoursite.com/faq`}
                  />
                  <p className="text-xs text-gray-500 mt-1">{bulkUrls.split('\n').filter(l => l.trim()).length} URL{bulkUrls.split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''} detected</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Category <span className="text-gray-500">(applies to all)</span></label>
                  <select value={urlCategory} onChange={e => setUrlCategory(e.target.value)} className="input">
                    {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={urlLoading || !bulkUrls.trim()} className="btn-primary flex items-center gap-2">
                    {urlLoading ? <Spinner size="sm" /> : <Globe className="w-4 h-4" />}
                    {urlLoading ? `Scraping (${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0})…` : 'Fetch All & Learn'}
                  </button>
                  <button type="button" onClick={() => setActiveTab('articles')} className="btn-secondary">Cancel</button>
                </div>
              </form>
            </>
          )}

          <div className="mt-5 p-3 bg-gray-800 rounded-lg text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1.5">💡 Tips for best results</p>
            <ul className="space-y-0.5">
              <li>• Add each page separately (e.g. /services, /pricing, /faq)</li>
              <li>• Public pages only — login-required pages won't work</li>
              <li>• Use the <RefreshCw className="w-3 h-3 inline" /> button to re-sync when your website changes</li>
              <li>• Use Bulk mode to import your entire site at once</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── UPLOAD DOCUMENTS ── */}
      {activeTab === 'upload' && (
        <div className="card max-w-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Upload Documents</h2>
            </div>
            <button onClick={() => setActiveTab('articles')} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-gray-400 mb-4">Upload business documents — the AI extracts the text and uses it for accurate, professional answers.<br />Supported: <span className="text-gray-200 font-medium">PDF, DOCX, TXT, MD, CSV</span> (max 20 MB each)</p>

          {uploadMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-start gap-2 ${uploadMsg.type === 'success' ? 'bg-green-900/30 text-green-300 border border-green-800' : 'bg-red-900/30 text-red-300 border border-red-800'}`}>
              {uploadMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {uploadMsg.text}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${isDragging ? 'border-purple-500 bg-purple-900/20' : 'border-gray-700 hover:border-gray-500 bg-gray-800/30'}`}
          >
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" onChange={handleFileSelect} className="hidden" />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-purple-400' : 'text-gray-600'}`} />
            <p className="text-sm font-medium text-gray-300">{isDragging ? 'Drop files here' : 'Drag & drop or click to browse'}</p>
            <p className="text-xs text-gray-500 mt-1">PDF · DOCX · TXT · MD · CSV — up to 20 MB each</p>
          </div>

          {pendingFiles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-800 px-3 py-2 rounded-lg">
                  <File className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span className="flex-1 text-sm text-gray-200 truncate">{f.name}</span>
                  <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400 transition"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
              <select value={fileCategory} onChange={e => setFileCategory(e.target.value)} className="input">
                {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
              <input value={fileTags} onChange={e => setFileTags(e.target.value)} className="input" placeholder="policy, manual" />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button onClick={handleUpload} disabled={uploadLoading || !pendingFiles.length} className="btn-primary flex items-center gap-2">
              {uploadLoading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
              {uploadLoading ? `Uploading ${pendingFiles.length} file(s)…` : `Upload ${pendingFiles.length || ''} File${pendingFiles.length !== 1 ? 's' : ''}`}
            </button>
            <button onClick={() => setActiveTab('articles')} className="btn-secondary">Cancel</button>
          </div>

          <div className="mt-5 p-3 bg-gray-800 rounded-lg text-xs text-gray-400">
            <p className="font-medium text-gray-300 mb-1.5">📄 What to upload</p>
            <ul className="space-y-0.5">
              <li>• Service menus, price lists, brochures (PDF)</li>
              <li>• Policies, terms of service, employee handbooks (DOCX)</li>
              <li>• Product manuals, FAQs, training material (TXT)</li>
              <li>• Product / inventory lists (CSV)</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── ARTICLE FORM MODAL ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">{editing ? 'Edit Article' : 'Write New Article'}</h2>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
                  <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input" placeholder="e.g., Our Opening Hours & Location" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="input">
                    {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tags <span className="text-gray-500">(comma-separated)</span></label>
                  <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="input" placeholder="hours, location, parking" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Content *</label>
                <textarea
                  required rows={10} value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  className="input resize-none"
                  placeholder={`Write everything the AI should know.\n\nExample:\nWe are open Monday–Friday 9am–5pm SAST and Saturday 9am–1pm.\nClosed Sundays and public holidays.\nAddress: 123 Main Street, Johannesburg.\nParking available at rear of building.`}
                />
                <p className="text-xs text-gray-500 mt-1">{form.content.length.toLocaleString()} chars — more detail = better AI answers</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded accent-[#25D366]" />
                <span className="text-sm text-gray-300">Active — AI will use this article when answering</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary flex-1">
                  {editing ? 'Save Changes' : 'Add Article'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary px-5">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ARTICLE LIST ── */}
      {activeTab === 'articles' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles…" className="input pl-9" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${category === c ? 'bg-[#25D366] text-white' : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'}`}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32"><Spinner size="lg" /></div>
          ) : !data?.articles.length ? (
            <div className="card text-center py-16">
              <BookOpen className="w-12 h-12 mx-auto text-gray-700 mb-4" />
              <p className="text-gray-300 font-semibold mb-1">No articles yet</p>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                Add business info, FAQs, service descriptions, or upload your documents. The AI uses everything here to give accurate, professional replies.
              </p>
              <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
                <button onClick={() => setActiveTab('add-url')} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <Globe className="w-4 h-4" /> Add Website
                </button>
                <button onClick={() => setActiveTab('upload')} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <Upload className="w-4 h-4" /> Upload Doc
                </button>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary flex items-center gap-1.5 text-sm">
                  <Plus className="w-4 h-4" /> Write Article
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {data.articles.map((article: any) => (
                <div key={article.id} className="card !p-0 overflow-hidden">
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-800/60 transition"
                    onClick={() => setExpanded(expanded === article.id ? null : article.id)}
                  >
                    <TypeIcon type={article.type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-100 truncate">{article.title}</span>
                        {article.category && <Badge variant="default">{article.category}</Badge>}
                        <StatusBadge status={article.status} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {article.tags?.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500"><Tag className="w-3 h-3" />{article.tags.join(', ')}</span>
                        )}
                        {article.sourceUrl && (
                          <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                            <ExternalLink className="w-3 h-3" />{new URL(article.sourceUrl).hostname}
                          </a>
                        )}
                        {article.fileName && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <File className="w-3 h-3" />{article.fileName}
                            {article.fileSize ? ` (${(article.fileSize / 1024).toFixed(0)} KB)` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {article.status === 'ready' && article.content && (
                        <span className="text-[10px] bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded-full mr-1 whitespace-nowrap">
                          {Math.round(article.content.split(/\s+/).filter(Boolean).length / 100) / 10}K words
                        </span>
                      )}
                      {article.type === 'link' && article.status !== 'processing' && (
                        <button onClick={e => { e.stopPropagation(); resyncMutation.mutate({ id: article.id }); }}
                          title="Re-scrape website" className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); openEdit(article); }}
                        className="p-1.5 text-gray-500 hover:text-[#25D366] hover:bg-green-900/20 rounded-lg transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${article.title}"?`)) handleDelete(article.id); }}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expanded === article.id ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </div>
                  {expanded === article.id && (
                    <div className="px-5 pb-5 border-t border-gray-800">
                      {article.status === 'error' && article.processingError && (
                        <div className="mt-3 p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span><strong>Error:</strong> {article.processingError}</span>
                        </div>
                      )}
                      {article.status === 'processing' && (
                        <div className="mt-3 p-3 bg-blue-900/20 border border-blue-800 rounded-lg text-sm text-blue-300 flex items-center gap-2">
                          <Spinner size="sm" /> Processing content — page auto-refreshes every 5 seconds
                        </div>
                      )}
                      {article.status === 'ready' && (
                        <pre className="text-sm text-gray-400 whitespace-pre-wrap font-sans mt-3 leading-relaxed max-h-64 overflow-y-auto">
                          {article.content}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function KnowledgeBase() {
  return <KnowledgeBaseInner />;
}
