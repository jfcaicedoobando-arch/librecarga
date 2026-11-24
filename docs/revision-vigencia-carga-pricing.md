# Revisión de vigencia según fecha tentativa de carga

Regla: una tarifa elegida para una solicitud debe cubrir el día previsto de carga, con ambos límites incluidos. Si falta una fecha futura válida, se conserva el día de negocio de México. No se recalculan acuerdos enviados, pagados o cerrados.

## Lugares revisados por lectura de código o definición viva

| Lugar | Resultado |
| --- | --- |
| Detalle de solicitud desde oportunidad y bandeja (`SolicitudPricingDetalle`) | Comparten las mismas sugerencias por modo. |
| Sugerencias aéreas (`OpcionesTarifarioAereo`, hook y servicio) | Corregidas: fecha de solicitud tanto en filtros como en caché. |
| Sugerencias terrestres (`OpcionesTarifarioTerrestre`, hook y servicio) | Ya consultaban la fecha futura; ahora comparten la resolución de fecha válida. |
| Sugerencias marítimas (`useOpcionesTarifario`, `tarifasCoincidentes`, `listarTarifasTarifario`) | Corregida la consulta previa, que excluía tarifas todavía no iniciadas hoy aunque fueran válidas al cargar. La lectura de selección existente se conserva. |
| Abrir nueva cotización con tarifa aérea/terrestre (`fetchPrefillTarifaAerea`, `usePrefillTarifaAerea`) | Corregido: relee fecha de solicitud y ambos límites antes de aplicar la tarifa. |
| Abrir respuesta de Pricing o elegir respuesta dentro de cotización (`fetchContextoPricingCotizacion`, `usarOpcionPricing`, `usePrefillContextoPricing`) | Corregido: rechaza tarifa que no cubra la carga antes de modificar el formulario. |
| Lista de respuestas dentro de cotización (`fetchOpcionesPricingCotizacion`, `useOpcionesPricingCotizacion`) | Corregida: filtra por fecha propia de cada solicitud, sin modificarla. |
| Respuestas existentes y opciones antiguas (`TarifasRespuestaPricing`, `listarTarifasRespuesta`, `OpcionPricingEditor`) | Lecturas históricas conservadas; el editor antiguo sólo se monta con `editable=false`, por lo que la variante de copiar tarifas no se activa. |
| Cálculo/carga de costos (`useCargaCostosTarifa`, `fetchTarifaMultimodoVinculada`, `fetchTarifaVinculada`) | Lectura de tarifa vinculada y cálculo, sin selección por fecha propia. No se cambian montos ni recargos. |
| Buscador independiente, diálogo y sugerencias inline marítimas (`CosteoBuscar`, `BuscarTarifaDialog`, `useFiltrosTarifa`, `useTopTarifas`, `fetchTopTarifas`, `useSugerenciasTarifaInline`, `TarifaVinculadaPanel`) | Corregida la conexión inline/cambiar tarifa: carga la solicitud ligada y hereda su día de carga antes de consultar. El diálogo recibe esa fecha sin pisar una fecha editada por el operador. El buscador independiente conserva su fecha capturada y hoy por defecto. |
| Clasificación de complejidad (`_crm_pricing_hay_tarifa_vigente`, definición viva) | Cumple: mayor entre día de México y fecha de solicitud, ambos límites de tarifa. |
| Top 3 (`get_top_tarifas`, `obtener_top_tarifas`, definiciones vivas) | Cumplen la fecha recibida con ambos límites. La vista previa usa hoy sólo para excluir vencidas; no excluye tarifas próximas a iniciar. |
| Seleccionar tarifa marítima (`crm_aplicar_tarifa_tarifario`, definición viva) | Pendiente: valida vencimiento contra `current_date`, sin inicio ni fecha de carga. Cambio de base retenido hasta autorización. |
| Vincular cotización a Pricing (`crm_vincular_cotizacion_cliente_pricing`, definición viva y caller) | Pendiente: nuevas vinculaciones validan vencimiento contra hoy en México, no la carga; mantiene salida idempotente/histórica. Cambio de base retenido hasta autorización. |
| Revalidar cotización al crear embarque (`revalidar_tarifa_cotizacion`, definición viva y servicio) | Pendiente: usa presencia en vista marítima vigente hoy, sin fecha de carga; no modificar decisiones operativas ni cotizaciones aceptadas en esta corrección. Requiere revisión/autorización de alcance. |
| Avisos de plazo (`crm_pricing_avisos_sla`, definición viva), refresco de bandeja/respuestas | No seleccionan tarifas: miden `vence_at` y refrescan lecturas. Sin cambios. |
| Aprobar tarifas, conteo pendiente, reemplazo de tarifas e importación por correo (servicios leídos y `costeo_tarifas_marcar_reemplazadas` vivo) | No representan una solicitud de carga: usan fecha de aprobación, vigencia del nuevo tarifario o correo. Sin cambios. |

## Validación y límites

- 104 pruebas focalizadas aprobadas; lint focalizado sin errores y compilación automática correcta.
- Sesión real: oportunidad del usuario y NOV260012 abiertas; la solicitud no tiene fecha tentativa y usa correctamente hoy en México. No se guardó ni envió nada.
- Casos de fecha futura, vencimiento anterior a carga, inicio posterior y límites incluidos comprobados mediante pruebas focalizadas con entradas concretas.
- No se probó en pantalla una solicitud persistida con fecha futura, ni se envió una cotización al cliente.
- Sin publicación, migraciones, cambios de permisos, configuración, precios ni datos históricos.
- CI/RLS completos pendientes de GitHub Actions.