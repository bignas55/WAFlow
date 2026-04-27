import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Plus, Pencil, Trash2, User, Phone, Mail, X, Check } from "lucide-react";

interface StaffForm {
  name: string;
  phone: string;
  email: string;
  bio: string;
  color: string;
}

const emptyForm: StaffForm = { name: "", phone: "", email: "", bio: "", color: "#6366f1" };

const COLORS = ["#6366f1", "#25D366", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#14b8a6", "#f97316"];

export default function StaffManagement() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const { data: staffList = [], refetch } = trpc.staff.list.useQuery();

  const createMutation = trpc.staff.create.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); setForm(emptyForm); setEditId(null); },
    onError: (e) => setError(e.message),
  });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => { refetch(); setShowForm(false); setForm(emptyForm); setEditId(null); },
    onError: (e) => setError(e.message),
  });

  const deleteMutation = trpc.staff.delete.useMutation({
    onSuccess: () => refetch(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (editId) {
      updateMutation.mutate({ id: editId, ...form, phone: form.phone || undefined, email: form.email || undefined, bio: form.bio || undefined });
    } else {
      createMutation.mutate({ ...form, phone: form.phone || undefined, email: form.email || undefined, bio: form.bio || undefined });
    }
  };

  const openEdit = (s: typeof staffList[0]) => {
    setForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", bio: s.bio ?? "", color: s.color });
    setEditId(s.id);
    setShowForm(true);
    setError("");
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage your team and assign them to appointments</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setEditId(null); setError(""); setShowForm(true); }}
          className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Staff grid */}
      {staffList.length === 0 ? (
        <div className="card text-center py-12">
          <User className="w-10 h-10 text-gray-600 mx-auto mb-2" />
          <p className="text-gray-500">No staff added yet.</p>
          <p className="text-gray-600 text-sm mt-1">Add your team members to assign them to appointments.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffList.map(s => (
            <div key={s.id} className="card flex items-start gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: s.color }}>
                {s.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-white truncate">{s.name}</p>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} className="p-1 text-gray-400 hover:text-white rounded"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm(`Remove ${s.name}?`)) deleteMutation.mutate({ id: s.id }); }}
                      className="p-1 text-gray-400 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {s.phone && <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5"><Phone className="w-3 h-3" />{s.phone}</div>}
                {s.email && <div className="flex items-center gap-1 text-xs text-gray-400"><Mail className="w-3 h-3" />{s.email}</div>}
                {s.bio && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.bio}</p>}
                <span className={`mt-2 inline-block px-2 py-0.5 text-xs rounded-full ${s.isActive ? 'bg-green-900/40 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">{editId ? "Edit Staff Member" : "Add Staff Member"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Full name *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input w-full" placeholder="Jane Doe" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input w-full" placeholder="0821234567" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input w-full" placeholder="jane@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Bio (optional)</label>
                <textarea rows={2} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className="input w-full resize-none" placeholder="Short description…" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Colour</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              {editId && (
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#25D366]"
                    checked={staffList.find(s => s.id === editId)?.isActive ?? true}
                    onChange={e => updateMutation.mutate({ id: editId!, isActive: e.target.checked })} />
                  Active
                </label>
              )}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" /> {editId ? "Save Changes" : "Add Staff"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
