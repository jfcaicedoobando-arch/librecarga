# Desglose de recargos por modo (Fase 2 de Pricing)

## Lo que encontré hoy
- Las respuestas de Pricing se guardan como tarifas del tarifario, y cada tarifa ya tiene recargos (concepto, origen/destino, monto y moneda).
- Al pasar a la cotización:
  - **Todos los recargos se ponen en USD**, aunque estén capturados en MXN. Los costos reales quedan mal.
  - **Cada recargo se multiplica por el número de contenedores**, aunque sea un cargo por embarque (BL, despacho). Eso infla el costo.
  - El flete siempre dice "Flete marítimo", aunque el modo sea otro.
- En la respuesta de Pricing, la tarjeta de cada opción no muestra sus recargos.
- El tarifario sólo modela tarifas marítimas (puertos y contenedores). Todavía no hay tarifas aéreas ni terrestres; eso son las Fases 3 y 4.

## Qué construiré
1. **Base de cada recargo:** "por unidad" (contenedor, m³/W/M, kg tasable, viaje) o "por embarque". Los recargos que ya existen quedan "por unidad", así su cálculo no cambia.
2. **Catálogo de conceptos por modo** que se sugiere al capturar, con texto libre permitido:
   - Marítimo: BAF, LSS, ISPS, THC origen/destino, BL, despacho.
   - Aéreo: FSC (combustible), SSC (seguridad), manejo, AWB.
   - Terrestre: FSC, maniobras, cruce fronterizo, custodia, estadía.
3. **Moneda real en la cotización:** cada recargo pasa con su propia moneda (USD o MXN). Si alguno está en EUR, se avisa y no se aplica, porque los costos de la cotización sólo manejan USD y MXN.
4. **Nombre y unidad del flete según el modo:** marítimo FCL por contenedor, LCL por m³; aéreo por kg; terrestre por viaje.
5. **Desglose visible** en la tarjeta de cada opción de la respuesta de Pricing: flete más recargos, separados en origen y destino.

## Fuera de esta fase
- Mínimos por recargo, proveedor por recargo y vigencia contra la fecha de carga (se pueden agregar después si los necesitas).
- Tarifas aéreas y terrestres completas (Fases 3 y 4). El catálogo y la base de cobro ya quedarán listos para ellas.

## Detalles técnicos
- Migración: `costeo_tarifa_recargos.base text NOT NULL DEFAULT 'por_unidad' CHECK (base IN ('por_unidad','por_embarque'))`. Se revisan `crear_tarifa_con_recargos_rpc` y las mutaciones de recargos para que guarden `base`.
- `buildCostosDesdeTarifa`: cantidad = 1 si `por_embarque`; moneda del recargo/tarifa; error explícito si es EUR; etiqueta del flete según modo.
- `TarifaRecargosEditor`: selector de base y sugerencias del catálogo `conceptosRecargoPorModo`.
- Pruebas: base por embarque no se multiplica; recargo MXN conserva MXN; EUR se rechaza; etiquetas por modo.
