import type { Metadata } from "next";
import Link from "next/link";
import { Prose } from "@/components/legal/Prose";

export const metadata: Metadata = { title: "Cómo calculamos los precios" };

export default function Metodologia() {
  return (
    <Prose title="Cómo calculamos los precios" updated="21/10/2026">
      <h2>De dónde salen los precios</h2>
      <table>
        <thead>
          <tr>
            <th>Cadena</th>
            <th>Fuente</th>
            <th>Zona</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Mercadona</td>
            <td>Su tienda online</td>
            <td>El almacén que la propia web asigna a tu código postal</td>
          </tr>
          <tr>
            <td>Dia</td>
            <td>Páginas de categoría de su web</td>
            <td>Precio online general (la web no pide código postal)</td>
          </tr>
          <tr>
            <td>Alcampo</td>
            <td>Páginas de categoría de su tienda online</td>
            <td>Precio online general (la web no pide código postal)</td>
          </tr>
          <tr>
            <td>Carrefour</td>
            <td>
              Sin precios: su web bloquea las consultas automáticas y no intentamos saltarnos ese
              bloqueo
            </td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>De momento solo hay precios para Madrid capital (códigos postales 28001 a 28055).</li>
        <li>
          Cada precio se muestra con su fecha. Son precios online: en la tienda física pueden ser
          distintos. Si ves otro precio en la tienda, puedes anotarlo en el modo tienda.
        </li>
        <li>
          Las consultas se hacen sin iniciar sesión, identificándonos, con un máximo de peticiones
          por minuto por cadena y guardando en caché lo ya descargado. Solo se guardan datos
          factuales: nombre, formato, precio, precio por unidad, categoría y enlace a la ficha.
        </li>
        <li>
          Si una captura trae muchos menos productos que la anterior, no se publica hasta revisarla.
        </li>
      </ul>

      <h2>Precio por kilo, litro o unidad</h2>
      <p>
        Se usa el precio por unidad de medida que publica la propia cadena, obligatorio según el{" "}
        <a
          href="https://www.boe.es/buscar/act.php?id=BOE-A-2000-24118"
          target="_blank"
          rel="noopener noreferrer"
        >
          Real Decreto 3423/2000
        </a>
        . Si no lo publica, se calcula a partir del formato. El formato que leemos del nombre se
        contrasta con ese precio por unidad para detectar errores.
      </p>

      <h2>Qué productos se comparan</h2>
      <ul>
        <li>
          <strong>Idéntico:</strong> la misma marca y el mismo formato. Las marcas blancas de
          cadenas distintas nunca se consideran idénticas.
        </li>
        <li>
          <strong>Equivalente:</strong> el mismo producto de cualquier marca: misma variedad (por
          ejemplo, leche semidesnatada) y mismas características (sin lactosa, ecológico…). No se
          mezclan productos con diferencias relevantes, como leche de vaca y de cabra.
        </li>
        <li>
          <strong>Genérico:</strong> cualquier variedad del producto.
        </li>
      </ul>
      <p>
        El emparejamiento se hace con reglas y, para los casos dudosos, con inteligencia artificial
        y revisión manual. En un conjunto de prueba de 500 parejas de productos reales, los enlaces
        que se crean aciertan en el 100 % de los idénticos, el 97,6 % de los equivalentes y el 99,4
        % de los genéricos. Ese conjunto lo etiquetó un modelo de IA y está pendiente de revisión
        por una persona. Si ves una equivalencia incorrecta, puedes avisar desde el resultado.
      </p>

      <h2>Cómo se calcula el total</h2>
      <ul>
        <li>
          Se compran envases enteros: si pides 1,5 kg y el producto viene en bolsas de 1 kg, se
          cuentan dos bolsas.
        </li>
        <li>
          Se aplican las promociones que se entienden sin ambigüedad (3x2, segunda unidad al 50 %…).
          Las bajadas de precio ya vienen en el precio.
        </li>
        <li>
          Si no indicas cantidad, se compara la cantidad habitual de ese producto (la mediana de los
          formatos disponibles) y se dice.
        </li>
        <li>
          Lo que no tiene precio se muestra como no disponible; nunca se rellena con una estimación.
        </li>
      </ul>

      <h2>Platos y menú</h2>
      <ul>
        <li>
          El coste por ración usa la cantidad que lleva el plato; el coste de compra, los envases
          completos que hay que comprar. Un ingrediente sin cantidad o sin precio se indica y no se
          suma.
        </li>
        <li>
          El menú se calcula con un modelo de optimización que elige los platos y los envases que
          hay que comprar. En el modo aprovechamiento, además del precio, cuentan lo que sobraría
          (valorado a su precio) y el número de productos distintos.
        </li>
        <li>
          Los datos nutricionales vienen de{" "}
          <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
            Open Food Facts
          </a>{" "}
          (licencia ODbL) y solo se muestran si todos los productos del plato los tienen.
        </li>
      </ul>
      <p>
        <Link href="/legal/aviso-legal">Aviso legal</Link>
      </p>
    </Prose>
  );
}
