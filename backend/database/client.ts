import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    client = neon(process.env.DATABASE_URL);
  }
  return (await client.query(text, params)) as T[];
}
