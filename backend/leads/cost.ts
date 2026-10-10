import type { Settings } from "@/backend/config/defaults";

export function callCost(
  s: Settings["costs"], durationSec: number | null, tokensIn: number, tokensOut: number,
) {
  const rate = Number(process.env.VAANI_RATE_INR_PER_MIN ?? s.voice_rate_inr_per_min);
  const voice = ((durationSec ?? 0) / 60) * rate;
  const ai = ((tokensIn * s.gemini_in_usd_per_mtok + tokensOut * s.gemini_out_usd_per_mtok) / 1_000_000) * s.usd_inr;
  return { voice: round(voice, 2), ai: round(ai, 4), total: round(voice + ai, 2) };
}
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
