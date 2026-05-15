import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

type ToastType = "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback((message: string, type: ToastType) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), 3000);
  }, [remove]);

  const showSuccess = useCallback((message: string) => add(message, "success"), [add]);
  const showError = useCallback((message: string) => add(message, "error"), [add]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" ? (
              <CheckCircle size={16} style={{ color: "var(--success)" }} />
            ) : (
              <XCircle size={16} style={{ color: "var(--danger)" }} />
            )}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
