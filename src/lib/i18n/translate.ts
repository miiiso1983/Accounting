import type { Messages } from "./messages";

export function createTranslator(messages: Messages) {
  return (key: string, vars?: Record<string, string | number>): string => {
    const parts = key.split(".");
    let cur: unknown = messages;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return key;
      cur = (cur as Record<string, unknown>)[p];
    }
    if (typeof cur !== "string") return key;

    let out = cur;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{${k}}`, String(v));
      }
    }
    return out;
  };
}
