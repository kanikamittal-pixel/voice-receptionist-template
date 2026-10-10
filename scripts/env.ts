import fs from "node:fs";
for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) { (process as any).loadEnvFile(f); break; }
