import React, { useState, useRef } from 'react';
import {
  Plus, Edit2, Trash2, Search, MessageSquare, ChevronDown, ChevronUp,
  Shield, Download, Upload, Eye, EyeOff, BarChart2, Copy, Check,
  Zap, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';

// ── AdminGuard ─────────────────────────────────────────────────────────────
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Shield className="w-12 h-12 text-gray-300 mb-4" />
        <h2 className="font-semibold text-gray-800 text-lg mb-2">Admin Access Required</h2>
        <p className="text-gray-500 text-sm">Only administrators can manage Templates.</p>
      </div>
    );
  }
  return <>{children}</>;
}

const CATEGORIES = ['all', 'greeting', 'services', 'booking', 'faq', 'escalation', 'closing', 'other'];
const LANGS = ['en', 'af', 'zu', 'xh', 'es', 'fr', 'de', 'pt', 'ar', 'zh'];

interface TemplateFormData {
  name: string; trigger: string; response: string;
  category: string; language: string; isActive: boolean;
}
const emptyForm: TemplateFormData = { name: '', trigger: '', response: '', category: 'general', language: 'en', isActive: true };

// ── Variable substitution preview ─────────────────────────────────────────
function renderPreview(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── WhatsApp-style message bubble ──────────────────────────────────────────
function WaBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-[#dcf8c6] text-gray-800 text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-xs shadow-sm whitespace-pre-wrap leading-relaxed">
        {text || <span className="text-gray-400 italic">Response preview…</span>}
        <span className="text-[10px] text-gray-400 ml-3 float-right mt-1">12:34 ✓✓</span>
      </div>
    </div>
  );
}

