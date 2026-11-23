import { ArrowLeft, ArrowRight } from "lucide-react";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import type { useNuevoClienteController } from "@/features/cliente/hooks";

type Controller = ReturnType<typeof useNuevoClienteController>;

function textoGuardar(guardando: boolean, clienteCreado: boolean): string {
  if (guardando) return "Guardando…";
  return clienteCreado ? "Reintentar constancia" : "Crear cliente";
}

export function NuevoClienteFooter({ c, intentarCerrar }: { c: Controller; intentarCerrar: () => void }) {
  if (c.step === 2) return (
    <>
      <Button variant="outline" onClick={() => c.setStep(1)} disabled={c.isSaving || Boolean(c.clienteCreado)}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Atrás
      </Button>
      <Button onClick={c.handleSave} disabled={!c.docsRequeridosCompletos || c.isSaving} loading={c.isSaving}>
        {textoGuardar(c.isSaving, Boolean(c.clienteCreado))}
      </Button>
    </>
  );

  const pendiente = !c.isStep1Valid || c.parsingCsf;
  return (
    <>
      {pendiente && (
        <div id="nuevo-cliente-paso-pendientes" className="w-full text-body-sm text-muted-foreground" role="status">
          {c.parsingCsf && <p>Espera a que termine la lectura de la CSF.</p>}
          {!!c.faltantesPaso1.length && <p>Completa: {c.faltantesPaso1.join(", ")}.</p>}
          {!!c.invalidosPaso1.length && <p>Revisa el formato de: {c.invalidosPaso1.join(", ")}.</p>}
        </div>
      )}
      <Button variant="outline" onClick={intentarCerrar}>Cancelar</Button>
      <Button onClick={c.handleNext} disabled={pendiente} aria-describedby={pendiente ? "nuevo-cliente-paso-pendientes" : undefined}>
        Siguiente <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </>
  );
}

interface SalidaProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  isSaving: boolean;
  clienteId?: string;
  onSalir: () => void;
  onAbrirCliente?: (id: string) => void;
}

export function NuevoClienteSalida({ open, onOpenChange, isSaving, clienteId, onSalir, onAbrirCliente }: SalidaProps) {
  const salir = () => {
    onOpenChange(false);
    onSalir();
  };
  return (
    <ConfirmActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={clienteId ? "¿Salir con la constancia pendiente?" : "¿Descartar el alta del cliente?"}
      description={clienteId
        ? "El cliente ya fue creado, pero su constancia sigue pendiente. Si sales, completa el expediente desde su ficha."
        : "Perderás los datos capturados y los documentos adjuntos de este formulario."}
      confirmLabel={clienteId ? "Salir sin adjuntar la constancia" : "Descartar"}
      cancelLabel={clienteId ? "Volver a reintentar" : "Seguir editando"}
      variant={clienteId ? "default" : "destructive"}
      confirmDisabled={isSaving}
      onConfirm={salir}
    >
      {clienteId && onAbrirCliente && (
        <Button variant="outline" disabled={isSaving} onClick={() => { salir(); onAbrirCliente(clienteId); }}>
          Abrir ficha del cliente
        </Button>
      )}
    </ConfirmActionDialog>
  );
}
