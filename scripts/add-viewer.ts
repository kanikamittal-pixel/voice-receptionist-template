// Creates (or reuses) a VIEW-ONLY dashboard link, e.g. for an instructor: it can see everything but cannot take, pass or edit.
//   npm run viewer:add -- "Instructor"
import "./env";
import crypto from "node:crypto";
import { q } from "../backend/database/client";

const name = process.argv[2] ?? "Instructor (view only)";
(async () => {
  const ex = await q("select dashboard_token from designers where name=$1 and read_only", [name]);
  const token = ex[0]?.dashboard_token ?? crypto.randomBytes(18).toString("base64url");
  if (!ex[0]) await q("insert into designers(name, dashboard_token, read_only, active) values($1,$2,true,true)", [name, token]);
  console.log(`${name}: ${process.env.APP_URL}/designer?t=${token}`);
})().catch((e) => { console.error(e); process.exit(1); });
