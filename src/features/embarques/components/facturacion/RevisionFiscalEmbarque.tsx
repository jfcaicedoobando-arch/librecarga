import { useState } from "react";
import Decimal from "decimal.js";
import { FileCheck2 } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import type { PropuestaRevisionFiscalEmbarque } from "../../services/evaluacionFiscalEmbarque";
import { DesgloseFiscalEmbarque } from "./DesgloseFiscalEmbarque";

const monedas = ["MXN", "USD"] as const;

interface Props {
  propuesta: PropuestaRevisionFiscalEmbarque;
  clientes: { id: string; nombre: string }[];
  responder: (motivo: string | null) => void;
}

export function RevisionFiscalEmbarque({ propuesta, ...props }: Omit<Props, "propuesta"> & { propuesta: Props["propuesta"] | null }) {
  return propuesta ? <DialogoRevisionFiscalEmbarque propuesta={propuesta} {...props} /> : null;
}

function DialogoRevisionFiscalEmbarque({ propuesta, clientes, responder }: Props) {
  const [motivo, setMotivo] = useState("");
  const { antes, despues, puede_autorizar } = propuesta;
  const nombreCliente = (id: string | null) => clientes.find((cliente) => cliente.id === id)?.nombre ?? "Cliente sin identificar";

  return (
    <FormDialogShell
      open
      onOpenChange={(open) => { if (!open) responder(null); }}
      icon={FileCheck2}
      title="Revisión fiscal del embarque"
      description="Compara el desglose guardado con el de los cambios que vas a aplicar."
      size="2xl"
      footer={<>
        <Button type="button" variant="outline" onClick={() => responder(null)}>{puede_autorizar ? "Cancelar" : "Cerrar"}</Button>
        {puede_autorizar && <Button type="button" disabled={motivo.trim().length < 10}
          onClick={() => responder(motivo.trim())}>Autorizar y guardar</Button>}
      </>}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-body-sm">Cliente anterior · {nombreCliente(antes.cliente_id)}</p>
          <DesgloseFiscalEmbarque fiscal={antes} />
        </div>
        <div className="space-y-2">
          <p className="text-body-sm">Cliente propuesto · {nombreCliente(despues.cliente_id)}</p>
          <DesgloseFiscalEmbarque fiscal={despues} preview />
        </div>
        <dl className="space-y-1 text-body-sm">
          {monedas.map((moneda) => {
            const anterior = antes.bloques.find((b) => b.moneda === moneda);
            const propuesta = despues.bloques.find((b) => b.moneda === moneda);
            if (!anterior && !propuesta) return null;
            const delta = new Decimal(propuesta?.total ?? 0).minus(anterior?.total ?? 0).toNumber();
            return <div key={moneda} className="flex justify-between gap-4">
              <dt>Diferencia del neto {moneda}</dt>
              <dd className="tabular-nums">{delta > 0 ? "+" : ""}{formatCurrency(delta, moneda)}</dd>
            </div>;
          })}
        </dl>
        {puede_autorizar ? <div className="space-y-2">
          <Label htmlFor="motivo-revision-embarque">Motivo de la revisión (mínimo 10 caracteres)</Label>
          <Textarea id="motivo-revision-embarque" value={motivo} maxLength={500} onChange={(event) => setMotivo(event.target.value)} />
        </div> : <p role="status" className="text-body-sm">Pide a Administración o Contabilidad que autorice este cambio.</p>}
      </div>
    </FormDialogShell>
  );
}
