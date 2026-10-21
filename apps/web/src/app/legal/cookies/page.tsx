import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/legal/Prose";

export const metadata: Metadata = { title: "Cookies" };

export default function Cookies() {
  return (
    <Prose title="Política de cookies" updated="21/10/2026">
      <p>
        ComparaCompra no usa cookies de análisis, publicidad ni seguimiento, ni propias ni de
        terceros. Por eso no muestra un aviso de consentimiento.
      </p>
      <h2>Qué guarda la aplicación en tu dispositivo</h2>
      <table>
        <thead>
          <tr>
            <th>Almacenamiento</th>
            <th>Para qué</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>IndexedDB (base de datos del navegador)</td>
            <td>
              Tu hogar, listas, platos, menús, despensa y modo tienda, para que la app funcione sin
              conexión
            </td>
            <td>Hasta que lo borres o desinstales la app</td>
          </tr>
          <tr>
            <td>Caché del service worker</td>
            <td>
              Las pantallas de la app y los últimos precios consultados, para abrirla sin conexión
            </td>
            <td>Hasta la siguiente versión de la app; los precios, hasta 7 días</td>
          </tr>
          <tr>
            <td>Almacenamiento local (localStorage), solo si inicias sesión</td>
            <td>Mantener la sesión iniciada</td>
            <td>Hasta que cierres la sesión</td>
          </tr>
        </tbody>
      </table>
      <p>
        Son almacenamientos técnicos necesarios para prestar el servicio que pides, exentos de
        consentimiento según el artículo 22.2 de la{" "}
        <a
          href="https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758"
          target="_blank"
          rel="noopener noreferrer"
        >
          LSSI-CE
        </a>{" "}
        y la{" "}
        <a
          href="https://www.aepd.es/guias/guia-cookies.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          Guía sobre el uso de las cookies de la AEPD
        </a>
        . Puedes borrarlos desde la configuración de tu navegador; perderás los datos que no estén
        sincronizados con una cuenta.
      </p>
      <p>
        <Link href="/legal/aviso-legal">Aviso legal</Link> ·{" "}
        <Link href="/legal/privacidad">Política de privacidad</Link>
      </p>
    </Prose>
  );
}
