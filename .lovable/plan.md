# Mostrar los cargos de la tarifa sin el código en "Costos y utilidad"

## Qué pasa hoy
Los recargos de la tarifa se guardan con su código del catálogo ("AGR-OA · Cargos en origen Agente"). Al cargarlos en el paso 2 de la cotización, ese texto completo llega al selector de concepto. Como el selector busca ese nombre exacto en el catálogo de productos y no lo encuentra, lo pinta en ámbar con un triángulo de aviso, como si fuera un concepto viejo o inválido. Pasa con cualquier recargo con código, no sólo "Cargos en origen".

## Cambio
- En el selector de concepto de las filas de costos/venta, mostrar el nombre sin el prefijo de código ("Cargos en origen Agente").
- Al buscar el producto del catálogo, comparar también con el nombre sin código, para que no aparezca el aviso ámbar cuando el concepto sí existe.
- Si el concepto (ya sin código) tampoco existe en el catálogo de productos, se mantiene el aviso, porque sí indica que falta darlo de alta para facturar.
- El texto guardado no cambia (la revalidación de tarifas y el historial dependen de él). El resumen y PDF del cliente siguen mostrando el código como hoy.

## Detalles técnicos
- `ProductoServicioSelect.tsx`: usar un helper `quitarCodigoCargo(texto)` (basado en `codigoDeConcepto` de `costeo/domain/catalogoCargos`) para el texto visible y para el lookup `porNombre.get(...)` (probar texto completo y luego sin código).
- Prueba unitaria del helper: "AGR-OA · Cargos en origen Agente" → "Cargos en origen Agente"; texto sin código queda igual.
- Sin migraciones ni cambios en `buildCostosDesdeTarifa`.
