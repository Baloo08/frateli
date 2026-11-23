import { cookies } from "next/headers";
import esMessages from "../../messages/es.json";
import enMessages from "../../messages/en.json";

export type Locale = "es" | "en";
export type Messages = typeof esMessages;

export async function getLocale(userPreferred?: "es" | "en" | null): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("frateli_locale")?.value;
  if (cookieLocale === "en" || cookieLocale === "es") {
    return cookieLocale;
  }
  return userPreferred === "en" ? "en" : "es";
}

export function getMessages(locale: Locale): Messages {
  return locale === "en" ? enMessages : esMessages;
}
