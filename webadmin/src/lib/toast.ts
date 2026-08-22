export type ToastType = "success" | "warning" | "danger";

export interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  leaving: boolean;
}

type Listener = (items: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

/** Show a toast notification, auto-dismissed after ~2.8s with fade-out. */
function toast(msg: string, type: ToastType = "success") {
  const id = nextId++;
  toasts = [...toasts, { id, msg, type, leaving: false }];
  emit();
  setTimeout(() => {
    toasts = toasts.map(t => (t.id === id ? { ...t, leaving: true } : t));
    emit();
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
      emit();
    }, 220);
  }, 2600);
}

export const toastStore = { subscribe, getSnapshot, toast };
export { toast };
