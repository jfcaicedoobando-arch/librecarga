/**
 * DialogEnviarEstadoCuenta — envía el estado de cuenta del cliente por email.
 *
 * QW12 Tanda 3 — Quick Wins facturación.
 */
import { useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { FormDialogShell } from "@/components/shared/FormDialogShell";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEstadoCuentaEmail } from "@/features/cobranza/hooks/useEstadoCuentaEmail";
import { formatCurrency } from "@/lib/formatters";
import type { FacturaEstadoCuenta } from "@/features/facturacion/estadoCuenta/services/estadoCuenta";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  clienteNombre: string | null;
  periodo: string;
  desde: string;
  hasta: string;
  rows: ReadonlyArray<FacturaEstadoCuenta>;
}

export function DialogEnviarEstadoCuenta({
  open, onOpenChange, clienteId, clienteNombre, periodo, desde, hasta, rows,
}: Props) {
  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");

  const totales = useMemo(() => {
    const porMoneda = new Map<FacturaEstadoCuenta["moneda"], { total: number; saldo: number; vencido: number }>();
    for (const fila of rows) {
      if (fila.saldo === null || fila.total === null) continue;
      const importes = porMoneda.get(fila.moneda) ?? { total: 0, saldo: 0, vencido: 0 };
      importes.total += fila.total;
      importes.saldo += fila.saldo;
      if ((fila.dias_vencido ?? 0) > 0) importes.vencido += fila.saldo;
      porMoneda.set(fila.moneda, importes);
    }
    return [...porMoneda];
  }, [rows]);

  const { mutate, isPending } = useEstadoCuentaEmail({
    onSuccess: () => {
      setEmail("");
      setMensaje("");
      onOpenChange(false);
    },
  });

  const emailValido = email.trim() === "" || email.includes("@");
  const puedeEnviar = !isPending && emailValido;

  const handleEnviar = () => {
    mutate({
      clienteId,
      periodo,
      contactoEmail: email.trim() || undefined,
      mensaje: mensaje.trim() || undefined,
      fechaDesde: desde,
      fechaHasta: hasta,
    });
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
        Cancelar
      </Button>
      <Button onClick={handleEnviar} disabled={!puedeEnviar} loading={isPending}>
          {isPending ? "Enviando…" : (
          "Enviar estado de cuenta"
        )}
      </Button>
    </div>
  );

  return (
    <FormDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={Mail}
      title="Enviar estado de cuenta por email"
      description={clienteNombre ?? "Cliente"}
      size="md"
      footer={footer}
    >
      <div className="space-y-4">
        <div className="space-y-2 text-sm">
          <p className="font-medium">Resumen de filas visibles</p>
          <p className="text-muted-foreground">El correo incluye el estado del cliente para el período seleccionado.</p>
          {totales.length === 0 && <p className="text-muted-foreground">Sin importes disponibles en las filas visibles.</p>}
          {totales.map(([moneda, importes]) => (
            <dl key={moneda} aria-label={`Importes en ${moneda}`} className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">{formatCurrency(importes.total, moneda)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Saldo</dt>
                <dd className="font-semibold tabular-nums">{formatCurrency(importes.saldo, moneda)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Vencido</dt>
                <dd className="font-semibold tabular-nums text-destructive">{formatCurrency(importes.vencido, moneda)}</dd>
              </div>
            </dl>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-estado-cuenta">Correo del destinatario (opcional)</Label>
          <Input
            id="email-estado-cuenta"
            type="email"
            placeholder="contacto@cliente.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Si lo dejas vacío, usamos el correo principal del cliente.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mensaje-estado-cuenta">Mensaje opcional</Label>
          <Textarea
            id="mensaje-estado-cuenta"
            placeholder="Ej. Te comparto tu estado de cuenta al cierre del periodo. Quedo atento a cualquier duda."
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={3}
            maxLength={2000}
          />
        </div>
      </div>
    </FormDialogShell>
  );
}
