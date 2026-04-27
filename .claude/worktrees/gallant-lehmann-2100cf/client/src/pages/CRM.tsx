import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Users, MessageSquare, Phone, Calendar, Star, Filter,
  ChevronDown, SlidersHorizontal, Save, Download, Tag, CheckSquare,
  Square, X, Upload, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';

// ── Custom Fields panel ───────────────────────────────────────────────────────
function CustomFieldsPanel({ customerId }: { customerId: number }) {
  const { data: definitions } = trpc.customFields.listDefinitions.useQuery();
  const { data: values, refetch } = trpc.customFields.getValues.useQuery({ customerId });
  const setValuesMutation = trpc.customFields.setValues.useMutation({ onSuccess: () => refetch() });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (values) setDraft({ ...values }); }, [values, customerId]);

  const handleSave = () => {
    setValuesMutation.mutate({ customerId, values: draft });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (!definitions?.length) return null;

  return (
    <div>
      <h3 className="font-semibold text-gray-700 mb-2 text-sm flex items-center gap-1.5">
        <SlidersHorizontal className="w-4 h-4 text-purple-500" /> Custom Fields
      </h3>
      <div className="space-y-2">
        {definitions.map((def: any) => (
          <div key={def.id}>
            <label className="text-xs text-gray-500 block mb-0.5">
              {def.label}{def.isRequired ? ' *' : ''}
            </label>
            {def.fieldType === 'textarea' ? (
              <textarea rows={2} value={draft[def.fieldKey] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [def.fieldKey]: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none" />
            ) : def.fieldType === 'select' ? (
              <select value={draft[def.fieldKey] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [def.fieldKey]: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400">
                <option value="">— select —</option>
                {(def.options ?? []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input type={def.fieldType === 'number' ? 'number' : def.fieldType === 'date' ? 'date' : 'text'}
                value={draft[def.fieldKey] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [def.fieldKey]: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400" />
            )}
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={setValuesMutation.isPending}
        className="mt-2 flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700 transition">
        <Save className="w-3.5 h-3.5" />
        {saved ? 'Saved!' : setValuesMutation.isPending ? 'Saving…' : 'Save Fields'}
      </button>
    </div>
  );
}

// ── Main CRM ──────────────────────────────────────────────────────────────────

type SortBy = 'name' | 'lastContact' | 'totalMessages' | 'satisfaction';

export default function CRM() {
  const [search, setSearch]     = useState('');
  const [sortBy, setSortBy]     = useState<SortBy>('lastContact');
  const [selected, setSelected] = useState<number | null>(null);
  const [tag, setTag]           = useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTag, setBulkTag]         = useState('');
  const [showBulk, setShowBulk]       = useState(false);

  const { data, isLoading } = trpc.crm.customers.useQuery({
    search: search || undefined, sortBy, page: 1, limit: 50,
  });

  const { data: customerDetail } = trpc.crm.customerDetail.useQuery(
    { customerId: selected! }, { enabled: !!selected }
  );

  const [showImport, setShowImport]         = useState(false);
  const [importCsv, setImportCsv]           = useState('');
  const [importPreview, setImportPreview]   = useState<{name:string;phone:string;email:string;tags:string[]}[]>([]);
  const [importSkipDups, setImportSkipDups] = useState(true);
  const [importResult, setImportResult]     = useState<{inserted:number;skipped:number;total:number}|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTagMutation      = trpc.crm.addTag.useMutation();
  const updateNotesMutation = trpc.crm.updateNotes.useMutation();
  const importMutation      = trpc.crm.importContacts.useMutation({
    onSuccess: (res) => {
      setImportResult(res);
      utils.crm.customers.invalidate();
    },
  });
  const utils = trpc.useUtils();

  // ── CSV parsing helpers ─────────────────────────────────────────────────
  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    result.push(cur.trim());
    return result;
  }

  function parseCsvToContacts(csv: string) {
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,'_'));
    const get = (row: string[], key: string) => {
      const i = headers.findIndex(h => h.includes(key));
      return i >= 0 ? (row[i] || '').trim() : '';
    };
    return lines.slice(1).map(line => {
      const row = parseCsvLine(line);
      const tagsRaw = get(row, 'tag');
      return {
        name: get(row, 'name'),
        phone: get(row, 'phone'),
        email: get(row, 'email'),
        tags: tagsRaw ? tagsRaw.split(/[;|]/).map(t => t.trim()).filter(Boolean) : [],
      };
    }).filter(r => r.phone);
  }

  function handleCsvChange(text: string) {
    setImportCsv(text);
    setImportResult(null);
    setImportPreview(parseCsvToContacts(text).slice(0, 5));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleCsvChange((ev.target?.result as string) || '');
    reader.readAsText(file);
  }

  function runImport() {
    const contacts = parseCsvToContacts(importCsv);
    if (!contacts.length) return;
    importMutation.mutate({ contacts, skipDuplicates: importSkipDups });
  }

  function closeImport() {
    setShowImport(false);
    setImportCsv('');
    setImportPreview([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const selectedCustomer = data?.customers.find((c) => c.id === selected);
  const customers = data?.customers ?? [];

  function toggleBulk(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAll() {
    if (selectedIds.size === customers.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(customers.map(c => c.id)));
  }
  function bulkAddTag() {
    const t = bulkTag.trim();
    if (!t) return;
    selectedIds.forEach(id => addTagMutation.mutate({ customerId: id, tag: t }));
    setBulkTag('');
    setSelectedIds(new Set());
    setShowBulk(false);
    setTimeout(() => utils.crm.customers.invalidate(), 500);
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!customers.length) return;
    const headers = ['Name', 'Phone', 'Email', 'Tags', 'Conversations', 'Satisfaction', 'Last Contact'];
    const rows = customers.map(c => [
      c.name || '',
      c.phone || '',
      c.email || '',
      (c.tags ?? []).join('; '),
      String(c.totalConversations || 0),
      c.satisfactionScore != null ? String(c.satisfactionScore) : '',
      c.lastContact ? new Date(c.lastContact).toISOString().slice(0, 10) : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `customers-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm mt-0.5">{data?.total || 0} total contacts</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition font-medium">
              <Tag className="w-3.5 h-3.5" /> Tag {selectedIds.size} selected
            </button>
          )}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition font-medium">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200 transition font-medium">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Bulk tag modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowBulk(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Bulk Add Tag</h3>
            <p className="text-sm text-gray-500 mb-3">Add a tag to {selectedIds.size} selected customers</p>
            <input value={bulkTag} onChange={e => setBulkTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && bulkAddTag()}
              placeholder="e.g. vip, lead, follow-up"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 mb-4" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowBulk(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={bulkAddTag} disabled={!bulkTag.trim()}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition">
                Add Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeImport}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Import Contacts</h3>
                <p className="text-xs text-gray-500 mt-0.5">Upload a CSV with columns: name, phone, email, tags</p>
              </div>
              <button onClick={closeImport} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Result Banner */}
              {importResult && (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-800">
                    Import complete — <strong>{importResult.inserted}</strong> added, <strong>{importResult.skipped}</strong> skipped out of {importResult.total} rows.
                  </p>
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload CSV file</label>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
              </div>

              {/* Paste CSV */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Or paste CSV directly</label>
                <textarea rows={6} value={importCsv} onChange={e => handleCsvChange(e.target.value)}
                  placeholder={"name,phone,email,tags\nJohn Smith,+27821234567,john@example.com,vip\nJane Doe,+27831234567,,lead"}
                  className="w-full px-3 py-2 text-sm font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>

              {/* Preview */}
              {importPreview.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Preview — first {importPreview.length} rows ({parseCsvToContacts(importCsv).length} total)
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>{['Name','Phone','Email','Tags'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {importPreview.map((row, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-700">{row.name || '—'}</td>
                            <td className="px-3 py-1.5 text-gray-700 font-mono">{row.phone}</td>
                            <td className="px-3 py-1.5 text-gray-500">{row.email || '—'}</td>
                            <td className="px-3 py-1.5">
                              {row.tags.length ? row.tags.map(t => (
                                <span key={t} className="inline-block bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded mr-1">{t}</span>
                              )) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warning if no phone column found */}
              {importCsv.trim() && importPreview.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <p className="text-sm text-amber-800">No valid rows found. Make sure your CSV has a <code className="bg-amber-100 px-1 rounded">phone</code> column.</p>
                </div>
              )}

              {/* Options */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={importSkipDups} onChange={e => setImportSkipDups(e.target.checked)}
                  className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">Skip duplicate phone numbers (keep existing records)</span>
              </label>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <p className="text-xs text-gray-400">Max 5,000 contacts per import</p>
              <div className="flex gap-2">
                <button onClick={closeImport} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                <button
                  onClick={runImport}
                  disabled={importMutation.isPending || parseCsvToContacts(importCsv).length === 0}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                  <Upload className="w-3.5 h-3.5" />
                  {importMutation.isPending ? 'Importing…' : `Import ${parseCsvToContacts(importCsv).length || ''} Contacts`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Customer List */}
        <div className="w-80 flex flex-col bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Search + Sort */}
          <div className="p-3 space-y-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers..."
                className="w-full pl-9 pr-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-gray-400 hover:text-blue-600 transition-colors" title="Select all">
                {selectedIds.size === customers.length && customers.length > 0
                  ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                  : <Square className="w-3.5 h-3.5" />}
              </button>
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none text-gray-600">
                <option value="lastContact">Last Contact</option>
                <option value="name">Name A-Z</option>
                <option value="totalMessages">Most Messages</option>
                <option value="satisfaction">Highest Rating</option>
              </select>
              {selectedIds.size > 0 && (
                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-20"><Spinner /></div>
            ) : customers.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No customers yet
              </div>
            ) : (
              customers.map((customer) => (
                <div key={customer.id}
                  className={`px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition ${
                    selected === customer.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}>
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => { e.stopPropagation(); toggleBulk(customer.id); }}
                      className="text-gray-300 hover:text-blue-600 flex-shrink-0 transition-colors">
                      {selectedIds.has(customer.id)
                        ? <CheckSquare className="w-4 h-4 text-blue-600" />
                        : <Square className="w-4 h-4" />}
                    </button>
                    <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0"
                      onClick={() => setSelected(customer.id)}>
                      <span className="text-white font-medium text-sm">
                        {(customer.name || customer.phone || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => setSelected(customer.id)}>
                      <p className="text-sm font-medium text-gray-800 truncate">{customer.name || customer.phone}</p>
                      <p className="text-xs text-gray-400 truncate">{customer.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 ml-10">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> {customer.totalConversations || 0}
                    </span>
                    {customer.satisfactionScore && (
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-yellow-400" />
                        {(customer.satisfactionScore as number).toFixed(1)}
                      </span>
                    )}
                    {customer.tags?.slice(0, 2).map((tag: string) => (
                      <Badge key={tag} variant="default" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Customer Detail */}
        <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a customer to view details</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Customer Header */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-xl">
                    {(selectedCustomer?.name || selectedCustomer?.phone || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900">{selectedCustomer?.name || 'Unknown'}</h2>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedCustomer?.phone}</span>
                    {selectedCustomer?.email && <span>{selectedCustomer.email}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {selectedCustomer?.tags?.map((t: string) => <Badge key={t} variant="info">{t}</Badge>)}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Conversations', value: customerDetail?.totalConversations || 0, icon: MessageSquare, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Messages',      value: customerDetail?.totalMessages || 0,      icon: MessageSquare, color: 'text-green-600 bg-green-50' },
                  { label: 'Satisfaction',   value: customerDetail?.avgSatisfaction ? `${(customerDetail.avgSatisfaction as number).toFixed(1)}/5` : 'N/A', icon: Star, color: 'text-yellow-600 bg-yellow-50' },
                  { label: 'Last Contact',   value: customerDetail?.lastContact ? new Date(customerDetail.lastContact).toLocaleDateString() : 'Never', icon: Calendar, color: 'text-purple-600 bg-purple-50' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className={`rounded-xl p-3 ${color.split(' ')[1]}`}>
                    <Icon className={`w-4 h-4 ${color.split(' ')[0]} mb-1`} />
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className={`font-bold text-sm ${color.split(' ')[0]}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Conversation History */}
              {customerDetail?.conversations && customerDetail.conversations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Conversation History</h3>
                  <div className="space-y-2">
                    {customerDetail.conversations.slice(0, 5).map((conv: any) => (
                      <div key={conv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-xs text-gray-600 truncate max-w-xs">{conv.lastMessage || 'No messages'}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(conv.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {conv.isEscalated && <Badge variant="warning">Escalated</Badge>}
                          <Badge variant={conv.status === 'active' ? 'success' : 'outline'}>{conv.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">Internal Notes</h3>
                <textarea rows={4}
                  defaultValue={customerDetail?.notes || ''}
                  onBlur={(e) => updateNotesMutation.mutate({ customerId: selected, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Add internal notes about this customer..." />
                <p className="text-xs text-gray-400 mt-1">Auto-saved on blur</p>
              </div>

              {/* Add Tag */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">Add Tag</h3>
                <div className="flex gap-2">
                  <input value={tag} onChange={(e) => setTag(e.target.value)}
                    placeholder="vip, repeat-customer, etc."
                    className="flex-1 px-3 py-2 text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim()) { addTagMutation.mutate({ customerId: selected, tag: tag.trim() }); setTag(''); } }} />
                  <button onClick={() => { if (tag.trim()) { addTagMutation.mutate({ customerId: selected, tag: tag.trim() }); setTag(''); } }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                    Add
                  </button>
                </div>
              </div>

              {/* Custom Fields */}
              <CustomFieldsPanel customerId={selected} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
