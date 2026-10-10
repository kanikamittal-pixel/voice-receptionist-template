import { q } from "@/backend/database/client";
import { DEFAULT_RULES, DEFAULT_SETTINGS, type Rules, type Settings } from "@/backend/config/defaults";

type Loaded = { rules: Rules; settings: Settings };
let cache: { at: number; value: Loaded } | null = null;

function merge<T extends object>(base: T, over: any): T {
  if (!over || typeof over !== "object") return base;
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    const b = (base as any)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && typeof over[k] === "object" && !Array.isArray(over[k])
      ? merge(b, over[k]) : over[k];
  }
  return out;
}

export async function loadConfig(): Promise<Loaded> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  let rows: { key: string; value: any }[] = [];
  try {
    rows = await q("select key, value from app_config where key in ('rules','settings')");
  } catch {
    // DB unreachable (e.g. in the test script): fall back to defaults
  }
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const value = { rules: merge(DEFAULT_RULES, get("rules")), settings: merge(DEFAULT_SETTINGS, get("settings")) };
  cache = { at: Date.now(), value };
  return value;
}

export function clearConfigCache() { cache = null; }

export async function getConfigValue<T = any>(key: string): Promise<T | null> {
  const r = await q("select value from app_config where key=$1", [key]);
  return r[0]?.value ?? null;
}

export async function setConfigValue(key: string, value: any) {
  await q(
    "insert into app_config(key,value) values($1,$2) on conflict (key) do update set value=excluded.value, updated_at=now()",
    [key, JSON.stringify(value)],
  );
  clearConfigCache();
}
