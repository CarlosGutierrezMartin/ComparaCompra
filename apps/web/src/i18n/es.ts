/**
 * Textos de la interfaz en español. Para traducir (catalán, euskera, gallego), se añade
 * un fichero con la misma forma y se elige en `t`.
 */
export const es = {
  app: {
    name: "ComparaCompra",
    tagline: "Tu lista de la compra, lo más barata posible.",
  },
  nav: { lista: "Lista", platos: "Platos", menu: "Menú", tienda: "Tienda", perfil: "Perfil" },
  offline: {
    banner:
      "Sin conexión. Los precios pueden no estar actualizados; tus cambios se guardan y se enviarán al volver la conexión.",
    page: "No hay conexión y esta página aún no se había guardado en el móvil. Vuelve a intentarlo cuando tengas cobertura.",
  },
  install: {
    button: "Instalar la app",
    iosTitle: "Instalar en iPhone o iPad",
    iosSteps: [
      "Abre esta página en Safari.",
      "Toca el botón Compartir (el cuadrado con una flecha hacia arriba).",
      "Elige «Añadir a pantalla de inicio».",
      "Toca «Añadir». La app aparecerá en tu pantalla de inicio y funcionará sin conexión.",
    ],
    iosLink: "Cómo instalarla en iPhone",
    installed: "La app ya está instalada.",
  },
  onboarding: {
    title: "Empecemos",
    intro:
      "Con tu código postal sabemos qué precios ves en cada supermercado. Solo pedimos lo imprescindible.",
    postalCode: "Código postal",
    postalCodeHelp: "5 cifras. De momento cubrimos Madrid capital (28001 a 28055).",
    postalCodeInvalid: "Escribe un código postal de 5 cifras.",
    postalCodeNotCovered:
      "Aún no tenemos precios para ese código postal. Puedes seguir, pero la comparación no tendrá datos.",
    members: "Personas en casa",
    budget: "Presupuesto semanal (opcional)",
    budgetHelp: "En euros. Lo usamos para proponer el menú semanal.",
    diet: "Dieta",
    allergens: "Alérgenos que evitar",
    chains: "Supermercados que tienes cerca",
    chainNoPrices: "sin precios por ahora",
    submit: "Guardar y empezar",
  },
  profile: {
    title: "Perfil",
    household: "Tu hogar",
    save: "Guardar cambios",
    saved: "Cambios guardados.",
    account: "Cuenta",
    accountIntro:
      "Inicia sesión para guardar tus listas y platos en la nube y usarlos en varios dispositivos. Sin cuenta, todo se guarda solo en este móvil.",
    email: "Correo electrónico",
    sendLink: "Enviarme el enlace de acceso",
    linkSent: "Te hemos enviado un enlace. Ábrelo en este dispositivo para entrar.",
    signedInAs: "Has entrado como",
    signOut: "Cerrar sesión",
    noBackend:
      "La sincronización no está configurada en este servidor; tus datos se guardan solo en este móvil.",
    pendingSync: (n: number) =>
      n === 1 ? "1 cambio pendiente de enviar." : `${n} cambios pendientes de enviar.`,
    allSynced: "Todo está guardado.",
    install: "Instalar",
    privacy: "Solo guardamos tu correo y tu código postal. Nunca pedimos tu ubicación exacta.",
  },
  diets: {
    vegetariana: "Vegetariana",
    vegana: "Vegana",
    sin_gluten: "Sin gluten",
    sin_lactosa: "Sin lactosa",
  } as Record<string, string>,
  allergens: {
    gluten: "Gluten",
    crustaceos: "Crustáceos",
    huevo: "Huevo",
    pescado: "Pescado",
    cacahuete: "Cacahuete",
    soja: "Soja",
    lacteos: "Lácteos",
    frutos_de_cascara: "Frutos de cáscara",
    apio: "Apio",
    mostaza: "Mostaza",
    sesamo: "Sésamo",
    sulfitos: "Sulfitos",
    altramuces: "Altramuces",
    moluscos: "Moluscos",
  } as Record<string, string>,
  chains: {
    mercadona: "Mercadona",
    carrefour: "Carrefour",
    dia: "Dia",
    alcampo: "Alcampo",
  } as Record<string, string>,
  common: {
    loading: "Cargando…",
    comingSoon: "Disponible muy pronto.",
    error: "Algo ha fallado. Inténtalo de nuevo.",
  },
};

export type Messages = typeof es;
export const t: Messages = es;
