import { z } from "zod";
import { Constants } from "@/integrations/supabase/types";
import type { FacturaListItem } from "./facturasCrud";

const facturaPaginaSchema: z.ZodType<FacturaListItem> = z.object({
  id: z.string().min(1),
  numero: z.string(),
  cliente_nombre: z.string(),
  expediente: z.string(),
  total: z.number().finite(),
  moneda: z.enum(Constants.public.Enums.moneda),
  fecha_emision: z.string(),
  fecha_vencimiento: z.string(),
  estado: z.enum(Constants.public.Enums.estado_factura),
  proforma_id: z.string().nullable(),
  factura_pdf_url: z.string().nullable(),
  factura_xml_url: z.string().nullable(),
  ambiente: z.enum(Constants.public.Enums.ambiente_facturapi).nullable(),
  acuse_cancelacion_status: z.string().nullable(),
  cancellation_status: z.string().nullable(),
  enviada_cliente_at: z.string().nullable(),
  proformas: z.object({ numero: z.string() }).nullable(),
});

export const facturasPaginaSchema = z.object({
  rows: z.array(facturaPaginaSchema),
  count: z.number().int().nonnegative(),
});

export const clientesFacturasSchema = z.array(z.string());
