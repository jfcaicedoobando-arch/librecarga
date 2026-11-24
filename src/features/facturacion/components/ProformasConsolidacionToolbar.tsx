import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTasaIVA } from "@/features/catalogos/hooks/useTasaIVA";
import { useConsolidarProformasFiscales } from "@/features/proformas/hooks";
import type { ProformaConFactura } from "@/features/proformas/services";
import { scopeDePayload, usePayloadRequestId } from "@/lib/idempotency";

interface Props {
  proformas: ProformaConFactura[];
  onConsolidada: () => void;
}

function causaIncompatibilidad(proforma: ProformaConFactura, primera: ProformaConFactura) {
  if (proforma.evaluacion_fiscal == null) return "no tiene evaluación fiscal";
  if (proforma.es_consolidada) return "ya está consolidada";
  if (proforma.organization_id !== primera.organization_id) return "pertenece a otra organización";
  if (proforma.embarque_id !== primera.embarque_id) return "tiene un embarque distinto";
  if (proforma.cliente_id !== primera.cliente_id) return "corresponde a otro cliente";
  if (proforma.dias_credito !== primera.dias_credito) return "tiene un plazo de crédito distinto";
  return null;
}

function motivoSeleccion(proformas: ProformaConFactura[], primera: ProformaConFactura) {
  for (const proforma of proformas) {
    const causa = causaIncompatibilidad(proforma, primera);
    if (causa) return `${proforma.numero ?? "La proforma seleccionada"} ${causa}.`;
  }
  if (!primera.embarque_id) return `${primera.numero ?? "La proforma seleccionada"} no tiene un embarque asociado.`;
  return null;
}

export function ProformasConsolidacionToolbar({ proformas, onConsolidada }: Props) {
  const navigate = useNavigate();
  const tasaIva = useTasaIVA();
  const solicitud = usePayloadRequestId();
  const { mutateAsync, isPending } = useConsolidarProformasFiscales();
  const primera = proformas[0];
  if (!primera) return null;
  const motivo = motivoSeleccion(proformas, primera);

  const consolidar = async () => {
    if (motivo || proformas.length < 2 || !primera.embarque_id) return;
    const ids = proformas.map((p) => p.id).sort();
    const resultado = await mutateAsync({
      organizationId: primera.organization_id,
      proformaIds: ids,
      embarqueId: primera.embarque_id,
      clienteId: primera.cliente_id,
      clienteNombre: primera.cliente_nombre,
      expediente: primera.expediente,
      blMaster: primera.bl_master,
      operador: primera.operador,
      diasCredito: primera.dias_credito,
      tasaIva,
      requestId: solicitud.get(scopeDePayload([primera.organization_id, ...ids])),
    }).catch(() => null);
    if (!resultado) return;
    solicitud.reset();
    onConsolidada();
    void navigate(`/proformas/${resultado.id}`);
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex-1 text-body-sm">
          <strong>{proformas.length}</strong> {proformas.length === 1 ? "proforma seleccionada" : "proformas seleccionadas"}
          {motivo && <p role="alert" className="text-destructive">{motivo}</p>}
          {proformas.length === 1 && <p>Selecciona al menos dos proformas para consolidar.</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onConsolidada} disabled={isPending}>Limpiar</Button>
        <Button size="sm" onClick={consolidar} loading={isPending}
          disabled={Boolean(motivo) || proformas.length < 2 || isPending}>
          Consolidar proformas
        </Button>
      </CardContent>
    </Card>
  );
}
