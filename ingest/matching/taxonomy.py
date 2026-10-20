"""Taxonomía canónica de productos (docs/SPEC.md: "taxonomía canónica de 300 a 500 hojas").

Estructura: sección (pasillo del supermercado) > subsección > hoja. Cada hoja puede tener:
- variants: valores que definen la equivalencia dentro de la hoja ("entera", "semidesnatada");
  dos productos son equivalentes si comparten hoja, variante y marcas (flags).
- unit: unidad base en que se compra y se cocina (g, ml o unit).
- allergens: alérgenos de declaración obligatoria (Reglamento UE 1169/2011, anexo II) que la
  hoja contiene siempre. Si un producto concreto los evita, lo dice su marca sin_gluten, etc.
- not_for: dietas con las que la hoja es incompatible (vegetariana, vegana).

Las secciones heredan alérgenos y dietas a sus hojas salvo que la hoja los redefina.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Marcas que separan productos equivalentes dentro de una misma hoja y variante.
FLAGS = ("sin_lactosa", "sin_gluten", "ecologico", "congelado", "sin_azucar", "integral")

ALLERGENS = (
    "gluten",
    "crustaceos",
    "huevo",
    "pescado",
    "cacahuete",
    "soja",
    "lacteos",
    "frutos_de_cascara",
    "apio",
    "mostaza",
    "sesamo",
    "sulfitos",
    "altramuces",
    "moluscos",
)
DIETS = ("vegetariana", "vegana", "sin_gluten", "sin_lactosa")

MEAT = ("vegetariana", "vegana")
ANIMAL = ("vegana",)


@dataclass(frozen=True)
class Leaf:
    slug: str
    name: str
    section: str
    subsection: str
    unit: str = "g"
    variants: tuple[str, ...] = ()
    allergens: tuple[str, ...] = ()
    not_for: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()


@dataclass
class _Sub:
    name: str
    leaves: list[tuple] = field(default_factory=list)


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


# Cada hoja: (nombre, opciones). Opciones: u=unidad, v=variantes, a=alérgenos,
# n=dietas incompatibles, al=alias (nombres con los que la gente la escribe).
# Cada sección: (nombre, alérgenos heredados, dietas heredadas, {subsección: [hojas]}).
SECTIONS: list[tuple[str, tuple[str, ...], tuple[str, ...], dict[str, list[tuple]]]] = [
    (
        "Fruta",
        (),
        (),
        {
            "Fruta fresca": [
                (
                    "Plátano",
                    {"v": ("de canarias", "banana", "macho"), "al": ("plátanos", "banana")},
                ),
                (
                    "Manzana",
                    {"v": ("golden", "royal gala", "fuji", "granny smith", "reineta", "pink lady")},
                ),
                ("Pera", {"v": ("conferencia", "ercolini", "blanquilla", "limonera")}),
                ("Naranja", {"v": ("de mesa", "de zumo")}),
                ("Mandarina", {}),
                ("Limón", {}),
                ("Lima", {}),
                ("Uva", {"v": ("blanca", "negra")}),
                ("Fresa", {"al": ("fresones",)}),
                ("Arándanos", {}),
                ("Frambuesas", {}),
                ("Melón", {}),
                ("Sandía", {}),
                ("Kiwi", {}),
                ("Piña", {}),
                ("Mango", {}),
                ("Papaya", {}),
                ("Melocotón", {}),
                ("Nectarina", {}),
                ("Paraguayo", {}),
                ("Ciruela", {}),
                ("Cereza", {}),
                ("Albaricoque", {}),
                ("Granada", {}),
                ("Caqui", {}),
                ("Aguacate", {}),
                ("Chirimoya", {}),
                ("Higo", {}),
            ],
        },
    ),
    (
        "Verdura",
        (),
        (),
        {
            "Hortalizas": [
                ("Tomate", {"v": ("ensalada", "pera", "rama", "raf", "cherry", "canario")}),
                (
                    "Pimiento",
                    {"v": ("rojo", "verde", "amarillo", "italiano", "padrón", "tricolor")},
                ),
                ("Pepino", {}),
                ("Calabacín", {}),
                ("Berenjena", {}),
                ("Calabaza", {}),
                ("Cebolla", {"v": ("blanca", "morada", "dulce")}),
                ("Cebolleta", {}),
                ("Puerro", {}),
                ("Ajo", {"al": ("ajos", "cabeza de ajo")}),
                ("Patata", {}),
                ("Boniato", {}),
                ("Zanahoria", {}),
                ("Apio", {"a": ("apio",)}),
                ("Rábano", {}),
                ("Remolacha", {}),
                ("Jengibre", {}),
                ("Maíz en mazorca", {}),
            ],
            "Hoja verde": [
                (
                    "Lechuga",
                    {
                        "v": (
                            "iceberg",
                            "romana",
                            "batavia",
                            "trocadero",
                            "cogollos",
                            "hoja de roble",
                        )
                    },
                ),
                ("Ensalada en bolsa", {"v": ("canónigos", "rúcula", "brotes tiernos", "mezcla")}),
                ("Espinacas", {"v": ("baby",)}),
                ("Acelgas", {}),
                ("Col", {"v": ("repollo", "lombarda", "kale", "coles de bruselas")}),
            ],
            "Otras verduras": [
                ("Brócoli", {}),
                ("Coliflor", {}),
                ("Judías verdes", {}),
                ("Alcachofa", {}),
                ("Espárragos verdes", {}),
                ("Champiñones", {}),
                ("Setas", {"v": ("ostra", "shiitake", "variadas")}),
                (
                    "Hierbas aromáticas frescas",
                    {"v": ("perejil", "cilantro", "albahaca", "hierbabuena", "eneldo")},
                ),
                ("Guisantes frescos", {}),
                ("Habas", {}),
            ],
        },
    ),
    (
        "Carne",
        (),
        MEAT,
        {
            "Pollo y pavo": [
                ("Pechuga de pollo", {"v": ("entera", "fileteada", "en tacos", "picada")}),
                ("Muslos y contramuslos de pollo", {}),
                ("Alitas de pollo", {}),
                ("Pollo entero", {}),
                ("Pollo troceado", {}),
                ("Pavo", {"v": ("filetes", "muslo", "picado")}),
            ],
            "Vacuno": [
                ("Filetes de ternera", {}),
                ("Carne de ternera para guisar", {}),
                ("Entrecot y chuletón", {}),
                ("Solomillo de ternera", {}),
            ],
            "Cerdo": [
                ("Lomo de cerdo", {"v": ("cinta", "filetes", "chuletas")}),
                ("Costillas de cerdo", {}),
                ("Solomillo de cerdo", {}),
                ("Secreto, presa y pluma", {}),
                ("Panceta", {}),
                ("Chuletas de cerdo", {}),
            ],
            "Otras carnes": [
                ("Cordero", {}),
                ("Conejo", {}),
            ],
            "Picadas y elaboradas": [
                ("Carne picada", {"v": ("vacuno", "cerdo", "mixta", "pollo", "pavo")}),
                ("Hamburguesas", {"v": ("vacuno", "cerdo", "mixta", "pollo", "pavo")}),
                ("Albóndigas", {"v": ("vacuno", "cerdo", "mixta", "pollo", "pavo")}),
                ("Salchichas frescas", {}),
                ("Chorizo fresco", {}),
                ("Morcilla", {}),
                ("Empanados de pollo", {"a": ("gluten",), "al": ("nuggets", "san jacobos")}),
            ],
        },
    ),
    (
        "Pescado y marisco",
        ("pescado",),
        MEAT,
        {
            "Pescado": [
                ("Merluza", {}),
                ("Bacalao", {"v": ("fresco", "desalado", "salado")}),
                ("Salmón", {}),
                ("Dorada", {}),
                ("Lubina", {}),
                ("Sardinas", {}),
                ("Boquerones", {}),
                ("Atún fresco", {}),
                ("Bonito fresco", {}),
                ("Rape", {}),
                ("Lenguado", {}),
                ("Gallo", {}),
                ("Emperador", {}),
                ("Panga", {}),
                ("Abadejo", {}),
                ("Salmón ahumado", {}),
                ("Palitos de surimi", {"a": ("pescado", "huevo", "gluten")}),
                ("Gulas", {}),
            ],
            "Marisco": [
                ("Gambas y langostinos", {"a": ("crustaceos",)}),
                ("Mejillones", {"a": ("moluscos",)}),
                ("Almejas", {"a": ("moluscos",)}),
                ("Calamar", {"a": ("moluscos",)}),
                ("Sepia", {"a": ("moluscos",)}),
                ("Pulpo", {"a": ("moluscos",)}),
                ("Anillas y rabas", {"a": ("moluscos", "gluten")}),
            ],
        },
    ),
    (
        "Charcutería",
        (),
        MEAT,
        {
            "Fiambres": [
                ("Jamón cocido", {}),
                ("Pechuga de pavo en lonchas", {}),
                ("Mortadela y chopped", {}),
                ("Bacon", {"al": ("bacón", "beicon")}),
                ("Salchichas cocidas", {"al": ("frankfurt",)}),
            ],
            "Curados": [
                ("Jamón serrano", {}),
                ("Jamón ibérico", {}),
                ("Chorizo", {}),
                ("Salchichón", {}),
                ("Lomo embuchado", {}),
                ("Fuet", {}),
                ("Sobrasada", {}),
                ("Paleta", {}),
            ],
            "Patés": [("Paté", {})],
        },
    ),
    (
        "Quesos",
        ("lacteos",),
        ANIMAL,
        {
            "Quesos": [
                ("Queso curado", {"v": ("vaca", "oveja", "cabra", "mezcla")}),
                ("Queso semicurado", {"v": ("vaca", "oveja", "cabra", "mezcla")}),
                ("Queso tierno", {}),
                ("Queso fresco", {"al": ("queso de burgos",)}),
                ("Mozzarella", {}),
                ("Queso en lonchas", {}),
                ("Queso rallado", {}),
                ("Queso untable", {"al": ("queso crema",)}),
                ("Queso azul", {}),
                ("Queso de cabra", {}),
                ("Parmesano y grana padano", {}),
                ("Queso en porciones", {}),
                ("Requesón y ricotta", {}),
                ("Queso feta", {}),
                ("Queso brie y camembert", {}),
                ("Queso emmental y gouda", {}),
            ],
        },
    ),
    (
        "Huevos y lácteos",
        (),
        (),
        {
            "Huevos": [
                ("Huevos", {"u": "unit", "v": ("M", "L", "XL"), "a": ("huevo",), "n": ANIMAL}),
                ("Claras de huevo", {"u": "ml", "a": ("huevo",), "n": ANIMAL}),
            ],
            "Leche": [
                (
                    "Leche",
                    {
                        "u": "ml",
                        "v": ("entera", "semidesnatada", "desnatada"),
                        "a": ("lacteos",),
                        "n": ANIMAL,
                    },
                ),
                (
                    "Leche enriquecida",
                    {
                        "u": "ml",
                        "v": ("calcio", "omega 3", "crecimiento"),
                        "a": ("lacteos",),
                        "n": ANIMAL,
                    },
                ),
                (
                    "Bebida vegetal",
                    {"u": "ml", "v": ("avena", "soja", "almendra", "arroz", "coco")},
                ),
                (
                    "Batido",
                    {
                        "u": "ml",
                        "v": ("chocolate", "vainilla", "fresa", "proteínas"),
                        "a": ("lacteos",),
                        "n": ANIMAL,
                    },
                ),
                ("Leche condensada", {"a": ("lacteos",), "n": ANIMAL}),
                ("Leche evaporada", {"a": ("lacteos",), "n": ANIMAL}),
                ("Horchata", {"u": "ml"}),
            ],
            "Nata y mantequilla": [
                ("Nata para cocinar", {"u": "ml", "a": ("lacteos",), "n": ANIMAL}),
                ("Nata para montar", {"u": "ml", "a": ("lacteos",), "n": ANIMAL}),
                ("Mantequilla", {"a": ("lacteos",), "n": ANIMAL}),
                ("Margarina", {}),
            ],
        },
    ),
    (
        "Yogures y postres",
        ("lacteos",),
        ANIMAL,
        {
            "Yogures": [
                ("Yogur natural", {}),
                ("Yogur de sabores", {}),
                ("Yogur griego", {}),
                ("Yogur desnatado", {}),
                ("Yogur líquido", {"u": "ml"}),
                ("Bífidus", {}),
                ("Kéfir", {}),
                ("Petit suisse", {}),
                ("Yogur proteico", {}),
            ],
            "Postres": [
                ("Postre vegetal", {"a": ("soja",), "n": ()}),
                ("Natillas", {"a": ("lacteos", "huevo")}),
                ("Flan", {"a": ("lacteos", "huevo")}),
                ("Arroz con leche", {}),
                ("Cuajada", {}),
                ("Gelatina", {"a": (), "n": MEAT}),
                ("Mousse", {}),
            ],
        },
    ),
    (
        "Panadería",
        ("gluten",),
        (),
        {
            "Pan": [
                (
                    "Pan de barra",
                    {"v": ("baguette", "chapata", "rústico", "integral", "hogaza", "cristal")},
                ),
                ("Pan de molde", {"v": ("blanco", "integral", "sin corteza", "multicereales")}),
                ("Pan de hamburguesa y perritos", {}),
                ("Pan tostado", {}),
                ("Picos y rosquilletas", {}),
                ("Tortillas de trigo", {"al": ("wraps", "fajitas")}),
                ("Pan rallado", {}),
            ],
            "Bollería y repostería": [
                ("Croissants", {"a": ("gluten", "lacteos", "huevo"), "n": ANIMAL}),
                ("Magdalenas", {"a": ("gluten", "huevo"), "n": ANIMAL}),
                ("Bizcocho", {"a": ("gluten", "huevo"), "n": ANIMAL}),
                ("Bollería envasada", {"a": ("gluten",)}),
                ("Harina de trigo", {"v": ("todo uso", "de fuerza", "repostería")}),
                ("Otras harinas", {"a": (), "v": ("maíz", "garbanzo", "arroz", "avena")}),
                ("Levadura", {"a": ()}),
                ("Masa de hojaldre y pizza", {}),
            ],
        },
    ),
    (
        "Arroz, pasta y legumbres",
        (),
        (),
        {
            "Arroz": [
                (
                    "Arroz",
                    {
                        "v": (
                            "redondo",
                            "largo",
                            "basmati",
                            "integral",
                            "vaporizado",
                            "bomba",
                            "jazmín",
                        )
                    },
                )
            ],
            "Pasta": [
                ("Macarrones", {"a": ("gluten",)}),
                ("Espaguetis", {"a": ("gluten",)}),
                ("Fideos", {"a": ("gluten",)}),
                ("Tallarines", {"a": ("gluten",)}),
                ("Hélices y otras pastas cortas", {"a": ("gluten",)}),
                ("Placas de lasaña", {"a": ("gluten",)}),
                ("Canelones", {"a": ("gluten",)}),
                ("Pasta rellena", {"a": ("gluten", "huevo")}),
                ("Pasta fresca", {"a": ("gluten", "huevo")}),
                ("Noodles", {"a": ("gluten",)}),
                ("Cuscús", {"a": ("gluten",)}),
                ("Quinoa", {}),
            ],
            "Legumbres": [
                ("Garbanzos secos", {}),
                ("Garbanzos cocidos", {}),
                ("Lentejas secas", {}),
                ("Lentejas cocidas", {}),
                ("Alubias secas", {"v": ("blancas", "pintas", "rojas")}),
                ("Alubias cocidas", {"v": ("blancas", "pintas", "rojas")}),
                ("Soja texturizada", {"a": ("soja",)}),
            ],
        },
    ),
    (
        "Aceite, salsas y especias",
        (),
        (),
        {
            "Aceite y vinagre": [
                (
                    "Aceite de oliva",
                    {"u": "ml", "v": ("virgen extra", "virgen", "suave", "intenso")},
                ),
                ("Aceite de girasol", {"u": "ml"}),
                ("Otros aceites", {"u": "ml", "v": ("coco", "sésamo", "orujo")}),
                (
                    "Vinagre",
                    {"u": "ml", "v": ("vino", "manzana", "módena", "jerez"), "a": ("sulfitos",)},
                ),
            ],
            "Sal y especias": [
                ("Sal", {"v": ("fina", "gruesa", "en escamas", "yodada")}),
                ("Pimienta", {"v": ("negra", "blanca", "molida", "en grano")}),
                (
                    "Especias",
                    {
                        "v": (
                            "pimentón dulce",
                            "pimentón picante",
                            "comino",
                            "orégano",
                            "canela",
                            "curry",
                            "cúrcuma",
                            "laurel",
                            "tomillo",
                            "romero",
                            "nuez moscada",
                            "ajo en polvo",
                            "perejil seco",
                            "azafrán",
                            "colorante",
                        )
                    },
                ),
            ],
            "Tomate y salsas": [
                ("Tomate frito", {}),
                ("Sofrito", {}),
                ("Tomate triturado", {}),
                ("Tomate natural entero", {}),
                ("Concentrado de tomate", {}),
                ("Mayonesa", {"a": ("huevo",), "n": ANIMAL}),
                ("Ketchup", {}),
                ("Mostaza", {"a": ("mostaza",)}),
                ("Alioli", {"a": ("huevo",)}),
                ("Salsas para pasta", {"v": ("pesto", "carbonara", "boloñesa", "cuatro quesos")}),
                ("Salsa de soja", {"u": "ml", "a": ("soja", "gluten")}),
                ("Otras salsas", {"v": ("barbacoa", "brava", "curry", "picante", "césar")}),
            ],
        },
    ),
    (
        "Conservas, caldos y cremas",
        (),
        (),
        {
            "Conservas de pescado": [
                (
                    "Atún en conserva",
                    {
                        "v": ("aceite de oliva", "aceite vegetal", "natural", "escabeche"),
                        "a": ("pescado",),
                        "n": MEAT,
                    },
                ),
                ("Bonito en conserva", {"a": ("pescado",), "n": MEAT}),
                ("Sardinas en lata", {"a": ("pescado",), "n": MEAT}),
                ("Caballa en lata", {"a": ("pescado",), "n": MEAT}),
                ("Mejillones en lata", {"a": ("moluscos",), "n": MEAT}),
                ("Berberechos", {"a": ("moluscos",), "n": MEAT}),
                ("Anchoas", {"a": ("pescado",), "n": MEAT}),
            ],
            "Conservas vegetales": [
                ("Pimientos en conserva", {"v": ("piquillo", "asados", "morrones")}),
                ("Espárragos en conserva", {}),
                ("Alcachofas en conserva", {}),
                ("Maíz dulce", {}),
                ("Guisantes en conserva", {}),
                ("Champiñones en conserva", {}),
                ("Menestra en conserva", {}),
                ("Aceitunas", {"v": ("verdes", "negras", "rellenas", "sin hueso")}),
                ("Encurtidos", {"v": ("pepinillos", "cebolletas", "banderillas")}),
                ("Fruta en almíbar", {}),
            ],
            "Caldos y cremas": [
                ("Caldo", {"u": "ml", "v": ("pollo", "verduras", "pescado", "cocido", "carne")}),
                (
                    "Pastillas de caldo",
                    {"a": ("apio",), "v": ("pollo", "verduras", "pescado", "carne", "cocido")},
                ),
                (
                    "Sopa de sobre",
                    {
                        "a": ("gluten",),
                        "v": (
                            "pollo",
                            "cocido",
                            "cebolla",
                            "maravilla",
                            "juliana",
                            "jardinera",
                            "hortelana",
                            "marisco",
                            "picadillo",
                            "estrellas",
                            "fideos",
                        ),
                    },
                ),
                (
                    "Crema de verduras",
                    {
                        "u": "ml",
                        "v": (
                            "calabaza",
                            "calabacín",
                            "zanahoria",
                            "puerros",
                            "champiñones",
                            "marisco",
                            "pollo",
                            "garbanzos",
                            "lentejas",
                            "tomate",
                            "espárragos",
                            "verduras",
                        ),
                    },
                ),
                ("Gazpacho y salmorejo", {"u": "ml"}),
            ],
        },
    ),
    (
        "Congelados",
        (),
        (),
        {
            "Congelados": [
                (
                    "Verdura congelada",
                    {
                        "v": (
                            "guisantes",
                            "espinacas",
                            "judías verdes",
                            "menestra",
                            "brócoli",
                            "coliflor",
                            "salteado",
                            "maíz",
                            "pimientos",
                            "alcachofas",
                        )
                    },
                ),
                ("Patatas congeladas", {}),
                ("Pizzas congeladas", {"a": ("gluten", "lacteos")}),
                ("Croquetas", {"a": ("gluten", "lacteos")}),
                ("Empanadillas", {"a": ("gluten",)}),
                ("Helados", {"a": ("lacteos",)}),
                ("Hielo", {}),
                ("Platos preparados congelados", {}),
                ("Fruta congelada", {}),
            ],
        },
    ),
    (
        "Platos preparados",
        (),
        (),
        {
            "Refrigerados": [
                ("Tortilla de patata", {"a": ("huevo",), "n": ANIMAL}),
                ("Pizza refrigerada", {"a": ("gluten", "lacteos")}),
                ("Ensaladas preparadas", {}),
                ("Platos preparados refrigerados", {}),
                ("Hummus", {"a": ("sesamo",)}),
                ("Sándwiches", {"a": ("gluten",)}),
                ("Sushi", {"a": ("pescado", "soja")}),
            ],
        },
    ),
    (
        "Desayuno y dulces",
        (),
        (),
        {
            "Café e infusiones": [
                ("Café molido", {"v": ("natural", "mezcla", "descafeinado")}),
                ("Café en grano", {}),
                (
                    "Café en cápsulas",
                    {"u": "unit", "v": ("compatibles nespresso", "dolce gusto", "tassimo")},
                ),
                ("Café soluble", {}),
                ("Té", {"u": "unit"}),
                (
                    "Infusiones",
                    {"u": "unit", "v": ("manzanilla", "poleo menta", "tila", "rooibos")},
                ),
                ("Cacao soluble", {"a": ()}),
            ],
            "Cereales y galletas": [
                ("Cereales de desayuno", {"a": ("gluten",)}),
                ("Copos de avena", {"a": ("gluten",)}),
                ("Galletas", {"a": ("gluten",)}),
                ("Tortitas de arroz y maíz", {}),
            ],
            "Dulces": [
                ("Mermelada", {}),
                ("Miel", {"n": ANIMAL}),
                ("Crema de cacao", {"a": ("frutos_de_cascara", "lacteos")}),
                ("Azúcar", {"v": ("blanco", "moreno", "glas")}),
                ("Edulcorante", {}),
                ("Chocolate", {"v": ("con leche", "negro", "blanco"), "a": ("lacteos",)}),
                ("Bombones", {"a": ("lacteos",)}),
                ("Caramelos y chicles", {}),
                ("Golosinas", {"n": MEAT}),
                ("Turrón", {"a": ("frutos_de_cascara",)}),
            ],
        },
    ),
    (
        "Aperitivos",
        (),
        (),
        {
            "Aperitivos": [
                ("Patatas fritas de bolsa", {}),
                ("Snacks", {}),
                (
                    "Frutos secos",
                    {
                        "v": (
                            "almendras",
                            "nueces",
                            "pistachos",
                            "anacardos",
                            "avellanas",
                            "mezcla",
                        ),
                        "a": ("frutos_de_cascara",),
                    },
                ),
                ("Cacahuetes", {"a": ("cacahuete",)}),
                ("Pipas", {}),
                ("Fruta deshidratada", {}),
                ("Palomitas", {}),
            ],
        },
    ),
    (
        "Bebidas",
        (),
        (),
        {
            "Agua y refrescos": [
                ("Agua mineral", {"u": "ml"}),
                ("Agua con gas", {"u": "ml"}),
                ("Refresco de cola", {"u": "ml", "v": ("normal", "zero", "light", "sin cafeína")}),
                (
                    "Refresco de naranja y limón",
                    {"u": "ml", "v": ("naranja", "limón", "lima limón")},
                ),
                ("Tónica y otros refrescos", {"u": "ml"}),
                ("Bebida isotónica y energética", {"u": "ml"}),
                ("Té frío", {"u": "ml"}),
                ("Kombucha", {"u": "ml"}),
            ],
            "Zumos": [
                (
                    "Zumo",
                    {
                        "u": "ml",
                        "v": (
                            "naranja",
                            "piña",
                            "melocotón",
                            "manzana",
                            "multifrutas",
                            "tomate",
                            "uva",
                        ),
                    },
                ),
                ("Zumo refrigerado", {"u": "ml", "v": ("naranja", "multifrutas", "smoothie")}),
            ],
            "Bebidas alcohólicas": [
                ("Cerveza", {"u": "ml", "a": ("gluten",)}),
                ("Cerveza sin alcohol", {"u": "ml", "a": ("gluten",)}),
                ("Vino tinto", {"u": "ml", "a": ("sulfitos",)}),
                ("Vino blanco", {"u": "ml", "a": ("sulfitos",)}),
                ("Vino rosado", {"u": "ml", "a": ("sulfitos",)}),
                ("Cava y espumosos", {"u": "ml", "a": ("sulfitos",)}),
                ("Sidra", {"u": "ml"}),
                ("Tinto de verano y sangría", {"u": "ml", "a": ("sulfitos",)}),
                ("Licores", {"u": "ml"}),
            ],
        },
    ),
    (
        "Limpieza y hogar",
        (),
        (),
        {
            "Ropa": [
                (
                    "Detergente para ropa",
                    {"u": "unit", "v": ("líquido", "polvo", "cápsulas"), "al": ("detergente",)},
                ),
                ("Suavizante", {"u": "unit"}),
                ("Quitamanchas", {"u": "ml"}),
            ],
            "Cocina y superficies": [
                ("Lavavajillas a mano", {"u": "ml", "al": ("fairy",)}),
                ("Lavavajillas a máquina", {"u": "unit"}),
                ("Lejía", {"u": "ml"}),
                ("Friegasuelos", {"u": "ml"}),
                ("Limpiador multiusos", {"u": "ml"}),
                ("Limpiacristales", {"u": "ml"}),
                ("Limpiador de baño", {"u": "ml"}),
                ("Desengrasante", {"u": "ml"}),
            ],
            "Papel y desechables": [
                ("Papel higiénico", {"u": "unit"}),
                ("Papel de cocina", {"u": "unit"}),
                ("Servilletas", {"u": "unit"}),
                ("Pañuelos de papel", {"u": "unit"}),
                ("Bolsas de basura", {"u": "unit"}),
                ("Papel de aluminio y film", {"u": "unit"}),
                ("Bolsas de congelación", {"u": "unit"}),
            ],
            "Otros de hogar": [
                ("Estropajos y bayetas", {"u": "unit"}),
                ("Guantes de limpieza", {"u": "unit"}),
                ("Ambientador", {"u": "unit"}),
                ("Insecticida", {"u": "unit"}),
                ("Pilas", {"u": "unit"}),
            ],
        },
    ),
    (
        "Higiene y cuidado personal",
        (),
        (),
        {
            "Higiene": [
                ("Gel de ducha", {"u": "ml"}),
                ("Champú", {"u": "ml"}),
                ("Acondicionador", {"u": "ml"}),
                ("Desodorante", {"u": "unit"}),
                ("Pasta de dientes", {"u": "ml", "al": ("dentífrico",)}),
                ("Cepillo de dientes", {"u": "unit"}),
                ("Enjuague bucal", {"u": "ml"}),
                ("Jabón de manos", {"u": "ml"}),
                ("Compresas", {"u": "unit"}),
                ("Tampones", {"u": "unit"}),
                ("Salvaslips", {"u": "unit"}),
                ("Bastoncillos", {"u": "unit"}),
                ("Toallitas húmedas", {"u": "unit"}),
            ],
            "Cuidado personal": [
                ("Crema corporal", {"u": "ml"}),
                ("Crema facial", {"u": "ml"}),
                ("Protector solar", {"u": "ml"}),
                ("Maquinillas de afeitar", {"u": "unit"}),
                ("Espuma y gel de afeitar", {"u": "ml"}),
                ("Discos desmaquillantes", {"u": "unit"}),
                ("Colonia", {"u": "ml"}),
            ],
        },
    ),
    (
        "Bebé",
        (),
        (),
        {
            "Bebé": [
                (
                    "Pañales",
                    {
                        "u": "unit",
                        "v": ("talla 1", "talla 2", "talla 3", "talla 4", "talla 5", "talla 6"),
                    },
                ),
                ("Toallitas de bebé", {"u": "unit"}),
                ("Leche infantil", {"a": ("lacteos",)}),
                ("Potitos", {}),
                ("Papillas de cereales", {"a": ("gluten",)}),
            ],
        },
    ),
    (
        "Mascotas",
        (),
        (),
        {
            "Mascotas": [
                ("Comida seca para perro", {}),
                ("Comida húmeda para perro", {}),
                ("Comida seca para gato", {}),
                ("Comida húmeda para gato", {}),
                ("Arena para gato", {}),
                ("Snacks para mascotas", {}),
            ],
        },
    ),
]


def build_leaves() -> list[Leaf]:
    leaves: list[Leaf] = []
    seen: set[str] = set()
    for section, sec_allergens, sec_not_for, subs in SECTIONS:
        for subsection, items in subs.items():
            for name, opts in items:
                slug = slugify(name)
                if slug in seen:
                    raise ValueError(f"Hoja duplicada: {slug}")
                seen.add(slug)
                leaves.append(
                    Leaf(
                        slug=slug,
                        name=name,
                        section=section,
                        subsection=subsection,
                        unit=opts.get("u", "g"),
                        variants=tuple(opts.get("v", ())),
                        allergens=tuple(opts.get("a", sec_allergens)),
                        not_for=tuple(opts.get("n", sec_not_for)),
                        aliases=tuple(opts.get("al", ())),
                    )
                )
    return leaves


LEAVES = build_leaves()
BY_SLUG = {leaf.slug: leaf for leaf in LEAVES}


def diets_excluded(leaf: Leaf) -> tuple[str, ...]:
    """Dietas incompatibles, incluidas las que salen de los alérgenos (gluten, lactosa)."""
    out = list(leaf.not_for)
    if "gluten" in leaf.allergens:
        out.append("sin_gluten")
    if "lacteos" in leaf.allergens:
        out.append("sin_lactosa")
    return tuple(dict.fromkeys(out))
