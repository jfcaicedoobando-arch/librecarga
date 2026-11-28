import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDiaNegocio } from "@/hooks/shared/useDiaNegocio";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { finDeMes, useCertificarCorteCxc } from "../hooks/useCortesCxc";

function VistaPreviaCxc({ fecha, hoy, preview }: {
  fecha: string; hoy: string; preview: ReturnType<typeof useCertificarCorteCxc>["preview"];
}) {
  if (!fecha) return null;
  if (fecha >= hoy) return <p role="status">Selecciona un mes terminado.</p>;
  if (preview.isFetching) return <p role="status">Calculando saldo al corte…</p>;
  if (preview.isError) return <p role="alert">{getErrorMessage(preview.error)}</p>;
  if (!preview.isSuccess) return null;
  const totales = new Map<string, number>();
  for (const fila of preview.data.filas) {
    totales.set(fila.moneda, (totales.get(fila.moneda) ?? 0) + fila.saldo);
  }
  return <div role="status">
    <p>{preview.data.filas.length} facturas con saldo al {formatDate(fecha)}.</p>
    <ul>{[...totales].map(([moneda, saldo]) => <li key={moneda}>{formatCurrency(saldo, moneda)}</li>)}</ul>
    {preview.data.filas.length > 0 && <details>
      <summary>Ver saldo por factura</summary>
      <ul className="mt-2 max-h-60 overflow-y-auto">
        {preview.data.filas.map((fila) => (
          <li key={fila.id}>{fila.folio} · {fila.contraparte} · {formatCurrency(fila.saldo, fila.moneda)}</li>
        ))}
      </ul>
    </details>}
  </div>;
}

export function CertificacionCxcCard() {
  const hoy = useDiaNegocio();
  const [mes, setMes] = useState("");
  const [evidencia, setEvidencia] = useState("");
  const fecha = finDeMes(mes);
  const { permitido, apertura, preview, guardar } = useCertificarCorteCxc(fecha < hoy ? fecha : "");
  const huella = preview.data?.fingerprint;
  if (!permitido) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Corte mensual de cuentas por cobrar</CardTitle>
        <CardDescription>Concilia los saldos por factura y moneda antes de certificar el cierre.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {apertura.isPending && <p role="status">Consultando apertura…</p>}
        {apertura.isError && <Button variant="outline" onClick={() => void apertura.refetch()}>Reintentar consulta de apertura</Button>}
        {apertura.isSuccess && (
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            if (!apertura.data) guardar.mutate({ evidencia: evidencia.trim() }, { onSuccess: () => setEvidencia("") });
            else if (huella && fecha < hoy) guardar.mutate({ fecha, fingerprint: huella, evidencia: evidencia.trim() }, { onSuccess: () => setEvidencia("") });
          }}>
            {apertura.data ? (
              <>
                <p>Apertura conciliada del {formatDate(apertura.data)}.</p>
                <Label htmlFor="mes-certificacion-cxc">Mes a certificar</Label>
                <Input id="mes-certificacion-cxc" type="month" value={mes} max={hoy.slice(0, 7)}
                  onChange={(event) => { setMes(event.target.value); setEvidencia(""); }} />
                <VistaPreviaCxc fecha={fecha} hoy={hoy} preview={preview} />
              </>
            ) : <p>Registra la referencia del auxiliar que conciliaste con la cartera actual para iniciar el historial de cortes.</p>}
            <Label htmlFor="evidencia-certificacion-cxc">Referencia de conciliación</Label>
            <Input id="evidencia-certificacion-cxc" value={evidencia} onChange={(event) => setEvidencia(event.target.value)}
              minLength={10} maxLength={1000} required />
            <Button type="submit" disabled={guardar.isPending || evidencia.trim().length < 10 ||
              (!!apertura.data && (!huella || !fecha || fecha >= hoy || preview.isFetching))}>
              {apertura.data ? "Certificar corte de CxC" : "Registrar apertura conciliada"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
