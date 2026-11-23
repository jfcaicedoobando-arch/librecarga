/** Contenido y capacidades de la guía; navegar nunca ejecuta una tarea. */
export interface PermisosPrimerosPasos {
  canAdminTenant: boolean;
  canAltaCliente?: boolean;
  canWriteCotizaciones: boolean;
  canCrearEmbarqueDesdeCotizacion: boolean;
  canEditarProforma: boolean;
  canEmitirFactura: boolean;
  canCapturarFacturaProveedor: boolean;
  canAprobarFacturaProveedor: boolean;
  canPagarProveedor: boolean;
  canRegistrarCobro: boolean;
  canCrearLead: boolean;
  canCrearOportunidad: boolean;
  canCrearActividad: boolean;
  canConfigurarCrm: boolean;
}

export interface EnlacePrimerosPasos {
  etiqueta: string;
  href: string;
}

export interface TareaPrimerosPasos {
  id: "alta-cliente" | "cotizar" | "pricing" | "operacion" | "proforma" | "emision" | "captura-cxp"
    | "pagos" | "cobranza" | "consulta" | "configuracion" | "portal-cliente"
    | "portal-agente" | "plataforma";
  titulo: string;
  descripcion: string;
  requisito?: string;
  enlaces: readonly EnlacePrimerosPasos[];
}

type Visibilidad = (href: string) => boolean;
const enlace = (etiqueta: string, href: string): EnlacePrimerosPasos => ({ etiqueta, href });

/** Cada enlace conserva su permiso específico y luego se intersecta con el menú. */
export function crearTareasOrganizacion(
  p: PermisosPrimerosPasos, visible: Visibilidad, destinoPorPagar: string | undefined,
): TareaPrimerosPasos[] {
  const tareas: TareaPrimerosPasos[] = [];
  const agregar = (habilitada: boolean, tarea: TareaPrimerosPasos) => {
    const enlaces = tarea.enlaces.filter((e) => visible(e.href));
    if (habilitada && enlaces.length > 0) tareas.push({ ...tarea, enlaces });
  };
  agregar(p.canAltaCliente === true, {
    id: "alta-cliente", titulo: "Registrar un cliente",
    descripcion: "Abre Clientes y selecciona Nuevo cliente. Ten a la mano la Constancia de Situación Fiscal si vas a darlo de alta.",
    enlaces: [enlace("Abrir Clientes", "/clientes")],
  });
  agregar(p.canWriteCotizaciones, {
    id: "cotizar", titulo: "Preparar una cotización",
    descripcion: "Prepara una cotización para un cliente existente o parte de un lead u oportunidad del CRM. Revisa Datos generales, Costos y utilidad, Cotización del cliente y Resumen.",
    requisito: p.canAltaCliente
      ? "Si aún no existe, regístralo desde Clientes antes de cotizar a un cliente directo."
      : "Si aún no existe, solicita el alta a quien administra los clientes de tu organización.",
    enlaces: [enlace("Ver cotizaciones", "/cotizaciones"),
      ...(p.canCrearLead || p.canCrearOportunidad || p.canCrearActividad ? [enlace("Abrir CRM", "/crm")] : [])],
  });
  agregar(true, {
    id: "pricing", titulo: "Consultar tarifas y Pricing",
    descripcion: "Si ya hay tarifa, compárala antes de cotizar. Si falta un costo, revisa las solicitudes de Pricing para saber si ya hay una respuesta.",
    requisito: "Costeo no es un paso obligatorio para todos los modos de transporte.",
    enlaces: [enlace("Me falta un costo · Ver solicitudes", "/costeo/tarifas?tab=bandeja"), enlace("Ya hay tarifas · Comparar", "/costeo/buscar")],
  });
  agregar(p.canCrearEmbarqueDesdeCotizacion, {
    id: "operacion", titulo: "Continuar una operación",
    descripcion: "Abre un embarque y revisa su fase, ruta, documentos y pendientes.",
    requisito: "Para crear un embarque necesitas una cotización Aceptada. Coordina ese paso con Comercial si todavía no existe.",
    enlaces: [enlace("Ver embarques", "/embarques")],
  });
  agregar(p.canEditarProforma, {
    id: "proforma", titulo: "Preparar una proforma",
    descripcion: "Abre el embarque y revisa Facturación. Si está en Borrador, confirma primero sus datos desde Resumen.",
    requisito: "Generar proforma estará disponible cuando el estado del embarque lo permita y existan conceptos disponibles.",
    enlaces: [enlace("Ver embarques", "/embarques")],
  });
  agregar(p.canEmitirFactura, {
    id: "emision", titulo: "Preparar la emisión de una factura",
    descripcion: "Revisa las proformas aceptadas para preparar un borrador de factura. Después abre Por timbrar y revisa el documento antes de emitirlo.",
    requisito: "Puedes preparar el borrador con una proforma elegible y una serie activa. Para timbrar, revisa Facturapi en Configuración → Facturación o pídeselo al responsable de facturación.",
    enlaces: [enlace("Ver proformas aceptadas", "/proformas?estado=aceptada"),
      enlace("Ver Por timbrar", "/facturacion?bandeja=por-timbrar"),
      enlace("Revisar conexión con Facturapi", "/configuracion?tab=facturacion")],
  });
  const enlacesCaptura = [
    ...(p.canCapturarFacturaProveedor ? [enlace("Ver Por capturar", "/compras/por-capturar")] : []),
    ...(p.canAprobarFacturaProveedor ? [enlace("Revisar Por aprobar", "/compras/por-aprobar")] : []),
  ].filter((e) => visible(e.href));
  const puedeCapturar = enlacesCaptura.some((e) => e.href === "/compras/por-capturar");
  agregar(enlacesCaptura.length > 0, {
    id: "captura-cxp", titulo: puedeCapturar ? "Capturar facturas de proveedor" : "Revisar facturas por aprobar",
    descripcion: puedeCapturar
      ? "Revisa Por capturar para localizar costos que todavía no tienen factura de proveedor recibida. Cuando tengas el documento, abre la captura y revisa los datos antes de guardar."
      : "Abre Por aprobar y revisa la factura de proveedor antes de decidir su aprobación.",
    requisito: "Capturar, aprobar y pagar son acciones distintas, cada una con su propio permiso.",
    enlaces: enlacesCaptura,
  });
  agregar(p.canPagarProveedor, {
    id: "pagos", titulo: "Revisar pagos a proveedores",
    descripcion: "Consulta las facturas aprobadas pendientes de pago. Registrar un pago y conciliarlo con un movimiento bancario son pasos distintos.",
    enlaces: destinoPorPagar ? [enlace("Ver pendientes de pago", destinoPorPagar)] : [],
  });
  agregar(p.canRegistrarCobro, {
    id: "cobranza", titulo: "Dar seguimiento a cobros",
    descripcion: "Revisa las facturas y su saldo en Cobranza. Abre la factura para consultar su detalle y las acciones disponibles para tu rol.",
    enlaces: [enlace("Ver Cobranza", "/cobranza")],
  });
  agregar(p.canAdminTenant, {
    id: "configuracion", titulo: "Revisar la empresa y el equipo",
    descripcion: "Retoma los datos que dejaste para después. Empresa contiene los datos de los PDF; Facturación contiene el perfil fiscal del emisor para CFDI.",
    enlaces: [enlace("Configurar datos para documentos", "/configuracion"),
      ...(p.canEmitirFactura ? [enlace("Datos fiscales del emisor", "/configuracion?tab=facturacion")] : []),
      enlace("Ver usuarios", "/usuarios")],
  });
  agregarConsulta(tareas, visible);
  return tareas;
}

