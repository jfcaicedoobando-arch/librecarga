# Fase 5 — Operación de Pricing

## Qué vas a ver
1. **Modos por ejecutivo de Pricing**: en la configuración de Pricing, Administración marca qué modos atiende cada ejecutivo (Marítimo, Aéreo, Terrestre). Los avisos de una solicitud nueva llegan sólo a quien atiende ese modo; si nadie lo atiende, se avisa a todos, como hoy.
2. **Bandeja con pestañas por modo** (Todas, Marítimo, Aéreo, Terrestre), con el reloj de SLA visible y ordenada por lo que vence primero. Cada ejecutivo abre por defecto la pestaña de sus modos.
3. **Estados nuevos** de la solicitud:
   - Asignada (un ejecutivo la toma).
   - En proceso.
   - Información requerida: el reloj se pausa hasta que el vendedor responde; al reanudar, el plazo se recorre por las horas hábiles pausadas.
   - Sin opción: exige escribir un motivo.
   - Cotizada (cuando la respuesta se usa en una cotización).
   - «Vencida» no es un estado: es una etiqueta roja; la solicitud sigue abierta.
4. **Avisos de SLA**: al ejecutivo asignado (o al equipo del modo) cuando se consume el 80 % del plazo y cuando vence. Un aviso por solicitud por cada umbral.

## Qué no cambia
- Solicitudes históricas conservan su estado; los cambios de estado sólo los hace el servidor; aislamiento por empresa.
- Horario hábil ya acordado (L-V 9–18, sáb 9–14, hora del centro).
- No se publica.

## Detalles técnicos
- Migración Drizzle: tabla `crm_pricing_modos_ejecutivo` (org, user, modo) con GRANT + RLS por organización (lectura miembros, escritura admin); columnas en `crm_solicitudes_pricing`: `asignada_a`, `pausada_at`, `motivo_sin_opcion`, `aviso_80_at`, `aviso_vencida_at`; estados nuevos en el CHECK.
- RPCs de transición `crm_pricing_cambiar_estado` (valida rol y transición permitida), reanudación con recorrido del plazo usando `_crm_pricing_sumar_horas_habiles`; `crm_enviar_solicitud_pricing` filtra destinatarios por modo. Huella de funciones de Pricing actualizada en el mismo cambio.
- Avisos SLA: tarea programada cada hora (24 ejecuciones/día) que marca y notifica por umbral de forma idempotente.
- Frontend: pestañas en `BandejaPricingPanel`, orden por `vence_at`, acciones nuevas en `AccionesSolicitudPricing`, componentes ≤200 líneas; pruebas focalizadas de transiciones, pausa y orden.
