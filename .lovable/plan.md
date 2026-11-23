# Plan: Pricing por modo de transporte (de la solicitud a la cotización)

Basado en "proceso-pricing-por-modo.md". Hoy el circuito funciona de punta a punta sólo en Marítimo FCL: la solicitud es un formulario genérico y, al cotizar, el modo siempre se fija en "Marítimo" (confirmado en el código). La meta es elegir el modo primero; cada modo tiene sus propios campos, su propia respuesta de Pricing y su propio paso automático a la cotización.

Analogía: hoy hay una sola ventanilla con un formulario para todo. Vamos a poner tres ventanillas (Marítimo, Aéreo, Terrestre). Comparten la misma recepción (datos comunes) y cada una tiene su formulario especializado.

## Fases (cada una se entrega y prueba por separado)

### Fase 1 — Base común y Marítimo completo
- Paso 0 en "Solicitar tarifa": elegir modo y submodalidad (FCL/LCL, FTL/LTL/Arrastre). Después ya no se puede cambiar; para cambiarlo se clona la solicitud.
- Datos comunes: tipo de solicitud (Spot/Contrato/Licitación), lugar del Incoterm, fecha tentativa de carga obligatoria, peligrosa con clase/UN y MSDS condicional.
- Incoterms filtrados por modo; agregar CPT y CIP; quitar "g" de la captura nueva (lo histórico se conserva).
- Campos obligatorios por modo validados en el servidor, con el mismo espejo en pantalla.
- Complejidad y SLA por modo; la complejidad "baja" se asigna cuando ya hay una tarifa vigente.
- LCL: bultos, CBM y W/M calculados.
- Al cotizar, el modo y la submodalidad salen de la solicitud.

### Fase 2 — Cargos estructurados
- Catálogo único de cargos (código, modos, lado y base por defecto).
- Cada recargo guarda base de cálculo, mínimo, proveedor y moneda propia.
- La vigencia de la tarifa se compara con la fecha tentativa de carga, no con la fecha de hoy.

### Fase 3 — Aéreo
- Catálogo de aeropuertos cargado del CSV (3,244 registros, IATA).
- Solicitud aérea: piezas con medidas, peso volumétrico (L×A×H/6000), peso tasable, litio, expedidor conocido, PAX/CAO.
- Respuesta aérea: aerolínea, conexiones, escala de pesos (MIN, -45, +45 … +1000) con la regla del siguiente rango más barato, FSC/SSC.
- Sugerencias del tarifario aéreo y paso a la cotización aérea (usa las columnas aéreas que ya existen).

### Fase 4 — Terrestre
- Origen y destino por CP/ciudad, paradas, cruce fronterizo e in-bond.
- FTL (catálogo de unidades unificado), LTL (tarimas) y Arrastre (puerto, vacío, sobrepeso).
- Respuesta terrestre: linehaul, FSC con índice, detención y layover por separado.
- Paso a la cotización terrestre (`tipo_unidad`, `punto_intermedio`).

### Fase 5 — Operación de Pricing
- Cada ejecutivo de Pricing tiene asignados los modos que atiende; las notificaciones y la bandeja usan esa asignación. Si un modo no tiene a nadie asignado, se avisa a todos, como hoy.
- Bandeja con pestañas por modo, reloj de SLA y orden por vencimiento.
- Nuevos estados: Asignada, En proceso, Información requerida (SLA en pausa), Sin opción con motivo, Cotizada; la solicitud se marca como vencida sin cerrarse.
- Avisos al 80 % del SLA y al vencer.

### Fase 6 — Ciclo y reportes (sólo si se confirma)
- Recotización por versión, motivo de pérdida, costo estimado contra costo real, indicadores, carga desde Excel.

## Decisiones pendientes del negocio (valores provisionales)
1. SLA en horas naturales (provisional) o en horas hábiles con horario.
2. SLA de 4 h para la complejidad baja (provisional).
3. Ferrocarril/intermodal fuera del alcance por ahora.
4. Margen mínimo: se queda el umbral único actual.
5. El vendedor sigue viendo el costo como hoy.
6. Sin envío de la misma solicitud a varios agentes ni carga desde Excel en esta etapa.
7. El área fiscal valida clave SAT, IVA y retención del 4 % en flete terrestre antes de la Fase 2.

## Qué no cambia
- Las solicitudes y cotizaciones históricas se conservan sin inventar datos.
- Se respetan los candados actuales: estados sólo por el servidor, aislamiento por empresa, márgenes, monedas y autorizaciones.
- No se publica sin tu instrucción.

## Detalles técnicos
- Migraciones Drizzle nuevas desde la definición viva, con GRANT y RLS por organización: catálogo `aeropuertos`, catálogo de cargos, columnas nuevas en `crm_solicitudes_pricing` (submodalidad, extensión por modo en jsonb validado), en `costeo_tarifas` (modo, aeropuertos, escala aérea, datos terrestres) y en `costeo_tarifa_recargos` (base, mínimo, proveedor, cargo_id). La huella fija de las funciones de Pricing se actualiza en el mismo cambio.
- RPC: `crm_enviar_solicitud_pricing` (obligatorios y SLA por modo, cálculo de baja), y RPCs de transición para los estados nuevos.
- Frontend: `camposObligatorios.ts` como espejo; `mapeoSolicitudCotizacion.ts` con una sección por modo; `aplicarRespuestaPricing.ts` deja de fijar "Marítimo"; formularios divididos en componentes de 200 líneas o menos por modo.
- Pruebas focalizadas por fase (obligatorios, SLA, peso tasable, siguiente rango, mapeo por modo) y `db:postcheck`. CI y RLS completos se corren en GitHub Actions.
