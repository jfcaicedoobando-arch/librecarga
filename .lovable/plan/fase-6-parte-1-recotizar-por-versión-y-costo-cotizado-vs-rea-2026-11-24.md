# Fase 6 (parte 1): Recotizar por versión y Costo cotizado vs real

## 1. Recotizar por versión
Hoy, si el cliente pide cambios, Pricing edita la respuesta y se pierde lo que respondió antes.

Qué cambia:
- En una solicitud **Respondida** aparece el botón **«Recotizar»** (para Pricing y quien hoy puede responder). Pide un motivo obligatorio (p. ej. «cliente cambió fecha de carga»).
- Al recotizar, el sistema guarda una foto de las opciones actuales como **Versión 1** y la solicitud vuelve a **En proceso** con el reloj de SLA hábil reiniciado.
- Pricing responde normalmente; la nueva respuesta queda como **Versión 2** (y así sucesivamente).
- En el detalle de la solicitud se ve «Versión N» y un apartado **«Versiones anteriores»** de sólo lectura con fecha, autor, motivo y opciones.
- Las cotizaciones ya creadas con una versión anterior no se tocan: conservan sus importes.
- Una solicitud ya Cotizada/Finalizada también puede recotizarse; su cotización anterior sigue igual y el cierre visual se recalcula.

## 2. Costo cotizado vs real
Comparar lo que Pricing estimó contra lo que realmente cobraron los proveedores, como comparar el presupuesto de una obra contra las facturas.

Qué cambia:
- En el detalle de la solicitud (cuando ya tiene cotización con embarque) aparece la tarjeta **«Costo cotizado vs real»**:
  - Costo cotizado: costos de la cotización ligada.
  - Costo real: facturas de proveedor vigentes del embarque.
  - Diferencia y % de desviación, **por moneda** (USD con USD, MXN con MXN; nunca se suman monedas distintas).
  - Estado: «Sin embarque», «Esperando facturas» o el resultado.
- En la bandeja de Pricing, una pestaña **«Cotizado vs real»** con la lista de solicitudes con embarque, paginada y filtrable por modo y ejecutivo, para ver dónde se está cotizando de menos.
- Sólo lectura: no modifica costos, facturas, márgenes ni comisiones.

## Fuera de alcance
Motivos de pérdida, tablero de indicadores y carga desde Excel (quedan para después).

## Detalles técnicos
- Migración Drizzle nueva: tabla `crm_pricing_opciones_versiones` (org, solicitud, version, motivo, opciones jsonb, created_by) con GRANT/RLS por organización (lectura = lectores actuales de la solicitud; sin escritura directa por API) y columna `crm_solicitudes_pricing.version int default 1`.
- RPC `crm_pricing_recotizar(p_solicitud, p_motivo)` SECURITY DEFINER: valida rol/tenant con los helpers existentes, bloquea la fila, copia opciones, incrementa versión, cambia a `en_proceso` y reinicia SLA reutilizando la lógica de `crm_pricing_cambiar_estado`; registra en historial de etapas. Actualizar la huella fija de funciones de Pricing en el mismo cambio.
- RPC de lectura `crm_pricing_costo_vs_real(p_solicitud_ids uuid[])` SECURITY INVOKER: cotizacion_costos de la cotización no archivada ligada por `pricing_solicitud_id` → embarque por `cotizacion_id` → `proveedor_facturas` vigentes; agrupado por moneda. Lista paginada con `.range()`.
- Frontend: botón/diálogo de recotizar, sección de versiones, tarjeta y pestaña, componentes ≤200 líneas.
- Pruebas focalizadas: versión incrementa y conserva opciones previas, motivo obligatorio, cálculo de diferencia por moneda sin mezclar, estado «Esperando facturas». `db:postcheck` y CI/RLS completos en GitHub Actions. Sin publicar.
