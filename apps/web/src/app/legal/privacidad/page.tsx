import type { Metadata } from "next";
import Link from "next/link";
import { Pending, Prose } from "@/components/legal/Prose";

export const metadata: Metadata = { title: "Privacidad" };

export default function Privacidad() {
  return (
    <Prose title="Política de privacidad" updated="21/10/2026">
      <p>
        Esta política explica qué datos personales trata ComparaCompra, para qué y con qué derechos,
        conforme al{" "}
        <a
          href="https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32016R0679"
          target="_blank"
          rel="noopener noreferrer"
        >
          Reglamento (UE) 2016/679 (RGPD)
        </a>{" "}
        y a la{" "}
        <a
          href="https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales
        </a>
        .
      </p>

      <h2>Responsable</h2>
      <p>
        <Pending>
          nombre o razón social, NIF, domicilio y correo de contacto del responsable
        </Pending>
      </p>

      <h2>Sin cuenta: todo se queda en tu móvil</h2>
      <p>
        Si no inicias sesión, tu hogar, listas, platos, menús, despensa y compras se guardan solo en
        el almacenamiento de tu navegador (IndexedDB) y no se envían a ningún servidor. Para
        comparar precios se envían el código postal y los productos de la lista, sin ningún dato que
        te identifique.
      </p>

      <h2>Con cuenta</h2>
      <table>
        <thead>
          <tr>
            <th>Dato</th>
            <th>Para qué</th>
            <th>Base legal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Correo electrónico</td>
            <td>Enviarte el enlace de acceso e identificar tu cuenta</td>
            <td>Ejecución del servicio que pides (art. 6.1.b RGPD)</td>
          </tr>
          <tr>
            <td>Código postal, personas del hogar, presupuesto y cadenas elegidas</td>
            <td>Mostrar los precios de tu zona y calcular el menú</td>
            <td>Ejecución del servicio (art. 6.1.b RGPD)</td>
          </tr>
          <tr>
            <td>Listas, platos, menús, despensa y precios que anotas en la tienda</td>
            <td>Guardarlos y sincronizarlos entre tus dispositivos</td>
            <td>Ejecución del servicio (art. 6.1.b RGPD)</td>
          </tr>
          <tr>
            <td>Dietas y alergias</td>
            <td>Proponer platos y menús que las respeten en todos tus dispositivos</td>
            <td>
              Consentimiento explícito (art. 9.2.a RGPD): solo se guardan en tu cuenta si marcas la
              casilla correspondiente en tu perfil, y puedes retirarlo desmarcándola
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        No pedimos tu ubicación exacta, no guardamos números de tarjeta ni de programas de
        fidelización y no usamos tus datos para publicidad ni los vendemos.
      </p>

      <h2>Funciones con inteligencia artificial</h2>
      <p>
        Si usas la interpretación de listas, la extracción de recetas desde texto, enlace o foto, o
        la propuesta de platos, el texto o la imagen que envías se procesa con la API de Claude, de
        Anthropic, que actúa como encargado del tratamiento. Las fotos de recetas no se guardan: se
        procesan para leer los ingredientes y se descartan.
      </p>

      <h2>Encargados del tratamiento y transferencias</h2>
      <ul>
        <li>
          Alojamiento de la aplicación y de la base de datos:{" "}
          <Pending>proveedores, ubicación de los servidores y garantías</Pending>
        </li>
        <li>
          Anthropic (API de Claude), solo para las funciones con inteligencia artificial:{" "}
          <Pending>garantías de la transferencia internacional, si la hay</Pending>
        </li>
      </ul>

      <h2>Conservación</h2>
      <p>
        Los datos de tu cuenta se conservan mientras la mantengas. Si la borras, se eliminan, salvo
        lo que la ley obligue a conservar. Los precios que anotas en la tienda se guardan asociados
        a tu hogar para mejorar los precios publicados.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes pedir el acceso, la rectificación, la supresión, la oposición, la limitación del
        tratamiento y la portabilidad de tus datos escribiendo a{" "}
        <Pending>correo de contacto</Pending>. Si crees que no se han respetado, puedes reclamar
        ante la{" "}
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
          Agencia Española de Protección de Datos
        </a>
        .
      </p>
      <p>
        <Link href="/legal/aviso-legal">Aviso legal</Link> ·{" "}
        <Link href="/legal/cookies">Política de cookies</Link>
      </p>
    </Prose>
  );
}