// ── Form modal ─────────────────────────────────────────────────────────────
function TemplateFormModal({
  editing, form, setForm, onSubmit, onClose, isPending,
}: {
  editing: number | null; form: TemplateFormData; setForm: (f: TemplateFormData) => void;
  onSubmit: (e: React.FormEvent) => void; onClose: () => void; isPending: boolean;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({
    customer_name: 'Sarah', business_name: 'Acme Corp', time: '10:00 AM',
  });

  // Extract {{variables}} from the response
  const variables = [...new Set(Array.from(form.response.matchAll(/\{\{(\w+)\}\}/g), m => m[1]))];
  const previewText = renderPreview(form.response, previewVars);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-800">{editing ? 'Edit Template' : 'New Template'}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPreview(v => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${showPreview ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {showPreview ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Preview
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
        </div>

        <div className={`${showPreview ? 'grid grid-cols-2 divide-x divide-gray-100' : ''}`}>
          {/* Form side */}
          <form onSubmit={onSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Template Name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Greeting" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.filter(c => c !== 'all').map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Trigger Keywords *</label>
              <input required value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="hello, hi, hey, good morning" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated keywords that trigger this response</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Response *</label>
              <textarea required rows={5} value={form.response} onChange={e => setForm({ ...form, response: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                placeholder={"Hello {{customer_name}}! Welcome to {{business_name}}. How can I help? 😊"} />
              <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{'{{variable_name}}'}</code> for dynamic values</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Language</label>
                <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {LANGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={isPending}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60">
                {isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">Cancel</button>
            </div>
          </form>

          {/* Preview side */}
          {showPreview && (
            <div className="p-6 bg-gray-50 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Preview</p>
              {/* Variable overrides */}
              {variables.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Preview variables:</p>
                  {variables.map(v => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs text-blue-600 font-mono bg-blue-50 px-1.5 py-0.5 rounded w-32 truncate">{`{{${v}}}`}</span>
                      <input value={previewVars[v] ?? ''} onChange={e => setPreviewVars(p => ({ ...p, [v]: e.target.value }))}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder={v} />
                    </div>
                  ))}
                </div>
              )}
              {/* WhatsApp-style chat preview */}
              <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[180px] space-y-3">
                <div className="flex justify-start">
                  <div className="bg-white text-gray-800 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-xs shadow-sm">
                    Hi! {form.trigger.split(',')[0]?.trim() || 'hello'} 👋
                    <span className="text-[10px] text-gray-400 ml-3 float-right mt-1">12:33 ✓</span>
                  </div>
                </div>
                <WaBubble text={previewText} />
              </div>
              <p className="text-[10px] text-gray-400 text-center">WhatsApp message preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
function TemplatesInner() {
  const [search, setSearch]   = useState('');
  const [category, setCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm]       = useState<TemplateFormData>(emptyForm);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = trpc.templates.list.useQuery({
    search: search || undefined,
    category: category === 'all' ? undefined : category,
  });
  const createMutation = trpc.templates.create.useMutation({ onSuccess: () => { refetch(); resetForm(); } });
  const updateMutation = trpc.templates.update.useMutation({ onSuccess: () => { refetch(); resetForm(); } });
  const deleteMutation = trpc.templates.delete.useMutation({ onSuccess: () => refetch() });

  const utils = trpc.useUtils();

  function resetForm() { setForm(emptyForm); setShowForm(false); setEditing(null); }
  function openEdit(t: any) {
    setForm({ name: t.name, trigger: t.trigger, response: t.response, category: t.category || 'general', language: t.language || 'en', isActive: t.isActive ?? true });
    setEditing(t.id); setShowForm(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    editing ? updateMutation.mutate({ id: editing, ...form }) : createMutation.mutate(form);
  }

  function copyResponse(id: number, text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); });
  }

  // ── Export ───────────────────────────────────────────────────────────────
  function exportJSON() {
    const templates = data?.templates ?? [];
    const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `templates-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ────────────────────────────────────────────────────────────────
  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const items = JSON.parse(ev.target?.result as string) as any[];
        const valid = items.filter(i => i.name && i.trigger && i.response);
        Promise.all(valid.map(i => createMutation.mutateAsync({
          name: i.name, trigger: i.trigger, response: i.response,
          category: i.category || 'general', language: i.language || 'en', isActive: i.isActive ?? true,
        }))).then(() => refetch());
      } catch { alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const templates = data?.templates ?? [];
  const totalActive = templates.filter(t => t.isActive).length;
  const totalMatches = templates.reduce((s, t) => s + (t.matchCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Response Templates</h1>
          <p className="text-gray-500 text-sm mt-0.5">{totalActive} active · {totalMatches.toLocaleString()} total matches</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportJSON} className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition font-medium">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition font-medium">
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importJSON} />
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <TemplateFormModal editing={editing} form={form} setForm={setForm}
          onSubmit={handleSubmit} onClose={resetForm}
          isPending={createMutation.isPending || updateMutation.isPending} />
      )}

      {/* Category filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${category === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Template List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Spinner size="lg" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No templates found. Create your first one!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                {/* Active dot */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{t.name}</span>
                    {t.category && <Badge variant="default">{t.category}</Badge>}
                    {t.language && t.language !== 'en' && <Badge variant="info">{t.language.toUpperCase()}</Badge>}
                    {(t.matchCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full font-medium">
                        <Zap className="w-2.5 h-2.5" /> {t.matchCount} hits
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">Triggers: {t.trigger}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={e => { e.stopPropagation(); copyResponse(t.id, t.response); }}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Copy response">
                    {copiedId === t.id ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); openEdit(t); }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Delete this template?')) deleteMutation.mutate({ id: t.id }); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expanded === t.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Expanded — WhatsApp preview */}
              {expanded === t.id && (
                <div className="border-t border-gray-100 grid grid-cols-2 divide-x divide-gray-100">
                  {/* Raw response */}
                  <div className="px-5 py-4 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 mb-2">Response text</p>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-white rounded-lg p-3 border border-gray-100">
                      {t.response}
                    </pre>
                  </div>
                  {/* WhatsApp preview */}
                  <div className="px-5 py-4 bg-[#e5ddd5]">
                    <p className="text-xs font-medium text-gray-500 mb-2">WhatsApp preview</p>
                    <div className="space-y-2">
                      <div className="flex justify-start">
                        <div className="bg-white text-gray-800 text-xs rounded-2xl rounded-tl-sm px-3 py-2 max-w-[200px] shadow-sm">
                          {t.trigger.split(',')[0]?.trim() || 'hello'} 👋
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="bg-[#dcf8c6] text-gray-800 text-xs rounded-2xl rounded-tr-sm px-3 py-2 max-w-[220px] shadow-sm whitespace-pre-wrap leading-relaxed">
                          {renderPreview(t.response, { customer_name: 'Sarah', business_name: 'Your Business' })}
                          <span className="text-[9px] text-gray-400 ml-2 float-right mt-0.5">✓✓</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Templates() {
  return (
    <AdminGuard>
      <TemplatesInner />
    </AdminGuard>
  );
}