function agregarConsulta(tareas: TareaPrimerosPasos[], visible: Visibilidad) {
  const usados = new Set(tareas.flatMap((t) => t.enlaces.map((e) => e.href.split("?")[0])));
  const enlaces = [
    enlace("Consultar embarques", "/embarques"), enlace("Consultar cotizaciones", "/cotizaciones"),
    enlace("Consultar facturas de proveedor", "/compras/facturas"), enlace("Consultar Cobranza", "/cobranza"),
    enlace("Revisar conciliación", "/tesoreria/conciliacion"), enlace("Consultar proformas", "/proformas"),
    enlace("Consultar facturación", "/facturacion"), enlace("Consultar CRM", "/crm"),
    enlace("Consultar clientes", "/clientes"), enlace("Consultar rentabilidad", "/reportes/rentabilidad"),
  ].filter((e) => visible(e.href) && !usados.has(e.href)).slice(0, 3);
  if (enlaces.length > 0) tareas.push({
    id: "consulta", titulo: "Consultar información",
    descripcion: "Estos accesos son de consulta. Las acciones disponibles en cada pantalla dependen de tus permisos y del estado del registro.",
    enlaces,
  });
}

export function crearTareaPortal(role: "cliente" | "agente_carga"): TareaPrimerosPasos {
  return role === "cliente" ? {
    id: "portal-cliente", titulo: "Consultar tu portal de cliente",
    descripcion: "Consulta las cotizaciones, embarques, facturas y el estado de cuenta disponibles para los clientes vinculados a tu acceso.",
    requisito: "Si no encuentras la información esperada, pide a tu contacto de operaciones que revise la vinculación de tu acceso.",
    enlaces: [enlace("Abrir portal de cliente", "/portal")],
  } : {
    id: "portal-agente", titulo: "Consultar tu portal de agente",
    descripcion: "Revisa las tarifas, los embarques y las garantías disponibles para tu agente.",
    requisito: "Tu usuario debe estar vinculado a un agente. Si falta ese vínculo, contacta a Operaciones.",
    enlaces: [enlace("Abrir portal de agente", "/agente")],
  };
}

export function crearTareaPlataforma(): TareaPrimerosPasos {
  return {
    id: "plataforma", titulo: "Elegir el contexto de trabajo",
    descripcion: "Abre el panel de plataforma para administrar Librecarga. Para tareas de una empresa, selecciona primero su organización activa.",
    enlaces: [enlace("Abrir panel de plataforma", "/admin")],
  };
}
