-- Casos del tabulador de brokers (USD, TC 20). Triggers apagados: sólo se prueba el cálculo.
SET session_replication_role = replica;
DO $$
DECLARE o uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  fcl uuid := gen_random_uuid(); lcl uuid := gen_random_uuid(); mix uuid := gen_random_uuid(); d jsonb; x jsonb;
BEGIN
  INSERT INTO embarques (id, organization_id, cliente_id, expediente, tipo, modo, tipo_servicio, tipo_cambio_usd) VALUES
    (fcl, o, c, 'ELIMP90001', 'Importación', 'Marítimo', 'FCL', 20), (lcl, o, c, 'ELIMP90002', 'Importación', 'Marítimo', 'LCL', 20), (mix, o, c, 'ELIMP90003', 'Importación', 'Marítimo', 'FCL', 20);
  INSERT INTO embarque_contenedores (organization_id, embarque_id) VALUES (o, fcl), (o, fcl);
  -- FCL 2 contenedores: ganancia 1,300 USD → base 1,000 → 15% = 150.
  INSERT INTO conceptos_venta (organization_id, embarque_id, descripcion, precio_unitario, total, moneda) VALUES (o, fcl, 'Flete', 3300, 3300, 'USD');
  INSERT INTO conceptos_costo (organization_id, embarque_id, concepto, monto, moneda) VALUES (o, fcl, 'Flete', 2000, 'USD');
  d := _broker_comision_embarque(fcl);
  ASSERT (d->>'comision_usd')::numeric = 150, 'FCL: ' || d::text;
  ASSERT (d->>'comision_mxn')::numeric = 3000, 'FCL MXN: ' || d::text;
  -- LCL con ganancia 100 USD: base 0, cobra el mínimo de 25.
  INSERT INTO conceptos_venta (organization_id, embarque_id, descripcion, precio_unitario, total, moneda) VALUES (o, lcl, 'Flete', 600, 600, 'USD');
  INSERT INTO conceptos_costo (organization_id, embarque_id, concepto, monto, moneda) VALUES (o, lcl, 'Flete', 500, 'USD');
  d := _broker_comision_embarque(lcl);
  ASSERT (d->>'comision_usd')::numeric = 25, 'LCL mínimo: ' || d::text;
  -- FCL sin mínimo y ganancia 100: comisión 0. Más despacho aduanal (ganancia 400 → base 250 → 37.5).
  INSERT INTO conceptos_venta (organization_id, embarque_id, descripcion, precio_unitario, total, moneda) VALUES
    (o, mix, 'Flete', 1100, 1100, 'USD'), (o, mix, 'Despacho aduanal', 10000, 10000, 'MXN');
  INSERT INTO conceptos_costo (organization_id, embarque_id, concepto, monto, moneda) VALUES
    (o, mix, 'Flete', 1000, 'USD'), (o, mix, 'Honorarios despacho', 2000, 'MXN');
  d := _broker_comision_embarque(mix);
  ASSERT (d->>'comision_usd')::numeric = 37.5, 'Mixto: ' || d::text;
  ASSERT jsonb_array_length(d->'servicios') = 2, 'Mixto servicios: ' || d::text;
  -- Abono de la mitad de la venta (venta 32,000 MXN): la mitad de 750 MXN.
  x := _broker_monto_renglon(mix, 16000);
  ASSERT (x->>'monto')::numeric = 375, 'Abono: ' || x::text;
  ASSERT NOT has_function_privilege('authenticated', '_broker_comision_embarque(uuid)', 'EXECUTE'), 'helper expuesto';
  RAISE NOTICE 'broker-tabulador: 7 casos OK';
END $$;
