# Nuevo esquema de comisiones de brokers

Sólo cambia lo que cobra el **broker**. Vendedores y KAM (incluido el % del KAM en cuentas de broker) siguen exactamente igual.

## Reglas acordadas

1. **Ganancia por servicio** = venta − costo de cada servicio del embarque, en USD.
2. **Retención Elogistix**: se descuentan \$150 USD por operación (por contenedor en FCL/FTL, por embarque en LCL, aéreo y LTL, por servicio en despacho aduanal). La base nunca queda negativa.
3. **Tasa por servicio** sobre la base:

| Servicio | Unidad | % | Mínimo por unidad |
|---|---|---|---|
| Marítimo FCL | Contenedor | 15% | Sin mínimo |
| Marítimo LCL | Embarque | 15% | \$25 USD |
| Aéreo | Embarque | 15% | \$25 USD |
| Despacho aduanal | Servicio | 15% | \$25 USD |
| Terrestre FTL | Contenedor/viaje | 10% | \$20 USD |
| Terrestre LTL | Embarque | 10% | \$20 USD |

4. **Mínimo garantizado**: comisión = el mayor entre (base × %) y el mínimo, **aunque la base sea cero**.
5. **Embarques mixtos**: cada servicio con su propia tasa, retención y mínimo; la comisión del embarque es la suma.
6. **Momento**: la comisión total del embarque se reparte proporcionalmente a cada abono del cliente, como hoy.
7. **Históricos**: se recalculan las comisiones de broker **no liquidadas**; las liquidadas o pagadas no se tocan.
8. El porcentaje único por broker deja de usarse para calcular (se conserva como dato histórico).

## Cómo se verá

- En el portal del broker y en la administración de comisiones: desglose por servicio (ganancia, retención, base, %, mínimo aplicado y comisión), en USD con su equivalente en MXN.
- La pantalla para configurar el % del broker se reemplaza por la vista del tabulador (fijo, no editable).

## Punto a confirmar durante la implementación

Hoy los conceptos de venta y costo de un embarque **no indican a qué servicio pertenecen**. Propuesta:
- El flete se clasifica con el modo y tipo del embarque (FCL/LCL, aéreo, FTL/LTL).
- Los conceptos de despacho aduanal se identifican con su clave SAT de servicio aduanal; si no hay forma confiable, se agrega una marca "Despacho aduanal" al capturar el concepto.
- Conceptos sin clasificar se suman al flete principal.

## Detalles técnicos

- Nueva migración: tabulador como función inmutable `_broker_tabulador(servicio)`, función `_broker_comision_embarque(embarque)` que calcula por servicio en USD (TC del embarque) y devuelve desglose; `_comision_broker_sync` usa `comision_embarque × (utilidad prorrateada del pago / utilidad total del embarque)` en lugar de `comision_pct`. `calcular_comision_pago` y `_comision_kam_broker` no se tocan.
- Columna `desglose jsonb` en `comisiones_broker`; `broker_mis_comisiones` y `crm_brokers_comisiones_resumen` la exponen.
- RPC de recálculo una sola vez (sólo renglones en estado devengada, sin liquidación), idempotente y auditada en bitácora.
- `crm_broker_set_porcentajes` sigue ajustando el % del KAM; `comision_pct` marcado como DEPRECATED.
- Pruebas: SQL focalizado (mínimo con base cero, FCL sin mínimo, mixto, abonos parciales, liquidadas intactas) y pruebas de UI del desglose. CI/RLS completos en GitHub Actions. Sin publicar.
