import { prisma } from "../db";

// Feature toggles the Super Admin can flip without a code change. Cached in
// memory for a few seconds to avoid a DB round-trip on every request while
// still picking up changes quickly after a toggle.
const DEFAULTS: Record<string, string> = {
  stockLedgerEnabled: "false",
};

let cache: { at: number; values: Record<string, string> } | null = null;
const CACHE_TTL_MS = 5000;

async function loadAll(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.values;
  const rows = await prisma.appSetting.findMany();
  const values = { ...DEFAULTS };
  for (const row of rows) values[row.key] = row.value;
  cache = { at: Date.now(), values };
  return values;
}

export async function getSetting(key: string): Promise<string> {
  const values = await loadAll();
  return values[key] ?? "";
}

export async function getBoolSetting(key: string): Promise<boolean> {
  return (await getSetting(key)) === "true";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  cache = null;
}

export async function isStockLedgerEnabled(): Promise<boolean> {
  return getBoolSetting("stockLedgerEnabled");
}
