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

export function ProformasConsolidacionToolbar({ proformas, onConsolidada }: Props) {
  const navigate = useNavigate();
  const tasaIva = useTasaIVA();
  const solicitud = usePayloadRequestId();
  const { mutateAsync, isPending } = useConsolidarProformasFiscales();
  const primera = proformas[0];
  if (!primera) return null;
  const compatibles = proformas.every((p) => p.evaluacion_fiscal != null && !p.es_consolidada
    && p.organization_id === primera.organization_id && p.embarque_id === primera.embarque_id
    && p.cliente_id === primera.cliente_id && p.dias_credito === primera.dias_credito);

  const consolidar = async () => {
    if (!compatibles || proformas.length < 2 || !primera.embarque_id) return;
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
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex-1 text-body-sm">
          <strong>{proformas.length}</strong> {proformas.length === 1 ? "proforma seleccionada" : "proformas seleccionadas"}
          {!compatibles && <p role="alert" className="text-destructive">Selecciona proformas fiscales del mismo embarque, cliente y plazo de crédito.</p>}
          {proformas.length === 1 && <p>Selecciona al menos dos proformas para consolidar.</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onConsolidada} disabled={isPending}>Limpiar</Button>
        <Button size="sm" onClick={consolidar} loading={isPending}
          disabled={!compatibles || proformas.length < 2 || isPending}>
          Consolidar proformas
        </Button>
      </CardContent>
    </Card>
  );
}
