import "server-only";
import postgres from "postgres";

let sql: postgres.Sql | null = null;

/** Conexión de solo lectura al catálogo (DATABASE_URL). null si no está configurada. */
export function getSql(): postgres.Sql | null {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  sql = postgres(url, {
    max: 5,
    idle_timeout: 30,
    prepare: false, // compatible con el pooler de Supabase en modo transacción
    connection: { application_name: "comparacompra-web" },
  });
  return sql;
}
