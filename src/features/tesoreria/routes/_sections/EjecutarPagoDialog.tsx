/**
 * Diálogo "Ejecutar pago" de la bandeja de pagos programados.
 * Extraído de `TesoreriaPagosProgramados` para bajar su tamaño/complejidad.
 */
import { Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PagoProgramadoTipoCambio } from "./PagoProgramadoTipoCambio";
import { esPagoEfectivo } from "@/features/tesoreria/domain/conciliacionPago";
import { erroresPagoProgramado } from "@/features/tesoreria/domain/pagoProgramadoValidacion";
import { todayLocalISO } from "@/lib/date/today";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Label } from "@/components/ui/label";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { FormDialogFooter } from "@/components/shared/FormDialogFooter";
import { formatCurrency } from "@/lib/formatters";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

import type { FacturaProgramable } from "@/features/tesoreria/domain/pagosProgramados";
import type { CuentaBancaria } from "@/features/tesoreria/services";
import type { useCuentasBancarias } from "@/features/tesoreria/hooks/useTesoreriaCuentas";

export interface FormPago {
  cuentaBancariaId: string;
  fecha: string;
  monto: number;
  metodoPago: string;
  referencia: string;
  tipoCambio?: number | null;
}

type ConsultaCuentas = Pick<ReturnType<typeof useCuentasBancarias>, "isLoading" | "isError" | "isFetching" | "refetch">;

interface Props {
  facturaPago: FacturaProgramable | null;
  onClose: () => void;
  cuentasCompatibles: CuentaBancaria[];
  consultaCuentas: ConsultaCuentas;
  form: FormPago;
  setField: <K extends keyof FormPago>(key: K, value: FormPago[K]) => void;
  onEjecutar: () => void;
  isDirty?: boolean;
  isPending: boolean;
}

const FORM_ID = "form-ejecutar-pago";

function cuentaElegible(consulta: ConsultaCuentas, cuentas: CuentaBancaria[], cuentaId: string) {
  return !consulta.isError && !consulta.isLoading && cuentas.some((cuenta) => cuenta.id === cuentaId);
}

function CampoCuenta({ cuentas, consulta, moneda, value, onChange }: {
  cuentas: CuentaBancaria[];
  consulta: ConsultaCuentas;
  moneda?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const sinOpciones = consulta.isLoading || consulta.isError || cuentas.length === 0;
  return (
    <div className="sm:col-span-2 space-y-1">
      <Label htmlFor="pago-cuenta">Cuenta bancaria *</Label>
      <Select value={value} onValueChange={onChange} disabled={sinOpciones}>
        <SelectTrigger id="pago-cuenta" aria-describedby={sinOpciones ? "pago-cuenta-estado" : undefined}>
          <SelectValue placeholder="Selecciona cuenta…" />
        </SelectTrigger>
        <SelectContent>
          {cuentas.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.banco} · {c.alias} ({c.moneda})</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sinOpciones && (
        <div id="pago-cuenta-estado">
          {consulta.isError ? (
            <ErrorStateInline
              title="No pudimos cargar las cuentas bancarias"
              message="Reintenta para consultar las cuentas de esta moneda."
              onRetry={() => void consulta.refetch()}
              retrying={consulta.isFetching}
            />
          ) : (
            <p role="status" className="text-body-sm text-muted-foreground">
              {consulta.isLoading ? "Cargando cuentas bancarias…" : `Sin cuentas en ${moneda}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EjecutarPagoDialog({
  facturaPago, onClose, cuentasCompatibles, consultaCuentas, form, setField, onEjecutar, isDirty, isPending,
}: Props) {
  const efectivo = esPagoEfectivo(form.metodoPago);
  const hoy = todayLocalISO();
  const moneda = facturaPago?.moneda ?? "MXN";
  const errores = erroresPagoProgramado(form, facturaPago ?? { moneda: "MXN" }, hoy);
  const cuentaValida = cuentaElegible(consultaCuentas, cuentasCompatibles, form.cuentaBancariaId);
  const puedeEjecutar = !!facturaPago && Object.keys(errores).length === 0 && (efectivo || cuentaValida);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!puedeEjecutar || isPending) return;
    onEjecutar();
  };

  return (
    <FormDialogShell
      open={!!facturaPago}
      onOpenChange={(v) => { if (!v) onClose(); }}
      icon={Wallet}
      title="Registrar pago realizado"
      description={
        facturaPago
          ? `Factura ${facturaPago.folio_proveedor || "sin folio"} · ${facturaPago.proveedor_nombre ?? "Proveedor"} · Saldo ${formatCurrency(facturaPago.saldo, facturaPago.moneda)}`
          : undefined
      }
      formId={FORM_ID}
      onSubmit={handleSubmit}
      isDirty={isDirty}
      busy={isPending}
      bodyClassName="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:space-y-0"
      footer={
        <FormDialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          confirmLabel="Registrar pago"
          loading={isPending}
          disabled={!puedeEjecutar || isPending}
        />
      }
    >
      <p className="sm:col-span-2 text-body-sm text-muted-foreground">Registra un pago ya realizado y aplícalo a la factura. El ERP no envía dinero al banco.</p>
      {efectivo ? (
        <p className="sm:col-span-2 text-body-sm text-muted-foreground">Efectivo: se registra sin cuenta ni movimiento bancario.</p>
      ) : (
        <CampoCuenta
          cuentas={cuentasCompatibles}
          consulta={consultaCuentas}
          moneda={moneda}
          value={form.cuentaBancariaId}
          onChange={(valor) => setField("cuentaBancariaId", valor)}
        />
      )}
      <div>
        <Label htmlFor="pago-fecha">Fecha *</Label>
        <DatePickerMx id="pago-fecha" value={form.fecha} onChange={(v) => setField("fecha", v)} className="w-full" min={facturaPago?.fecha_emision ?? undefined} max={hoy} errorText={errores.fecha} />
      </div>

      <div>
        <Label htmlFor="pago-monto">Monto *</Label>
        <MoneyInput
          id="pago-monto"
          value={form.monto}
          onChange={(n: number) => setField("monto", n)}
          currency={moneda}
          aria-invalid={!!errores.monto}
          aria-describedby={errores.monto ? "pago-monto-error" : undefined}
        />
        {errores.monto && <p id="pago-monto-error" role="alert" className="text-body-sm text-destructive">{errores.monto}</p>}
      </div>
      <div>
        <Label htmlFor="pago-metodo">Medio de pago</Label>
        <Select value={form.metodoPago} onValueChange={(v) => setField("metodoPago", v)}>
          <SelectTrigger id="pago-metodo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Transferencia">Transferencia</SelectItem>
            <SelectItem value="Cheque">Cheque</SelectItem>
            <SelectItem value="Efectivo">Efectivo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <PagoProgramadoTipoCambio moneda={moneda} monto={form.monto}
        tipoCambio={form.tipoCambio} error={errores.tipoCambio} onChange={(v) => setField("tipoCambio", v)} />
      <div>
        <Label htmlFor="pago-referencia">Referencia</Label>
        <Input id="pago-referencia" value={form.referencia} onChange={(e) => setField("referencia", e.target.value)} />
        </div>
    </FormDialogShell>
  );
}
