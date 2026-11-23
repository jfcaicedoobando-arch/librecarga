-- Aislamiento de las cinco ramas de bitácora; conserva importes y proyección.
DO $review$ DECLARE v_def text; BEGIN
 v_def := pg_get_functiondef('public.actividad_embarque(uuid)'::regprocedure);
 IF md5(v_def) <> 'db0e0b27e33dccea3db1014cda97643e' THEN RAISE EXCEPTION 'La definición de actividad cambió; requiere revisión'; END IF;
 v_def := replace(v_def,$old$WHERE b.entidad_id = p_embarque_id
       OR (b.entidad_id IS NULL AND v_exp IS NOT NULL AND b.entidad_nombre = v_exp)$old$,$new$WHERE b.organization_id = v_org
      AND (b.entidad_id = p_embarque_id
           OR (b.entidad_id IS NULL AND v_exp IS NOT NULL AND b.entidad_nombre = v_exp))$new$);
 v_def := replace(v_def,$old$WHERE v_cot IS NOT NULL AND b.entidad_id = v_cot$old$,$new$WHERE b.organization_id = v_org AND v_cot IS NOT NULL AND b.entidad_id = v_cot$new$);
 v_def := replace(v_def,$old$WHERE b.entidad_id IN (SELECT pr.id FROM prof_emb pr)$old$,$new$WHERE b.organization_id = v_org AND b.entidad_id IN (SELECT pr.id FROM prof_emb pr)$new$);
 v_def := replace(v_def,$old$WHERE b.entidad_id IN (SELECT f.id FROM facturas_emb f)$old$,$new$WHERE b.organization_id = v_org AND b.entidad_id IN (SELECT f.id FROM facturas_emb f)$new$);
 v_def := replace(v_def,$old$WHERE b.entidad_id IN (SELECT pf.id FROM pf_emb pf)$old$,$new$WHERE b.organization_id = v_org AND b.entidad_id IN (SELECT pf.id FROM pf_emb pf)$new$);
 EXECUTE v_def;
END $review$;