# Cerrar los detalles de la Fase 3 (Aéreo)

Cuatro mejoras, en este orden (de menor a mayor riesgo):

## 1. Escalón más barato (regla "As Higher Weight")
- Al calcular el flete aéreo, comparar el costo del tramo real contra el costo de cobrar el mínimo del siguiente tramo; usar el más barato.
- Ejemplo: 95 kg a USD 6.00 = 570; 100 kg a USD 5.00 = 500 → se cobra 500 y se indica "Calculado como 100 kg".
- Los recargos por kg siguen usando el peso real (no cambia la corrección anterior).
- Pruebas con valores concretos (95 kg, 45 kg exactos, peso que no conviene subir).

## 2. Respuesta aérea sin tarifa previa
- En la respuesta de Pricing de una solicitud aérea, "Agregar tarifa" abre el formulario aéreo (aerolínea, aeropuertos IATA, tramos, mínimo, recargos) en vez del marítimo.
- Reutiliza el formulario del tarifario aéreo ya existente; sin tablas nuevas.

## 3. Escalas y tránsito
- En la tarifa aérea: casilla "Vuelo directo / con escala", aeropuerto(s) de conexión (IATA) y días de tránsito.
- Se muestran en las sugerencias de la bandeja y en el resumen de la cotización.
- Requiere agregar columnas opcionales a las tarifas (cambio de base pequeño).

## 4. Bultos de medidas distintas
- En la solicitud aérea, permitir varias líneas de bultos (cantidad × largo × ancho × alto, cm).
- Suma CBM, peso volumétrico (1:6000) y tasable de todas las líneas.
- Se guarda el detalle en la solicitud (columna opcional); las solicitudes viejas con un solo grupo siguen funcionando.

## Detalles técnicos
- Cálculo puro en `domain/tarifaPorPeso.ts` con pruebas unitarias.
- Migraciones Drizzle nuevas sólo para puntos 3 y 4 (columnas nullable, sin tocar históricos).
- Pruebas focalizadas de Pricing/cotización; CI completo queda en GitHub. Sin publicar.
