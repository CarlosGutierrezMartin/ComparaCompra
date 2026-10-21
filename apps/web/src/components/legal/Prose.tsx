import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/ui";

/** Páginas de texto (legales y metodología). */
export function Prose({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} />
      <Page>
        <article className="flex flex-col gap-3 leading-relaxed [&_a]:text-brand [&_a]:underline [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:text-left">
          <p className="text-sm text-muted">Última actualización: {updated}</p>
          {children}
        </article>
      </Page>
    </>
  );
}

/** Dato que debe completar el titular antes de publicar: se muestra como pendiente, no se inventa. */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-warning-bg px-1 text-warning-fg">[Pendiente: {children}]</mark>
  );
}
