-- Fixture mínima aislada; cálculos y disparadores se cargan desde SQL real, no mocks.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TYPE public.estado_comision AS ENUM ('Devengada','Liquidada','Cancelada','Por recuperar');
CREATE TABLE public.crm_brokers(id uuid,organization_id uuid,activo boolean,comision_pct numeric,comision_kam_pct numeric);
CREATE TABLE public.crm_empresas(id uuid,organization_id uuid,cliente_id uuid,broker_id uuid,deleted_at timestamptz,created_at timestamptz);
CREATE TABLE public.facturas(id uuid,organization_id uuid,cliente_id uuid);
CREATE TABLE public.pagos_factura(id uuid,organization_id uuid,factura_id uuid,created_at timestamptz);
CREATE TABLE public.embarques(id uuid,modo text,tipo_servicio text,tipo_cambio_usd numeric,tipo_cambio_eur numeric);
CREATE TABLE public.embarque_contenedores(embarque_id uuid,deleted_at timestamptz);
CREATE TABLE public.conceptos_venta(embarque_id uuid,descripcion text,total numeric,moneda text,deleted_at timestamptz);
CREATE TABLE public.conceptos_costo(embarque_id uuid,concepto text,monto numeric,moneda text,deleted_at timestamptz);
CREATE TABLE public.comisiones_devengadas(id uuid,organization_id uuid,pago_factura_id uuid,factura_id uuid,embarque_id uuid,vendedora_id uuid,monto_cobrado_mxn numeric,utilidad_prorrateada_mxn numeric,porcentaje_aplicado numeric,comision_mxn numeric,estado public.estado_comision,liquidacion_id uuid,nota text,deleted_at timestamptz,estado_previo_liquidacion public.estado_comision);
CREATE TABLE public.comisiones_broker(id uuid DEFAULT gen_random_uuid(),organization_id uuid,comision_devengada_id uuid UNIQUE,pago_factura_id uuid,factura_id uuid,embarque_id uuid,broker_id uuid,utilidad_prorrateada_mxn numeric,porcentaje_aplicado numeric,comision_mxn numeric,desglose jsonb,estado public.estado_comision DEFAULT 'Devengada',updated_at timestamptz);