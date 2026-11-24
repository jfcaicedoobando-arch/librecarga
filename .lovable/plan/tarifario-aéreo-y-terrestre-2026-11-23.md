# Tarifario aéreo y terrestre

## Problema
Hoy una tarifa exige naviera, ruta marítima y tipo de contenedor. Por eso no se pueden guardar tarifas aéreas ni terrestres, y el flete de esas cotizaciones sale fijo o se captura a mano.

## Qué vas a ver
1. **Alta de tarifa con modo**: Marítimo (igual que hoy), Aéreo o Terrestre.
2. **Aéreo**: aeropuerto origen y destino (catálogo IATA del CSV que compartiste), aerolínea (texto), precio por kg con tramos de peso (+45, +100, +300, +500, +1000 kg) y mínimo por embarque.
3. **Terrestre**: origen y destino por código postal o ciudad, submodalidad FTL / LTL / Arrastre, tipo de unidad (caja seca 53', thorton, rabón, plataforma, refrigerada), precio por viaje (FTL/Arrastre) o por kg/m³ con mínimo (LTL).
4. **Recargos**: se reutiliza el editor actual (base por unidad o por embarque, moneda propia).
5. **Bandeja de Pricing y Top 3**: sugerencias de tarifas del mismo modo y ruta, comparando sólo igual moneda.
6. **Cotización**: la cantidad deja de ser "número de contenedores":
   - Aéreo: peso tasable = mayor entre peso real y volumen x 167 kg/m³; se aplica el tramo correspondiente y el mínimo.
   - Terrestre: viajes (FTL/Arrastre) o peso/volumen (LTL) con mínimo.

## Qué NO cambia
- Tarifas marítimas existentes, sus aprobaciones, demoras y garantías.
- Márgenes, IVA, retenciones e importes de cotizaciones ya guardadas.

## Detalles técnicos
- Tabla nueva `aeropuertos` (catálogo global, lectura para autenticados) cargada desde el CSV.
- `costeo_tarifas`: columna `modo` (default Marítimo); `naviera_id`, `ruta_id`, `tipo_contenedor_id` pasan a opcionales sólo con CHECK que los exige cuando modo = Marítimo.
- Columnas nuevas: aeropuerto origen/destino, aerolínea, CP/ciudad origen y destino, submodalidad, tipo de unidad, mínimo, y tabla hija `costeo_tarifa_tramos` (desde_kg, precio) con RLS por organización.
- RPCs de crear/actualizar tarifa validan obligatorios por modo en servidor.
- Frontend: formulario por modo en componentes ≤200 líneas; funciones puras `pesoTasable()` y `precioPorTramo()` con pruebas.
- Se entrega en 3 pasos: (a) base + aéreo, (b) terrestre, (c) Top 3 y cotización.

## Decisiones a confirmar
- Factor volumétrico aéreo 1:6000 (167 kg/m³).
- Tramos de peso estándar listados arriba.
