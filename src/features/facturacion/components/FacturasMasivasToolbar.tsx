import { useState } from "react";
import { Download, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { useFacturasMasivas } from "../hooks/useFacturasMasivas";

interface Props {
  selectedIds: Set<string>;
  visibleIds: ReadonlySet<string>;
  revisandoFilas?: boolean;
  onClear: () => void;
  onMarked: (ids: readonly string[]) => void;
}

type AccionConfirmada = "email" | "mark";

export function FacturasMasivasToolbar({ selectedIds, visibleIds, revisandoFilas, onClear, onMarked }: Props) {
  const [confirmacion, setConfirmacion] = useState<{ accion: AccionConfirmada; ids: Set<string> } | null>(null);
  const { busy, progreso, descargarZip, reenviarEmail, marcarEnviada } = useFacturasMasivas(selectedIds, onMarked);
  const count = selectedIds.size;
  const fueraDePagina = [...selectedIds].filter((id) => !visibleIds.has(id));
  const fuera = fueraDePagina.length;
  const disabled = count === 0 || revisandoFilas || !!busy;
  const abrirConfirmacion = (accion: AccionConfirmada) => setConfirmacion({ accion, ids: selectedIds });

  const confirmar = () => {
    if (disabled || confirmacion?.ids !== selectedIds) return;
    setConfirmacion(null);
    return confirmacion.accion === "mark" ? marcarEnviada() : reenviarEmail();
  };

  if (count === 0 && !busy) return null;

  return (
    <div role="group" aria-label="Acciones sobre facturas seleccionadas"
      className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/50 border rounded-md">
      <ResumenSeleccionFacturas count={count} fuera={fuera} disabled={Boolean(disabled)}
        onConservarVisibles={() => onMarked(fueraDePagina)} />
      <div className="flex-1" />
      <Button variant="outline" size="sm" disabled={disabled} loading={busy === "zip"} onClick={descargarZip}>
        {busy !== "zip" && <Download className="h-4 w-4 mr-1" />}
        {busy === "zip" && progreso ? `Descargando ${progreso.hechas}/${progreso.total}…` : "Descargar ZIP"}
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} loading={busy === "email"} onClick={() => abrirConfirmacion("email")}>
        {busy !== "email" && <Mail className="h-4 w-4 mr-1" />}
        {busy === "email" && progreso ? `Reenviando ${progreso.hechas}/${progreso.total}…` : "Reenviar por email"}
      </Button>
      <Button variant="outline" size="sm" disabled={disabled} loading={busy === "mark"}
        onClick={() => fuera > 0 ? abrirConfirmacion("mark") : void marcarEnviada()}>
        {busy !== "mark" && <CheckCircle2 className="h-4 w-4 mr-1" />}
        Marcar enviada
      </Button>
      {count > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>Limpiar</Button>
      )}
      <ConfirmarAccionMasiva accion={confirmacion?.accion} count={count} fuera={fuera}
        disabled={Boolean(disabled) || confirmacion?.ids !== selectedIds}
        onCerrar={() => setConfirmacion(null)} onConfirmar={confirmar} />
    </div>
  );
}

function ResumenSeleccionFacturas({ count, fuera, disabled, onConservarVisibles }: {
  count: number;
  fuera: number;
  disabled: boolean;
  onConservarVisibles: () => void;
}) {
  return <>
    <span role="status" className="text-body font-medium">
      {count} seleccionada{count === 1 ? "" : "s"}
      {fuera > 0 && <> · {fuera} fuera de esta página</>}
    </span>
    {fuera > 0 && (
      <Button variant="link" size="sm" disabled={disabled} onClick={onConservarVisibles}>
        Conservar solo las visibles
      </Button>
    )}
  </>;
}

interface ConfirmarProps {
  accion?: AccionConfirmada;
  count: number;
  fuera: number;
  disabled: boolean;
  onCerrar: () => void;
  onConfirmar: () => void | Promise<void>;
}

function ConfirmarAccionMasiva({ accion, count, fuera, disabled, onCerrar, onConfirmar }: ConfirmarProps) {
  const marcar = accion === "mark";
  return <ConfirmActionDialog
    open={Boolean(accion)}
    onOpenChange={(open) => { if (!open) onCerrar(); }}
    title={marcar ? "Marcar facturas como enviadas" : "Reenviar facturas por email"}
    description={
      <>
        {marcar
          ? <>Se marcarán como enviadas <strong>{count}</strong> facturas, sin enviar correo.</>
          : <>Se reenviarán <strong>{count}</strong> facturas a los contactos principales de cada cliente.</>}
        {fuera > 0 && <> <strong>{fuera} fuera de esta página.</strong></>}
      </>
    }
    confirmLabel={marcar ? "Marcar enviadas" : "Reenviar"}
    confirmDisabled={disabled}
    onConfirm={onConfirmar}
  />;
}
