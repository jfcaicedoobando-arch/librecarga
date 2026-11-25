/** Wizard de factura manual (sin embarque/proforma). v13.315.2: rediseño UI. */
import { FilePlus2 } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogFooterActions } from "@/components/shared/FormDialogFooter";
import { FormDialogCancelarBoton } from "@/components/shared/FormDialogCancelarBoton";
import { FormDialogSection } from "@/components/shared/FormDialogSection";
import { CreditoExcesoConfirmDialog } from "./CreditoExcesoConfirmDialog";
import { useFacturaManualForm } from "@/features/facturacion/hooks/useFacturaManualForm";
import { FacturaManualDatosFiscales } from "./FacturaManualDatosFiscales";
import { FaltantesHint } from "./FaltantesHint";
import { FacturaManualConceptosTable } from "./FacturaManualConceptosTable";
import { calcularTotalesConceptos } from "@/features/facturacion/utils/totalesConceptos";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type ClienteFormProps = Pick<ReturnType<typeof useFacturaManualForm>,
  "clientes" | "consultaClientes" | "cliente" | "clienteIncompleto" | "onClienteChange">;

function ClienteFacturaManualFields({ clientes, consultaClientes, cliente, clienteIncompleto, onClienteChange }: ClienteFormProps) {
  return (
    <FormDialogSection flat title="Información del cliente">
      <div className="space-y-2">
        <Label htmlFor="factura-manual-cliente">Cliente *</Label>
        <Select value={cliente?.id ?? ""} onValueChange={onClienteChange} disabled={consultaClientes.isLoading || consultaClientes.isError}>
          <SelectTrigger id="factura-manual-cliente">
            <SelectValue placeholder={consultaClientes.isLoading ? "Consultando clientes…" : "Selecciona un cliente"} />
          </SelectTrigger>
          <SelectContent>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre} {c.rfc ? `· ${c.rfc}` : "· sin RFC"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {consultaClientes.isError ? (
          <ErrorStateInline
            title="No se pudieron consultar los clientes"
            message="Reintenta para continuar con los conceptos ya capturados."
            onRetry={() => void consultaClientes.refetch()}
            retrying={consultaClientes.isFetching}
          />
        ) : !consultaClientes.isLoading && clientes.length === 0 ? (
          <EmptyStateInline message="No hay clientes disponibles." density="compact" />
        ) : null}
        {clienteIncompleto && (
          <Alert variant="destructive">
            <AlertDescription>
              Este cliente no tiene datos fiscales completos (RFC, CP y régimen).
              Puedes guardar borrador, pero no podrás timbrar hasta completarlos en el detalle del cliente.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </FormDialogSection>
  );
}

export function DialogNuevaFacturaManual({ open, onOpenChange }: Props) {
  const {
    clientes, consultaClientes, cliente, receptor, clienteIncompleto, onClienteChange,
    fiscal, updateFiscal, tasaIva,
    conceptos, setConceptos,
    notas, setNotas,
    isDirty, reset,
    creditoAlerta, setCreditoAlerta,
    puedeGuardar, puedeTimbrar, faltantesTimbrar, totalCero,
    handleSubmit, onConfirmarExceso, isPending,
  } = useFacturaManualForm(open, () => onOpenChange(false));

  const totales = calcularTotalesConceptos(conceptos, tasaIva);
  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const footer = (
    <FormDialogFooterActions
      help={!puedeTimbrar && faltantesTimbrar.length > 0 && <FaltantesHint items={faltantesTimbrar} />}
      cancel={<FormDialogCancelarBoton onCancelar={() => handleOpenChange(false)} disabled={isPending} />}
      secondary={
        <Button type="button" variant="secondary" onClick={() => handleSubmit(false)} disabled={!puedeGuardar || isPending}>
          Guardar borrador
        </Button>
      }
      primary={
        <Button type="button" onClick={() => handleSubmit(true)} disabled={!puedeTimbrar || isPending}>
          {isPending ? "Procesando…" : "Crear y timbrar"}
        </Button>
      }
    />
  );

  return (
    <FormDialogShell
      open={open} onOpenChange={handleOpenChange} icon={FilePlus2}
      title="Nueva factura manual"
      description="Para anticipos, servicios extra o cobros que no provienen de un embarque cerrado. Lo normal es facturar desde una proforma aprobada."
      size="3xl" footer={footer}
      // El concepto vacío inicial no cuenta como captura; Cancelar/X/ESC comparten guarda.
      isDirty={isDirty}
      busy={isPending}
    >
      <div className="space-y-5">
        <ClienteFacturaManualFields
          clientes={clientes}
          consultaClientes={consultaClientes}
          cliente={cliente}
          clienteIncompleto={clienteIncompleto}
          onClienteChange={onClienteChange}
        />

        <FormDialogSection flat title="Datos fiscales">
          <FacturaManualDatosFiscales
            receptor={receptor}
            value={fiscal} onChange={updateFiscal} diasReadonly={!!cliente}
            diasReadonlyReason={cliente ? "Los días de crédito se toman del perfil del cliente. Cámbialos en el detalle del cliente." : undefined}
          />
        </FormDialogSection>

        <FacturaManualConceptosTable
          conceptos={conceptos} moneda={fiscal.moneda} onChange={setConceptos}
        />

        <div className="grid gap-5 md:grid-cols-2">
          <FormDialogSection flat title="Notas internas">
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              placeholder="Añadir notas u observaciones (opcional)…"
              className="resize-none"
            />
          </FormDialogSection>
          <div className="rounded-lg bg-primary text-primary-foreground p-6 shadow-raised flex flex-col justify-center gap-3">
            <div className="flex justify-between text-body opacity-80">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(totales.subtotal, fiscal.moneda)}</span>
            </div>
            <div className="flex justify-between text-body opacity-80">
              {/* P2-IVA: los renglones pueden llevar tratamientos distintos (16%, 8%,
                  tasa 0%, exento, no objeto): el pie no afirma una sola tasa. */}
              <span>IVA total</span>
              <span className="tabular-nums">{formatCurrency(totales.iva, fiscal.moneda)}</span>
            </div>
            <div className="pt-3 border-t border-primary-foreground/20 flex justify-between items-baseline">
              <span className="text-base font-medium">Total</span>
              <span className="text-kpi tabular-nums">
                {formatCurrency(totales.total, fiscal.moneda)}
              </span>
            </div>
            {totalCero && <p className="text-body-sm">El total debe ser mayor a cero.</p>}
          </div>
        </div>

        <CreditoExcesoConfirmDialog
          alerta={creditoAlerta} clienteNombre={cliente?.nombre}
          onOpenChange={(o) => { if (!o) setCreditoAlerta(null); }}
          onConfirm={onConfirmarExceso}
        />
      </div>
    </FormDialogShell>
  );
}
