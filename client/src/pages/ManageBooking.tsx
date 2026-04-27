/**
 * Customer Self-Service Portal
 * Public page — accessible via /manage/:token
 * Lets customers view, reschedule, or cancel their own bookings.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import {
  CalendarDays, Clock, CheckCircle2, XCircle, RefreshCw,
  Loader2, AlertCircle, Check, X,
} from "lucide-react";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  scheduled:  "bg-blue-900/30 text-blue-400 border-blue-800",
  completed:  "bg-green-900/30 text-green-400 border-green-800",
  cancelled:  "bg-red-900/30 text-red-400 border-red-800",
  no_show:    "bg-yellow-900/30 text-yellow-400 border-yellow-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-700 text-gray-400 border-gray-600";
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Reschedule modal ──────────────────────────────────────────────────────────

function RescheduleModal({
  token, appointmentId, onClose, onDone,
}: {
  token: string; appointmentId: number; onClose: () => void; onDone: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [done, setDone] = useState(false);

  const mutation = trpc.selfService.rescheduleAppointment.useMutation({
    onSuccess: () => { setDone(true); setTimeout(() => { onDone(); onClose(); }, 1200); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-[#25D366]" /> Reschedule
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">New Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().slice(0,10)}
              className="input w-full mt-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400">New Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="input w-full mt-1 text-sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-300 text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate({ token, appointmentId, newDate: date, newTime: time })}
            disabled={!date || !time || mutation.isPending || done}
            className="flex-1 py-2 rounded-xl bg-[#25D366] text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {done ? <><Check className="w-4 h-4" /> Done!</> : mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
          </button>
        </div>
        {mutation.isError && <p className="text-red-400 text-xs">{mutation.error.message}</p>}
      </div>
    </div>
  );
}

// ── Appointment card ──────────────────────────────────────────────────────────

function AppointmentCard({
  appt, token, onRefresh,
}: {
  appt: { id: number; date: string; time: string; status: string; serviceName?: string | null };
  token: string;
  onRefresh: () => void;
}) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [cancelDone,     setCancelDone]     = useState(false);

  const cancelMutation = trpc.selfService.cancelAppointment.useMutation({
    onSuccess: () => { setCancelDone(true); setTimeout(onRefresh, 800); },
  });

  const isPast       = new Date(`${appt.date}T${appt.time}`) < new Date();
  const canModify    = appt.status === "scheduled" && !isPast;

  return (
    <div className={`bg-gray-800/50 border rounded-2xl p-4 space-y-3 ${appt.status === "cancelled" ? "border-red-900/40 opacity-60" : "border-gray-700"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white font-medium">{appt.serviceName ?? "Appointment"}</p>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {appt.date}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {appt.time}</span>
          </div>
        </div>
        <StatusBadge status={appt.status} />
      </div>

      {canModify && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setShowReschedule(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#25D366]/30 text-[#25D366] text-sm hover:bg-[#25D366]/10 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reschedule
          </button>
          <button
            onClick={() => { if (confirm("Cancel this appointment?")) cancelMutation.mutate({ token, appointmentId: appt.id }); }}
            disabled={cancelMutation.isPending || cancelDone}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-800 text-red-400 text-sm hover:bg-red-900/20 transition-colors disabled:opacity-50"
          >
            {cancelDone ? <><Check className="w-3.5 h-3.5" /> Done!</>
              : cancelMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><X className="w-3.5 h-3.5" /> Cancel</>}
          </button>
        </div>
      )}

      {showReschedule && (
        <RescheduleModal
          token={token} appointmentId={appt.id}
          onClose={() => setShowReschedule(false)}
          onDone={onRefresh}
        />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ManageBooking() {
  const { token = "" } = useParams<{ token: string }>();

  const query = trpc.selfService.resolve.useQuery({ token }, {
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>Invalid link</p>
        </div>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#25D366] animate-spin" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-3 text-red-500 opacity-60" />
          <p className="text-white font-medium">Link expired or invalid</p>
          <p className="text-gray-500 text-sm mt-1">Please contact us to get a new link.</p>
        </div>
      </div>
    );
  }

  const data = query.data!;
  const upcoming = data.appointments.filter(a => a.status === "scheduled" && new Date(`${a.date}T${a.time}`) >= new Date());
  const past     = data.appointments.filter(a => a.status !== "scheduled" || new Date(`${a.date}T${a.time}`) < new Date());

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {data.businessLogoUrl && (
            <img src={data.businessLogoUrl} alt="logo" className="w-10 h-10 rounded-xl object-cover" />
          )}
          <div>
            <h1 className="font-bold text-white">{data.businessName}</h1>
            <p className="text-xs text-gray-400">Your Booking Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        <div>
          <p className="text-gray-400 text-sm">Managing bookings for</p>
          <p className="text-white font-medium">{data.phoneNumber}</p>
        </div>

        {/* Upcoming */}
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#25D366]" /> Upcoming Appointments
          </h2>
          {upcoming.length === 0 ? (
            <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-6 text-center text-gray-500 text-sm">
              No upcoming appointments
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map(a => (
                <AppointmentCard key={a.id} appt={a} token={token} onRefresh={() => query.refetch()} />
              ))}
            </div>
          )}
        </div>

        {/* Past */}
        {past.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Past Appointments</h2>
            <div className="space-y-3">
              {past.slice(0, 5).map(a => (
                <AppointmentCard key={a.id} appt={a} token={token} onRefresh={() => query.refetch()} />
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-600 pt-4">
          Powered by WAFlow · Contact us directly if you need more help
        </p>
      </div>
    </div>
  );
}
