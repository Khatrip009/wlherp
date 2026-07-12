// src/components/ConfirmDialog.jsx
export default function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmText = "Delete",           // default for delete actions
  cancelText = "Cancel",
  variant = "danger",               // "danger" (red) or "primary" (blue)
}) {
  const confirmButtonClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-primary hover:bg-primary-light text-white";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <p className="text-sm font-montserrat text-secondary-dark mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="border border-secondary-light px-4 py-2 rounded-lg text-sm hover:bg-secondary-bg transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`${confirmButtonClass} px-4 py-2 rounded-lg text-sm transition`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}