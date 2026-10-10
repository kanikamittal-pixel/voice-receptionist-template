// Add or update a designer and print their personal dashboard link.
//   npm run designer:add -- "Name" <telegram_user_id|0> [--link <cal.com booking link>] [--email <email>] [--cal-key <cal.com api key>]
// Telegram id 0 = a designer who only uses the dashboard.
import "./env";
import crypto from "node:crypto";
import { q } from "../backend/database/client";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] ?? null : null; };
const [name, tgIdRaw] = args;
if (!name || tgIdRaw === undefined) { console.error('usage: designer:add -- "Name" <telegram_user_id|0> [--link <url>] [--email <email>] [--cal-key <key>]'); process.exit(1); }

(async () => {
  const tg = Number(tgIdRaw) || null;
  const existing = tg ? await q("select id, dashboard_token from designers where telegram_user_id=$1", [tg]) : await q("select id, dashboard_token from designers where name=$1 and telegram_user_id is null", [name]);
  const token = existing[0]?.dashboard_token ?? crypto.randomBytes(18).toString("base64url");
  const vals = [name, tg, token, flag("link"), flag("email"), flag("cal-key")];
  if (existing[0]) await q("update designers set name=$1, telegram_user_id=$2, dashboard_token=$3, booking_link=coalesce($4,booking_link), email=coalesce($5,email), cal_api_key=coalesce($6,cal_api_key) where id=$7", [...vals, existing[0].id]);
  else await q("insert into designers(name, telegram_user_id, dashboard_token, booking_link, email, cal_api_key) values($1,$2,$3,$4,$5,$6)", vals);
  console.log(`${name} saved. Dashboard link:\n  ${process.env.APP_URL ?? "http://localhost:3000"}/designer?t=${token}`);
})().catch((e) => { console.error(e); process.exit(1); });
