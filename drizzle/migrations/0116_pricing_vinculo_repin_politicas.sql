DO $mig$
DECLARE
  v_def text;
  v_i int;
  v_j int;
  v_blk text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
     AND p.proname='crm_vincular_cotizacion_cliente_pricing';
  v_i := strpos(v_def, '$policies$');
  v_j := v_i + 10 + strpos(substr(v_def, v_i + 10), '$policies$') - 1;
  v_blk := substr(v_def, v_i, v_j - v_i);
  IF strpos(v_blk, 'has_role(auth.uid(), ''cliente''::app_role) AND (cliente_id IN') = 0
     OR strpos(v_blk, '(created_by = auth.uid()))') = 0 THEN
    RAISE EXCEPTION 'repin: texto esperado no encontrado';
  END IF;
  v_blk := replace(v_blk, 'has_role(auth.uid(), ''cliente''::app_role) AND (cliente_id IN',
                          'has_role(( SELECT auth.uid() AS uid), ''cliente''::app_role) AND (cliente_id IN');
  v_blk := replace(v_blk, '(created_by = auth.uid()))', '(created_by = ( SELECT auth.uid() AS uid)))');
  EXECUTE substr(v_def, 1, v_i - 1) || v_blk || substr(v_def, v_j);
END
$mig$;