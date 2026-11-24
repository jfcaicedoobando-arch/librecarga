# Recargos locales e internacionales

## Qué cambia para el usuario
En el editor de recargos de cada tarifa (marítima, aérea y terrestre), cada renglón tendrá un selector nuevo **Tipo**:

- **Local** — se captura en **MXN**. Casilla «+ IVA» (se calcula con la tasa de IVA configurada en la empresa, nunca fija).
- **Internacional** — se captura en **USD**. Casilla «+ VAT» (informativa: indica que el proveedor extranjero agrega su impuesto; no se suma IVA mexicano).

La moneda del renglón se pone sola según el tipo, y el mínimo usa esa misma moneda. El encabezado deja de decir «Recargos (USD)» y se separa en dos bloques: **Recargos locales (MXN)** y **Recargos internacionales (USD)**.

## Dónde se verá
- Editor de tarifas y respuesta de Pricing: los dos bloques.
- Sugerencias y Top 3 de Pricing: subtotal por moneda (no se suman pesos con dólares).
- Cotización (paso de costos, resumen y PDF): cada recargo llega con su moneda real y con la etiqueta «+ IVA» o «+ VAT». La conversión a la moneda de la cotización sigue usando el tipo de cambio existente, como hoy con conceptos de otra moneda.

## Recargos que ya existen
Todos quedan como **Internacional, USD, sin VAT**, con su importe intacto (hoy todos se guardan en la moneda de la tarifa). Si una tarifa era en MXN, sus recargos quedan como **Local MXN sin IVA**. Nadie pierde datos; se pueden editar después.

## Lo que no cambia
- Flete base, cálculo por unidad/embarque, mínimos y ajuste a mínimo.
- Cotizaciones ya emitidas.
- Catálogo de cargos y sus códigos.

## Detalles técnicos
- Migración aditiva en `costeo_tarifa_recargos`: `ambito text not null default 'internacional' check in ('local','internacional')` y `aplica_impuesto boolean not null default false`; backfill `ambito='local'` donde `moneda='MXN'`. Check `local ⇒ moneda='MXN'`, `internacional ⇒ moneda='USD'` agregado `NOT VALID` y validado tras revisar datos. La columna `moneda` ya existe; se deja de forzar a la moneda de la tarifa.
- Actualizar `TarifaRecargosEditor.tsx` (dividir en subcomponente por bloque para mantener ≤200 líneas), tipos de recargo, `services/tarifas/queries.ts`, `topTarifas.ts`, `crm/services/pricing/tarifasRespuesta.ts`, importación Excel y el paso a `cotizacion_costos` (moneda por renglón; IVA local con `useTasaIVA`/`financialUtils`).
- Revisar que la revalidación SQL de la cotización compare por moneda del renglón; si hoy asume la moneda de la tarifa, ajustar esa función partiendo de su definición viva.
- Pruebas: reglas de ámbito→moneda, no sumar monedas distintas, IVA local con tasa configurable, backfill; `db:postcheck` y CI/RLS completos en GitHub Actions. Sin publicar.
