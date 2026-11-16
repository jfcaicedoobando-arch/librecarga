import { FACTURAPI_BASE } from "./facturapiAuth.ts";
import { describeFacturapiError, withFacturapiTimeout } from "./facturapiClient.ts";
import { asFacturapiApi, exigirOperacion } from "./facturapiSdk.ts";
import type { DocumentoFacturapiIsr } from "./conciliarCfdiIsr.ts";
import { esIdempotencyKeyEnUso } from "./timbradoPendiente.ts";

export function prepararSolicitudTimbradoIsr(cliente: unknown) {
  const crear = exigirOperacion<(payload: unknown) => Promise<DocumentoFacturapiIsr>>(
    asFacturapiApi(cliente), "invoices.create",
  );
  return async (payload: object, claim: string) => {
    try {
      const remoto = await withFacturapiTimeout("invoices.create", crear({ ...payload, external_id: claim, idempotency_key: claim }));
      if (remoto) return { tipo: "respuesta", remoto } as const;
      return { tipo: "sin_cfdi", estado: "pendiente", datos: { motivo: "respuesta_vacia" }, httpStatus: undefined } as const;
    } catch (fallo) {
      const { status, detail } = describeFacturapiError(fallo);
      const rechazo = [400, 401, 403, 422, 429].includes(status) && !esIdempotencyKeyEnUso(detail, status);
      return { tipo: "sin_cfdi", estado: rechazo ? "rechazado" : "pendiente",
        datos: { http_status: status, motivo: rechazo ? "rechazo_facturapi" : "respuesta_incierta" }, httpStatus: status } as const;
    }
  };
}

export function datosTimbradoConfirmado(remoto: DocumentoFacturapiIsr) {
  const ruta = `${FACTURAPI_BASE}/invoices/${remoto.id}`;
  return { facturapi_id: remoto.id, uuid: remoto.uuid?.toUpperCase(), folio: remoto.folio_number,
    serie: remoto.series ?? "", pdf_url: ruta + "/pdf", xml_url: ruta + "/xml" };
}
