# Fase 4 — Pricing terrestre (de la solicitud a la cotización)

## Qué ya existe (no se rehace)
- Tarifario terrestre: FTL/LTL/Arrastre, CP/ciudad de origen y destino, tipo de unidad, mínimo, recargos con moneda, mínimo y proveedor propios.
- Catálogo de cargos terrestres: FSC (SUR-FST), parada adicional, cruce fronterizo, arrastre, retorno de vacío, maniobras, casetas, etc.
- Cálculo de flete por viaje en la cotización y carga automática de costos con tarifa vinculada.

## Qué se construye

### 1. Solicitud terrestre (lo que captura el vendedor)
Sólo se muestra cuando el modo es Terrestre; todo opcional salvo lo marcado.
- Origen y destino por **CP y ciudad** (en lugar de puerto).
- **Paradas intermedias** (lista corta de ciudades/CP).
- **Cruce fronterizo** Sí/No y, si es Sí, **In-bond** Sí/No.
- Según submodalidad:
  - FTL: **tipo de unidad** (mismo catálogo del tarifario) — obligatorio.
  - LTL: **número de tarimas** — obligatorio.
  - Arrastre: **puerto** de recolección/entrega, **retorno de vacío** Sí/No, **sobrepeso** Sí/No.
- Se muestran en el resumen de la solicitud; la base rechaza el envío si falta un obligatorio (mismo patrón que LCL/IMO, con aviso previo en pantalla).

### 2. Respuesta de Pricing terrestre
- En la bandeja, sugerencias de tarifas terrestres aprobadas y vigentes que coincidan por submodalidad, CP/ciudad y tipo de unidad (vigencia contra la fecha tentativa de carga).
- «Agregar tarifa» en una solicitud terrestre abre el formulario terrestre (como ya pasa en aéreo).
- Linehaul = flete base; FSC, detención, layover, paradas y cruce se capturan como recargos separados del catálogo (con su mínimo y proveedor).

### 3. Paso a la cotización
- Botón «Cotizar con esta tarifa» para terrestre: abre la cotización con modo, submodalidad, ruta, **tipo de unidad** y **punto intermedio** (primera parada) ya llenos, y carga los costos sólo de esa tarifa.
- Sólo llena campos vacíos; no pisa lo capturado a mano.
- La complejidad «baja» automática también reconoce tarifas terrestres vigentes que coincidan.

## Qué no cambia
- Solicitudes y cotizaciones históricas sin datos inventados.
- Marítimo y aéreo sin cambios; ferrocarril/intermodal fuera de alcance.
- Sin nuevos estados ni reloj distinto (eso es Fase 5).

## Detalles técnicos
- Nuevas columnas opcionales en `crm_solicitudes_pricing`: `origen_cp`, `destino_cp`, `paradas text[]`, `cruce_fronterizo`, `in_bond`, `tipo_unidad`, `tarimas`, `arrastre_puerto`, `retorno_vacio`, `sobrepeso` (CHECK por modo; NULL en históricos).
- `crm_enviar_solicitud_pricing`: faltantes de FTL (tipo de unidad) y LTL (tarimas); `_crm_pricing_hay_tarifa_vigente` agrega rama Terrestre.
- Componentes nuevos pequeños (`CamposTerrestre*.tsx`, `OpcionesTarifarioTerrestre.tsx`, `usePrefillTarifaTerrestre`) reutilizando los patrones aéreos; archivos ≤200 líneas.
- Pruebas focalizadas de validación, coincidencia de tarifa y prefill; CI/RLS completos en GitHub.
