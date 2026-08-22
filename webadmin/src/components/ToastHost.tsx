import { useSyncExternalStore } from "react";
import Icon from "./Icon";
import { toastStore } from "../lib/toast";

/** Global toast notifications host; mount once near the app root. */
export default function ToastHost() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);

  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className={t.leaving ? "toast out" : "toast"}>
          <Icon
            name={t.type === "danger" ? "alert-circle" : t.type === "warning" ? "alert-triangle" : "check-circle"}
            className="w-4 h-4 shrink-0"
          />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
