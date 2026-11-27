# Arreglar «Cotizar» en respuestas de Pricing aéreas y terrestres

## Qué pasó (confirmado en la base)
- Yvonne quiso cotizar la solicitud **NOV260025** (Terrestre) desde la respuesta de Pricing.
- El botón «Cotizar» de la respuesta siempre abre la cotización por el camino **marítimo**: busca la tarifa en una lista que sólo contiene tarifas marítimas (exige naviera, puertos y contenedor).
- Una tarifa terrestre o aérea nunca está en esa lista, así que el sistema cree que «ya no está vigente», aunque sí lo esté. La tarifa nueva que creó Sergio Plata (vigente hasta 31/12/2026, agente Altamira Logística) fallaría igual.
- El agente provisional no causa el error: la tarifa está aprobada y vigente.
- Las sugerencias aéreas y terrestres sí funcionan porque usan otro camino que acepta cualquier modo.

Analogía: es como buscar un camión en el directorio de barcos; no lo encuentra y concluye que no existe.

## Cambio
1. En el detalle de la solicitud de Pricing, «Cotizar» elige el camino según el modo de la tarifa: marítimo sigue igual; aéreo y terrestre usan el camino multimodo que ya funciona en las sugerencias.
2. Confirmar que por ese camino la cotización sigue quedando ligada a la oportunidad y a la solicitud (como el camino marítimo). Si no se liga, pasar también la oportunidad para que el paso 1 la conserve, sin tocar candados de la base.
3. Prueba pequeña: una respuesta terrestre/aérea abre el camino multimodo y una marítima el de siempre.
4. Verificar en pantalla con NOV260025 y su tarifa vigente actual.

## Detalles técnicos
- `SolicitudPricingDetalle.tsx` `cotizarRespuesta` arma siempre `?tarifa=&solicitud=&oportunidad=` → `usePrefillContextoPricing` → `fetchTarifasPricingOrganizacion` lee `costeo_tarifas_vigentes_v` (INNER JOIN navieras/rutas/puertos/tipos_contenedor) → arreglo vacío → error.
- Para `modo` Aéreo/Terrestre usar `?tarifaAerea=&solicitud=` (+ `oportunidad`), igual que `OpcionesTarifarioAereo/Terrestre.tsx`; `fetchPrefillTarifaAerea` ya valida estado, modo y fecha tentativa.
- `useTarifasRespuestaPricing` debe exponer `modo` (agregarlo al select si falta).
- Sin migraciones, sin cambiar la vista ni los candados.
