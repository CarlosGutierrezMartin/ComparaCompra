import type { Metadata } from "next";
import Link from "next/link";
import { Pending, Prose } from "@/components/legal/Prose";

export const metadata: Metadata = { title: "Aviso legal" };

export default function AvisoLegal() {
  return (
    <Prose title="Aviso legal" updated="21/10/2026">
      <h2>Titular</h2>
      <p>
        En cumplimiento del artículo 10 de la{" "}
        <a
          href="https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico
          (LSSI-CE)
        </a>
        :
      </p>
      <ul>
        <li>
          Titular: <Pending>nombre o razón social del titular</Pending>
        </li>
        <li>
          NIF: <Pending>NIF del titular</Pending>
        </li>
        <li>
          Domicilio: <Pending>domicilio del titular</Pending>
        </li>
        <li>
          Contacto: <Pending>correo electrónico de contacto</Pending>
        </li>
      </ul>

      <h2>Qué es ComparaCompra</h2>
      <p>
        ComparaCompra es una herramienta gratuita para comparar el precio de la cesta de la compra
        entre supermercados, crear platos y planificar el menú semanal. No vende productos ni tiene
        relación comercial con las cadenas cuyos precios muestra.
      </p>

      <h2>Precios y marcas</h2>
      <ul>
        <li>
          Los precios son los publicados en las webs de cada cadena en la fecha que se indica junto
          a cada uno. Pueden haber cambiado y pueden ser distintos en la tienda física. Manda
          siempre el precio de la tienda. Cómo se obtienen se explica en{" "}
          <Link href="/metodologia">Cómo calculamos los precios</Link>.
        </li>
        <li>
          Solo se muestran datos factuales de cada producto (nombre, formato, precio, precio por
          unidad y categoría) y un enlace a su ficha en la web de la cadena. No se reproducen
          descripciones ni fotos de las cadenas.
        </li>
        <li>
          Las marcas y nombres comerciales pertenecen a sus titulares y se citan solo para
          identificar los productos.
        </li>
        <li>
          Los datos nutricionales, cuando los hay, proceden de{" "}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
            Open Food Facts
          </a>
          , bajo la licencia{" "}
          <a
            href="https://opendatacommons.org/licenses/odbl/1-0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Database License (ODbL)
          </a>
          .
        </li>
      </ul>

      <h2>Recetas</h2>
      <p>
        De una receta importada desde un enlace solo se guardan los ingredientes, las cantidades y
        el enlace a la fuente; los pasos y las fotos son de su autor y no se copian. Los platos del
        recetario base se han escrito para esta aplicación.
      </p>

      <h2>Responsabilidad</h2>
      <p>
        La información se ofrece como orientación. Las alergias y dietas se comprueban con una
        clasificación de ingredientes que puede no recoger todas las trazas o variaciones de cada
        producto: revisa siempre el etiquetado antes de comprar o consumir.
      </p>

      <h2>Más información</h2>
      <p>
        <Link href="/legal/privacidad">Política de privacidad</Link> ·{" "}
        <Link href="/legal/cookies">Política de cookies</Link>
      </p>
    </Prose>
  );
}
