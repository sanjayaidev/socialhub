// lib/db.js - Turso database client for Edge runtime
import { createClient } from '@libsql/client';

export function getTursoClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error('Missing TURSO_DATABASE_URL environment variable');
  }

  return createClient({
    url: url,
    authToken: authToken,
  });
}

export async function query(sql, params = []) {
  const client = getTursoClient();
  try {
    const result = await client.execute({ sql, args: params });
    return result;
  } finally {
    client.close();
  }
}
