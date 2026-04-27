import React, { useState, useEffect } from 'react';
import {
  Calendar, Clock, Plus, X, CheckCircle2, XCircle, AlertCircle,
  User, Phone, Briefcase, ChevronLeft, ChevronRight, Download,
  Edit2, Trash2, RefreshCw, FileText, Printer, Send, Check,
  CheckSquare, Square, MessageSquare, ListChecks,
} from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Spinner } from '../components/ui/Spinner';
import { useWhatsAppSocket } from '../hooks/useWhatsAppSocket';

// ── Invoice Modal ──────────────────────────────────────────────────────────────

function InvoiceModal({ appointmentId, onClose }: { appointmentId: number; onClose: () => void }) {
  const { data, isLoading } = trpc.appointments.invoiceData.useQuery({ appointmentId });
  const [waSent, setWaSent] = useState(false);
  const sendMutation = trpc.appointments.sendInvoice.useMutation({
    onSuccess: () => { setWaSent(true); setTimeout(() => setWaSent(false), 3000); },
  });

  if (isLoading) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-10 h-10 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!data) return null;

  const apptDate = (() => {
    const [y, m, d] = data.appointment.date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  })();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white text-gray-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Toolbar (hidden from print) */}
        <div className="no-print flex items-center justify-between px-5 py-3 bg-gray-100 border-b border-gray-200">
          <span className="font-semibold text-gray-700">Invoice Preview</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => sendMutation.mutate({ appointmentId })}
              disabled={sendMutation.isPending || waSent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {waSent ? <><Check className="w-4 h-4" /> Sent!</> : sendMutation.isPending ? "Sending…" : <><Send className="w-4 h-4" /> Send WhatsApp</>}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#25D366] text-white rounded-lg hover:bg-green-500 transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-800"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Invoice content */}
        <div id="invoice-print" className="p-8 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.businessName}</h1>
              {data.businessEmail && <p className="text-sm text-gray-500 mt-0.5">{data.businessEmail}</p>}
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-[#25D366]">INVOICE</p>
              <p className="text-sm text-gray-500">{data.invoiceNumber}</p>
              <p className="text-xs text-gray-400 mt-1">Issued: {new Date(data.issuedAt).toLocaleDateString("en-ZA")}</p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Bill to + appointment info */}
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</p>
              <p className="font-semibold text-gray-900">{data.appointment.customer?.name || "Customer"}</p>
              <p className="text-gray-600">{data.appointment.customer?.phone}</p>
              {data.appointment.customer?.email && <p className="text-gray-600">{data.appointment.customer.email}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Appointment Details</p>
              <p className="text-gray-700">Date: <span className="font-medium text-gray-900">{apptDate}</span></p>
              <p className="text-gray-700">Time: <span className="font-medium text-gray-900">{data.appointment.time}</span></p>
              <p className="text-gray-700">Status: <span className="font-medium text-green-600 capitalize">{data.appointment.status}</span></p>
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4 font-semibold">Service</th>
                <th className="text-center py-3 px-4 font-semibold">Duration</th>
                <th className="text-right py-3 px-4 font-semibold">Unit Price</th>
                <th className="text-right py-3 px-4 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-200">
                <td className="py-3 px-4 font-medium text-gray-900">{data.lineItem.description}</td>
                <td className="py-3 px-4 text-center text-gray-600">{data.lineItem.duration} min</td>
                <td className="py-3 px-4 text-right text-gray-900">R {data.lineItem.unitPrice.toFixed(2)}</td>
                <td className="py-3 px-4 text-right text-gray-900">R {data.lineItem.unitPrice.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>R {data.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>VAT (15%)</span>
                <span>R {data.vat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-300 pt-2 mt-2">
                <span>Total</span>
                <span>R {data.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {data.appointment.notes && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p>{data.appointment.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
            <p>Thank you for your business! — {data.businessName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-900/40 text-blue-300 border border-blue-700',
  completed:  'bg-green-900/40 text-green-300 border border-green-700',
  cancelled:  'bg-gray-800 text-gray-400 border border-gray-700',
  no_show:    'bg-red-900/40 text-red-300 border border-red-700',
};

// ── Book / Edit form ──────────────────────────────────────────────────────────

interface BookForm {
  customerPhone: string;
  customerName: string;
  serviceId: string;
  date: string;
  time: string;
  notes: string;
  staffId: string;
  isRecurring: boolean;
  recurrencePattern: "weekly" | "fortnightly" | "monthly" | "";
  recurrenceEndDate: string;
}

const emptyForm: BookForm = {
  customerPhone: '', customerName: '', serviceId: '',
  date: todayStr(), time: '09:00', notes: '',
  staffId: '', isRecurring: false, recurrencePattern: '', recurrenceEndDate: '',
};

// Generate time slots 07:00–18:00 in 30-min steps
const TIME_SLOTS = Array.from({ length: 23 }, (_, i) => {
  const totalMins = 7 * 60 + i * 30;
  return `${pad(Math.floor(totalMins / 60))}:${pad(totalMins % 60)}`;
});

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Appointments() {
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<BookForm>(emptyForm);
  const [editId, setEditId]       = useState<number | null>(null);
  const [conflictMsg, setConflictMsg] = useState('');
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [bookError, setBookError] = useState('');
  const [invoiceApptId, setInvoiceApptId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'calendar' | 'waitlist'>('calendar');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkReminderMsg, setBulkReminderMsg] = useState('');

  // Queries
  const monthKey = `${viewYear}-${pad(viewMonth + 1)}`;
  const { data: monthData, refetch: refetchMonth } = trpc.appointments.list.useQuery(
    { month: monthKey, status: 'all' }, { refetchInterval: 30_000 }
  );
  const { data: dayData, refetch: refetchDay } = trpc.appointments.list.useQuery(
    { date: selectedDate, status: 'all' }, { refetchInterval: 10_000 }
  );
  const { data: todaySummary } = trpc.appointments.todaySummary.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: serviceList }  = trpc.appointments.services.useQuery();
  const { data: staffList = [] } = trpc.staff.list.useQuery();
  const { data: waitlistData = [], refetch: refetchWaitlist } = trpc.waitlist.list.useQuery({});
  const removeWaitlistMutation = trpc.waitlist.remove.useMutation({ onSuccess: () => refetchWaitlist() });

  // Real-time: auto-refresh when a WhatsApp booking is confirmed
  const { lastAppointment } = useWhatsAppSocket();
  useEffect(() => {
    if (!lastAppointment) return;
    refetchMonth();
    refetchDay();
  }, [lastAppointment]);

  // Conflict check
  const conflictQuery = trpc.appointments.checkConflict.useQuery(
    {
      date: form.date,
      time: form.time,
      serviceId: Number(form.serviceId) || 1,
      excludeId: editId ?? undefined,
    },
    { enabled: !!(form.serviceId && form.date && form.time), refetchOnMount: false }
  );

  useEffect(() => {
    if (conflictQuery.data) {
      setConflictMsg(conflictQuery.data.conflict ? conflictQuery.data.message : '');
    }
  }, [conflictQuery.data]);

  const bookMutation = trpc.appointments.book.useMutation({
    onSuccess: () => {
      refetchMonth(); refetchDay();
      resetForm();
    },
    onError: (e) => setBookError(e.message),
  });

  const statusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => { refetchMonth(); refetchDay(); },
  });

  const cancelMutation = trpc.appointments.cancel.useMutation({
    onSuccess: () => { refetchMonth(); refetchDay(); },
  });

  const bulkStatusMutation = trpc.appointments.bulkUpdateStatus.useMutation({
    onSuccess: () => { refetchMonth(); refetchDay(); setSelectedIds(new Set()); },
  });

  const bulkReminderMutation = trpc.appointments.bulkSendReminder.useMutation({
    onSuccess: () => { setSelectedIds(new Set()); alert('Reminders sent!'); },
  });

  const exportMutation = trpc.appointments.exportExcel.useMutation({
    onSuccess: (d) => alert(`✅ Excel exported to:\n${d.filePath}`),
    onError: (e) => alert(`Export failed: ${e.message}`),
  });

  const resetForm = () => { setForm({ ...emptyForm, date: selectedDate }); setShowForm(false); setEditId(null); setBookError(''); setConflictMsg(''); };

  const openBook = () => { setForm({ ...emptyForm, date: selectedDate }); setEditId(null); setBookError(''); setConflictMsg(''); setShowForm(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (conflictMsg) return;
    setBookError('');
    bookMutation.mutate({
      customerPhone: form.customerPhone,
      customerName: form.customerName || undefined,
      serviceId: Number(form.serviceId),
      date: form.date,
      time: form.time,
      notes: form.notes || undefined,
      staffId: form.staffId ? Number(form.staffId) : undefined,
      isRecurring: form.isRecurring,
      recurrencePattern: (form.isRecurring && form.recurrencePattern) ? form.recurrencePattern as "weekly"|"fortnightly"|"monthly" : undefined,
      recurrenceEndDate: (form.isRecurring && form.recurrenceEndDate) ? form.recurrenceEndDate : undefined,
    });
  };

  // Navigate months
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Group month appointments by date
  const apptByDate: Record<string, any[]> = {};
  for (const a of (monthData?.appointments || [])) {
    if (!apptByDate[a.date]) apptByDate[a.date] = [];
    apptByDate[a.date].push(a);
  }

  const selectedAppts = dayData?.appointments || [];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Appointments</h1>
          <p className="text-gray-400 text-sm mt-0.5">Book, track and export — auto conflict detection + Excel sync</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            {exportMutation.isPending ? <Spinner size="sm" /> : <Download className="w-4 h-4 text-green-400" />}
            Export Excel
          </button>
          <button onClick={openBook} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> Book Appointment
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit">
        {(['calendar', 'waitlist'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-[#25D366] text-white' : 'text-gray-400 hover:text-white'}`}>
            {t === 'calendar' ? 'Calendar' : `Waitlist${waitlistData.length > 0 ? ` (${waitlistData.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Waitlist tab */}
      {activeTab === 'waitlist' && (
        <div className="card">
          <h2 className="font-semibold text-white mb-3">Waitlist</h2>
          {waitlistData.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">No customers on the waitlist.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Service</th>
                  <th className="pb-2 pr-4">Requested Date</th>
                  <th className="pb-2 pr-4">Joined</th>
                  <th className="pb-2 pr-4">Notified</th>
                  <th className="pb-2"></th>
                </tr></thead>
                <tbody>
                  {waitlistData.map(w => (
                    <tr key={w.id} className="border-b border-gray-800">
                      <td className="py-2 pr-4">
                        <p className="text-white">{w.name || 'Unknown'}</p>
                        <p className="text-gray-500 text-xs">{w.phoneNumber}</p>
                      </td>
                      <td className="py-2 pr-4 text-gray-300">{w.service?.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-gray-300">{w.requestedDate ?? '—'}</td>
                      <td className="py-2 pr-4 text-gray-400 text-xs">{new Date(w.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 pr-4">
                        {w.notifiedAt ? (
                          <span className="px-2 py-0.5 bg-green-900/40 text-green-400 text-xs rounded-full">Notified</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-700 text-gray-400 text-xs rounded-full">Pending</span>
                        )}
                      </td>
                      <td className="py-2">
                        <button onClick={() => removeWaitlistMutation.mutate({ id: w.id })} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Today's stats */}
      {todaySummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Today Total",  value: todaySummary.total,     color: "text-blue-400" },
            { label: "Scheduled",    value: todaySummary.scheduled, color: "text-yellow-400" },
            { label: "Completed",    value: todaySummary.completed, color: "text-green-400" },
            { label: "Cancelled",    value: todaySummary.cancelled, color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'calendar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Calendar ── */}
        <div className="card col-span-1">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="font-semibold text-white text-sm">{MONTHS[viewMonth]} {viewYear}</h3>
            <button onClick={nextMonth} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {calendarCells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
              const hasAppts = apptByDate[dateStr]?.length > 0;
              const isToday = dateStr === todayStr();
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition
                    ${isSelected ? 'bg-[#25D366] text-white font-bold' : isToday ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
                >
                  {day}
                  {hasAppts && (
                    <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[#25D366]'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Today button */}
          <button
            onClick={() => { setSelectedDate(todayStr()); setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); }}
            className="mt-3 w-full btn-secondary text-sm py-1.5"
          >
            Jump to Today
          </button>
        </div>

        {/* ── Day appointments ── */}
        <div className="col-span-1 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              {selectedDate === todayStr() ? 'Today' : selectedDate}
              <span className="text-gray-500 text-sm font-normal ml-2">({selectedAppts.length} appointment{selectedAppts.length !== 1 ? 's' : ''})</span>
            </h3>
            <button onClick={() => { refetchDay(); refetchMonth(); }} className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {selectedAppts.length === 0 ? (
            <div className="card text-center py-12">
              <Calendar className="w-10 h-10 mx-auto text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium">No appointments on this day</p>
              <button onClick={openBook} className="mt-4 btn-primary text-sm inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Book one now
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Bulk toolbar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap bg-[#25D366]/10 border border-[#25D366]/30 rounded-xl px-4 py-2.5 mb-2">
                  <ListChecks className="w-4 h-4 text-[#25D366]" />
                  <span className="text-sm text-[#25D366] font-medium">{selectedIds.size} selected</span>
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <button
                      onClick={() => bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: 'completed' })}
                      disabled={bulkStatusMutation.isPending}
                      className="flex items-center gap-1.5 text-xs bg-green-900/40 text-green-400 hover:bg-green-900/60 px-3 py-1.5 rounded-lg transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Completed
                    </button>
                    <button
                      onClick={() => { if (confirm(`Cancel ${selectedIds.size} appointments?`)) bulkStatusMutation.mutate({ ids: Array.from(selectedIds), status: 'cancelled' }); }}
                      disabled={bulkStatusMutation.isPending}
                      className="flex items-center gap-1.5 text-xs bg-red-900/40 text-red-400 hover:bg-red-900/60 px-3 py-1.5 rounded-lg transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancel All
                    </button>
                    <button
                      onClick={() => bulkReminderMutation.mutate({ ids: Array.from(selectedIds), message: bulkReminderMsg || undefined })}
                      disabled={bulkReminderMutation.isPending}
                      className="flex items-center gap-1.5 text-xs bg-blue-900/40 text-blue-400 hover:bg-blue-900/60 px-3 py-1.5 rounded-lg transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Send Reminders
                    </button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded-lg transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {selectedAppts
                .sort((a: any, b: any) => a.time.localeCompare(b.time))
                .map((appt: any) => (
                  <div key={appt.id} className={`card !p-4 flex items-start gap-4 ${selectedIds.has(appt.id) ? 'ring-1 ring-[#25D366]/40' : ''}`}>
                    {/* Checkbox */}
                    <button
                      onClick={() => setSelectedIds(prev => {
                        const next = new Set(prev);
                        next.has(appt.id) ? next.delete(appt.id) : next.add(appt.id);
                        return next;
                      })}
                      className="mt-1 shrink-0 text-gray-600 hover:text-[#25D366] transition"
                    >
                      {selectedIds.has(appt.id)
                        ? <CheckSquare className="w-4 h-4 text-[#25D366]" />
                        : <Square className="w-4 h-4" />}
                    </button>
                    {/* Time */}
                    <div className="flex-shrink-0 text-center w-14">
                      <p className="text-[#25D366] font-bold text-lg leading-tight">{appt.time}</p>
                      <p className="text-xs text-gray-500">{appt.service?.duration || '?'} min</p>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled}`}>
                          {appt.status?.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-sm font-semibold text-white truncate">{appt.service?.name || 'Service'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-400">
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{appt.customer?.name || 'Unknown'}</span>
                        <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{appt.customer?.phone}</span>
                      </div>
                      {appt.notes && <p className="text-xs text-gray-500 mt-1 italic">"{appt.notes}"</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {appt.status === 'scheduled' && (
                        <>
                          <button
                            onClick={() => statusMutation.mutate({ id: appt.id, status: 'completed' })}
                            title="Mark completed"
                            className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-900/20 rounded-lg transition"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm('Mark as no-show?')) statusMutation.mutate({ id: appt.id, status: 'no_show' }); }}
                            title="No show"
                            className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-yellow-900/20 rounded-lg transition"
                          >
                            <AlertCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm('Cancel this appointment?')) cancelMutation.mutate({ id: appt.id }); }}
                            title="Cancel"
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {appt.status === 'completed' && (
                        <button
                          onClick={() => setInvoiceApptId(appt.id)}
                          title="Generate Invoice"
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>}

      {/* ── Booking modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#25D366]" /> Book Appointment
              </h2>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">

              {/* Customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <Phone className="w-3.5 h-3.5 inline mr-1" /> Phone *
                  </label>
                  <input
                    required
                    value={form.customerPhone}
                    onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                    className="input"
                    placeholder="+27 82 000 0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <User className="w-3.5 h-3.5 inline mr-1" /> Name
                  </label>
                  <input
                    value={form.customerName}
                    onChange={e => setForm({ ...form, customerName: e.target.value })}
                    className="input"
                    placeholder="Customer name"
                  />
                </div>
              </div>

              {/* Service */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  <Briefcase className="w-3.5 h-3.5 inline mr-1" /> Service *
                </label>
                <select
                  required
                  value={form.serviceId}
                  onChange={e => setForm({ ...form, serviceId: e.target.value })}
                  className="input"
                >
                  <option value="">— Select a service —</option>
                  {serviceList?.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration} min) — R{Number(s.price).toFixed(2)}
                    </option>
                  ))}
                </select>
                {serviceList?.length === 0 && (
                  <p className="text-xs text-yellow-400 mt-1">No services found — add services first in Configuration.</p>
                )}
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <Calendar className="w-3.5 h-3.5 inline mr-1" /> Date *
                  </label>
                  <input
                    required
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                    className="input"
                    min={todayStr()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    <Clock className="w-3.5 h-3.5 inline mr-1" /> Time *
                  </label>
                  <select
                    required
                    value={form.time}
                    onChange={e => setForm({ ...form, time: e.target.value })}
                    className="input"
                  >
                    {TIME_SLOTS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conflict warning */}
              {conflictMsg && (
                <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>⚠️ {conflictMsg}</span>
                </div>
              )}
              {form.serviceId && form.date && form.time && !conflictMsg && conflictQuery.data && (
                <div className="flex items-center gap-2 p-2 bg-green-900/20 border border-green-800 rounded-lg text-xs text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Slot available
                </div>
              )}

              {/* Staff assignment */}
              {staffList.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Assign Staff (optional)</label>
                  <select value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })} className="input">
                    <option value="">— Any available —</option>
                    {staffList.filter(s => s.isActive).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Recurring */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#25D366]" checked={form.isRecurring} onChange={e => setForm({ ...form, isRecurring: e.target.checked })} />
                  Recurring appointment
                </label>
                {form.isRecurring && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select value={form.recurrencePattern} onChange={e => setForm({ ...form, recurrencePattern: e.target.value as any })} className="input text-sm">
                      <option value="">Frequency</option>
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <input type="date" value={form.recurrenceEndDate} onChange={e => setForm({ ...form, recurrenceEndDate: e.target.value })}
                      className="input text-sm" placeholder="End date (optional)" min={form.date} />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input resize-none"
                  placeholder="Any special requests or notes..."
                />
              </div>

              {/* Booking error */}
              {bookError && (
                <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {bookError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={bookMutation.isPending || !!conflictMsg || !form.serviceId}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {bookMutation.isPending ? <Spinner size="sm" /> : <Calendar className="w-4 h-4" />}
                  Confirm Booking
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary px-5">Cancel</button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Appointment will be saved to database and synced to <code className="text-gray-400">exports/appointments.xlsx</code>
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ── Invoice modal ── */}
      {invoiceApptId && (
        <InvoiceModal appointmentId={invoiceApptId} onClose={() => setInvoiceApptId(null)} />
      )}
    </div>
  );
}
