import { Link } from "react-router-dom";
import { MessageSquare, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#080817] flex flex-col items-center justify-center px-4 text-center">
      {/* Logo */}
      <div className="w-14 h-14 bg-[#25D366] rounded-2xl flex items-center justify-center shadow-2xl shadow-green-500/20 mb-8">
        <MessageSquare className="w-7 h-7 text-white" />
      </div>

      {/* 404 */}
      <h1 className="text-[120px] font-black text-white leading-none tracking-tight mb-0 select-none">
        4
        <span className="text-[#25D366]">0</span>
        4
      </h1>

      <h2 className="text-2xl font-bold text-white mt-2 mb-3">Page Not Found</h2>
      <p className="text-gray-400 max-w-sm mb-10">
        The page you're looking for doesn't exist, or it may have moved.
        Let's get you back on track.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => window.history.back()}
          className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-semibold px-6 py-2.5 rounded-xl text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
        <Link
          to="/"
          className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb855] text-black font-semibold px-6 py-2.5 rounded-xl text-sm transition"
        >
          <Home className="w-4 h-4" /> Back to Home
        </Link>
      </div>
    </div>
  );
}
