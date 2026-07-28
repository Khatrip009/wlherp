// src/components/ConfirmDialog.jsx
import { useTheme } from "../context/ThemeContext";

export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
}) {
  const theme = useTheme();
  const bodyFont = theme?.font_body || "Montserrat";

  const confirmButtonClass =
    variant === "danger"
      ? "bg-accent hover:bg-accent-dark text-white"
      : "bg-primary hover:bg-primary-light text-white";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <p
          className="text-sm text-primary-dark mb-6"
          style={{ fontFamily: bodyFont }}
        >
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="border border-primary-bg px-4 py-2 rounded-lg text-sm text-primary-dark hover:bg-primary-bg transition"
            style={{ fontFamily: bodyFont }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`${confirmButtonClass} px-4 py-2 rounded-lg text-sm transition`}
            style={{ fontFamily: bodyFont }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}