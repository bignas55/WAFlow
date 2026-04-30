import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useEffect, useState } from "react";

export type ConfirmType = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: ConfirmType;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Confirmation dialog for destructive actions (delete, cancel, disable, etc.)
 * Prevents accidental data loss with clear warnings and disabled state during submission
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  type = "warning",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);

  useEffect(() => {
    setInternalLoading(false);
  }, [isOpen]);

  const loading = isLoading || internalLoading;

  const handleConfirm = async () => {
    setInternalLoading(true);
    try {
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  if (!isOpen) return null;

  const iconConfig = {
    danger: { Icon: AlertTriangle, bgColor: "bg-red-500/10", iconColor: "text-red-400" },
    warning: { Icon: AlertTriangle, bgColor: "bg-yellow-500/10", iconColor: "text-yellow-400" },
    info: { Icon: Info, bgColor: "bg-blue-500/10", iconColor: "text-blue-400" },
  };

  const config = iconConfig[type];
  const { Icon, bgColor, iconColor } = config;

  const confirmButtonColor = type === "danger" ? "bg-red-600 hover:bg-red-500" : "bg-indigo-600 hover:bg-indigo-500";

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 max-w-sm w-full shadow-xl animate-in fade-in scale-in duration-200">
          {/* Header with icon */}
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-12 h-12 rounded-full ${bgColor} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-white">{title}</h2>
              </div>
            </div>

            <p className="text-sm text-gray-400">{message}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 p-6 border-t border-gray-800">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 font-medium rounded-lg transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2 ${confirmButtonColor} disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
