/**
 * Cuerpo del formulario para DialogRegistrarPagoProveedor.
 * Extraído v12.95.23 para mantener el dialog ≤200 LOC.
 */
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormSection } from "./facturaFormPrimitives";
import { PagoSaldoRestante } from "./PagoProveedorBits";
import { referenciaHint } from "./pagoProveedorHelpers";
import { formatNumber } from "@/lib/formatters";
import { PagoImpactoPreview } from "./PagoImpactoPreview";
import { TcPagoField } from "./TcPagoField";
import { PagoProveedorCuentaField } from "./PagoProveedorCuentaField";
import { PagoProveedorDiferenciaField } from "./PagoProveedorDiferenciaField";
import type {
  Moneda,
  PagoProveedorFormBodyProps as Props,
} from "./PagoProveedorFormBody.types";

export function PagoProveedorFormBody(p: Props) {
  const errorVisible = p.monto === "" ? null : p.validacion.error;
  const campoError = p.validacion.campoError;
  const errorMonto = campoError === "monto" ? errorVisible : null;
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
      {p.validacion.avisos.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 space-y-1">
          <p className="text-body-sm font-semibold text-warning">Revisa la factura</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {p.validacion.avisos.map((a) => (
              <li key={a} className="text-body-sm text-warning">{a}</li>
            ))}
          </ul>
        </div>
      )}

      <FormSection title="Fecha y método">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pago-prov-fecha">Fecha de pago</Label>
            <DatePickerMx id="pago-prov-fecha" value={p.fecha} onChange={p.setFecha} className="w-full"
              errorText={campoError === "fecha" ? errorVisible : null} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pago-prov-metodo">Método</Label>
            <Select value={p.metodo} onValueChange={p.setMetodo}>
              <SelectTrigger id="pago-prov-metodo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {p.metodosDisponibles.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <PagoProveedorCuentaField
          cuentas={p.cuentas}
          cuentasCargando={p.cuentasCargando}
          cuentasError={p.cuentasError}
          reintentarCuentas={p.reintentarCuentas}
          cuentaId={p.cuentaId}
          setCuentaId={p.setCuentaId}
          requiereCuenta={p.requiereCuenta}
          fecha={p.fecha}
        />

      </FormSection>


      <FormSection title="Monto">
        <div className={cn("grid grid-cols-1 gap-3", p.showTc ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <CampoMontoPago monto={p.monto} onChange={p.setMonto} error={errorMonto} />

          <div className="space-y-1">
            <Label htmlFor="pago-prov-moneda">Moneda de pago</Label>
            <Select value={p.moneda} onValueChange={(v) => p.setMoneda(v as Moneda)}>
              <SelectTrigger id="pago-prov-moneda"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MXN">MXN</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {p.showTc && (
            <TcPagoField
              tc={p.tc}
              setTc={p.setTc}
              tcDof={p.tcDof}
              cargandoTcDof={p.cargandoTcDof}
              aplicarTcDof={p.aplicarTcDof}
              moneda={p.moneda === "MXN" ? p.factura?.moneda : p.moneda}
            />
          )}

        </div>

        {!campoError && errorVisible && (
          <p className="text-body-sm text-destructive">{errorVisible}</p>
        )}

        <PagoSaldoRestante factura={p.factura} saldoRestante={p.saldoRestante} excede={p.excede} />

        <PagoImpactoPreview
          impacto={p.impacto}
          proveedorNombre={p.factura?.proveedor_nombre ?? "el proveedor"}
          cargandoProveedor={p.cargandoSaldoProveedor}
        />

        {p.esUsdPagadoEnMxn && p.factura && (
          <p className="text-body-sm text-muted-foreground">
            {p.bloqueadoPorTc
              ? "Captura el tipo de cambio para validar el pago contra el saldo en " + p.factura.moneda + "."
              : `≈ ${p.factura.moneda} ${formatNumber(p.montoEnMonedaFactura, { decimals: 2 })} al TC capturado.`}
          </p>
        )}
      </FormSection>


      <PagoProveedorDiferenciaField
        soportaDiferenciaCambiaria={p.soportaDiferenciaCambiaria}
        esUsdPagadoEnMxn={p.esUsdPagadoEnMxn}
        diffMxn={p.diffMxn}
        setDiffMxn={p.setDiffMxn}
        factura={p.factura}
      />



      <FormSection title="Referencia y notas">
        <div className="space-y-1">
          <Label htmlFor="pago-prov-referencia">Referencia</Label>
          <Input id="pago-prov-referencia" value={p.referencia} onChange={(e) => p.setReferencia(e.target.value)}
            placeholder={referenciaHint(p.metodo)} />
          <p className="text-label text-muted-foreground">{referenciaHint(p.metodo)}</p>
        </div>
        <div className="space-y-1">
          <Label>Notas</Label>
          <Textarea value={p.notas} onChange={(e) => p.setNotas(e.target.value)} rows={2}
            placeholder="Observaciones internas…" />
        </div>
      </FormSection>
    </div>
  );
}

function CampoMontoPago({ monto, onChange, error }: {
  monto: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="pago-prov-monto">Monto</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-muted-foreground">$</span>
        <Input id="pago-prov-monto" type="number" step="0.01" inputMode="decimal" placeholder="0.00"
          className="pl-7 text-right tabular-nums" aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "pago-prov-monto-error" : undefined}
          value={monto} onChange={(e) => onChange(e.target.value)} />
      </div>
      {error && <p id="pago-prov-monto-error" className="text-body-sm text-destructive">{error}</p>}
    </div>
  );
}
