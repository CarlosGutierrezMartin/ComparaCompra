import { t } from "@/i18n/es";

export const metadata = { title: "Sin conexión" };

export default function Offline() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="mt-3">{t.offline.page}</p>
    </main>
  );
}
