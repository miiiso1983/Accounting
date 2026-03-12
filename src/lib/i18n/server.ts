import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "./index";

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get("locale")?.value;
  return normalizeLocale(raw);
}
