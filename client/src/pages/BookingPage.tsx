import { useState } from "react";
import { useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { Calendar, Clock, ChevronLeft, CheckCircle, AlertCircle, User, Phone, FileText, Plus } from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── Steps: service → date → time → details → confirm ─────────────────────

type Step = "service" | "date" | "time" | "details" | "done" | "waitlist_done";

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [wlPhone, setWlPhone] = useState("");
  const [wlName, setWlName] = useState("");

  const { data: config, isLoading: configLoading } = trpc.booking.getPageConfig.useQuery(
    { slug: slug! },
    { enabled: !!slug }
  );

  const { data: availableDates = [], isLoading: datesLoading } = trpc.booking.getAvailableDates.useQuery(
    { slug: slug!, serviceId: serviceId! },
    { enabled: !!slug && !!serviceId && step === "date" }
  );

  const { data: timeSlots = [], isLoading: timesLoading } = trpc.booking.getAvailableSlots.useQuery(
    { slug: slug!, serviceId: serviceId!, date: selectedDate },
    { enabled: !!slug && !!serviceId && !!selectedDate && step === "time" }
  );

  const submitMutation = trpc.booking.submit.useMutation({
    onSuccess: (data) => {
      setPaymentLink(data.paymentLink ?? null);
      setStep("done");
    },
    onError: (e) => setError(e.message),
  });

  const waitlistMutation = trpc.booking.joinWaitlist.useMutation({
    onSuccess: () => setStep("waitlist_done"),
    onError: (e) => setError(e.message),
  });

  if (configLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-[#25D366] border-t-transparent rounded-full" />
    </div>
  );

  if (!config) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-center p-6">
      <div>
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-gray-800">Booking page not found</h2>
        <p className="text-gray-500 mt-1">The link you followed may be invalid or expired.</p>
      </div>
    </div>
  );

  const selectedService = config.services.find(s => s.id === serviceId);

  // ── Waitlist form ────────────────────────────────────────────────────────
  if (showWaitlist) {
    return (
      <PageShell config={config}>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Join the Waitlist</h2>
        <p className="text-sm text-gray-500 mb-4">We'll WhatsApp you when a slot opens up for <strong>{selectedService?.name ?? "your service"}</strong>.</p>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="space-y-3">
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            placeholder="Your name" value={wlName} onChange={e => setWlName(e.target.value)} />
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            placeholder="WhatsApp number (e.g. 0821234567)" value={wlPhone} onChange={e => setWlPhone(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setShowWaitlist(false)} className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Cancel</button>
            <button
              disabled={!wlPhone || waitlistMutation.isPending}
              onClick={() => {
                setError("");
                waitlistMutation.mutate({ slug: slug!, serviceId: serviceId!, phone: wlPhone, name: wlName || undefined });
              }}
              className="flex-1 py-2 rounded-lg bg-[#25D366] text-white text-sm font-medium disabled:opacity-50"
            >
              {waitlistMutation.isPending ? "Adding…" : "Join Waitlist"}
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Step: done ───────────────────────────────────────────────────────────
  if (step === "done") return (
    <PageShell config={config}>
      <div className="text-center py-6">
        <CheckCircle className="w-14 h-14 text-[#25D366] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-800">Booking Confirmed!</h2>
        <p className="text-gray-500 mt-2 text-sm">We'll send a WhatsApp confirmation to <strong>{phone}</strong>.</p>
        <div className="mt-4 bg-gray-50 rounded-lg p-4 text-left text-sm space-y-1">
          <div className="flex gap-2"><Calendar className="w-4 h-4 text-gray-400 mt-0.5" /><span>{formatDate(selectedDate)}</span></div>
          <div className="flex gap-2"><Clock className="w-4 h-4 text-gray-400 mt-0.5" /><span>{selectedTime}</span></div>
          <div className="flex gap-2"><FileText className="w-4 h-4 text-gray-400 mt-0.5" /><span>{selectedService?.name}</span></div>
        </div>
        {paymentLink && (
          <a href={paymentLink} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-block w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium">
            💳 Pay Deposit
          </a>
        )}
      </div>
    </PageShell>
  );

  if (step === "waitlist_done") return (
    <PageShell config={config}>
      <div className="text-center py-6">
        <CheckCircle className="w-14 h-14 text-[#25D366] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-800">You're on the Waitlist!</h2>
        <p className="text-gray-500 mt-2 text-sm">We'll WhatsApp you as soon as a spot opens up.</p>
      </div>
    </PageShell>
  );

  return (
    <PageShell config={config}>
      {/* Progress bar */}
      <div className="flex gap-1 mb-5">
        {(["service","date","time","details"] as const).map((s, i) => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${
            ["service","date","time","details"].indexOf(step) >= i ? "bg-[#25D366]" : "bg-gray-200"
          }`} />
        ))}
      </div>

      {/* Step: service */}
      {step === "service" && (
        <>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Choose a service</h2>
          <div className="space-y-2">
            {config.services.map(svc => (
              <button key={svc.id} onClick={() => { setServiceId(svc.id); setStep("date"); }}
                className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-[#25D366] hover:bg-green-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{svc.name}</p>
                    {svc.description && <p className="text-xs text-gray-500 mt-0.5">{svc.description}</p>}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-sm font-semibold text-[#25D366]">R{Number(svc.price).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{svc.duration} min</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Step: date */}
      {step === "date" && (
        <>
          <button onClick={() => setStep("service")} className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Choose a date</h2>
          {datesLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-4 border-[#25D366] border-t-transparent rounded-full" /></div>
          ) : availableDates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No available dates in the next 6 weeks.</p>
              <button onClick={() => setShowWaitlist(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium">
                <Plus className="w-4 h-4" /> Join Waitlist
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {availableDates.map(d => (
                <button key={d} onClick={() => { setSelectedDate(d); setStep("time"); }}
                  className="p-2 rounded-lg border border-gray-200 hover:border-[#25D366] hover:bg-green-50 text-center transition-colors">
                  <p className="text-xs text-gray-500">{new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short" })}</p>
                  <p className="text-sm font-medium text-gray-800">{new Date(d + "T00:00:00").getDate()}</p>
                  <p className="text-xs text-gray-400">{new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { month: "short" })}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Step: time */}
      {step === "time" && (
        <>
          <button onClick={() => setStep("date")} className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="text-base font-semibold text-gray-700 mb-1">Choose a time</h2>
          <p className="text-xs text-gray-400 mb-3">{formatDate(selectedDate)}</p>
          {timesLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-4 border-[#25D366] border-t-transparent rounded-full" /></div>
          ) : timeSlots.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No available slots on this day. Try another date.</p>
              <button onClick={() => setStep("date")} className="text-[#25D366] text-sm font-medium">← Choose another date</button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {timeSlots.map(t => (
                <button key={t} onClick={() => { setSelectedTime(t); setStep("details"); }}
                  className="py-2 rounded-lg border border-gray-200 hover:border-[#25D366] hover:bg-green-50 text-sm font-medium text-gray-700 transition-colors">
                  {t}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Step: details */}
      {step === "details" && (
        <>
          <button onClick={() => setStep("time")} className="flex items-center gap-1 text-sm text-gray-500 mb-3">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="text-base font-semibold text-gray-700 mb-3">Your details</h2>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

          <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1 text-gray-600">
            <div className="flex gap-2"><FileText className="w-4 h-4 text-gray-400 mt-0.5" /><span>{selectedService?.name}</span></div>
            <div className="flex gap-2"><Calendar className="w-4 h-4 text-gray-400 mt-0.5" /><span>{formatDate(selectedDate)}</span></div>
            <div className="flex gap-2"><Clock className="w-4 h-4 text-gray-400 mt-0.5" /><span>{selectedTime}</span></div>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                placeholder="Full name *" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]"
                placeholder="WhatsApp number *" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366] resize-none"
              rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

            {config.depositRequired && Number(config.depositAmount) > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                💳 A deposit of <strong>R{Number(config.depositAmount).toFixed(2)}</strong> is required to confirm your booking.
              </div>
            )}

            <button
              disabled={!name.trim() || !phone.trim() || submitMutation.isPending}
              onClick={() => {
                setError("");
                submitMutation.mutate({ slug: slug!, serviceId: serviceId!, date: selectedDate, time: selectedTime, name: name.trim(), phone: phone.trim(), notes: notes.trim() || undefined });
              }}
              className="w-full py-3 bg-[#25D366] text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-[#22c55e] transition-colors"
            >
              {submitMutation.isPending ? "Booking…" : "Confirm Booking"}
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────

function PageShell({ config, children }: {
  config: { businessName: string; bookingPageTitle: string | null; bookingPageDescription?: string | null };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-gray-50 flex items-start justify-center py-8 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
        {/* Header */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold text-sm shrink-0">
            {config.businessName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight text-sm">{config.businessName}</h1>
            <p className="text-xs text-gray-500">{config.bookingPageTitle ?? "Book an Appointment"}</p>
          </div>
        </div>
        {config.bookingPageDescription && (
          <p className="text-xs text-gray-500 mb-4 -mt-2">{config.bookingPageDescription}</p>
        )}
        {children}
      </div>
    </div>
  );
}
