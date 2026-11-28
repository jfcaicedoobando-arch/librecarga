import { useState } from "react";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDiaNegocio } from "@/hooks/shared/useDiaNegocio";

export function ConfirmarFechaEntrega({ fechaLlegada, confirmar, cerrar }: {
  fechaLlegada?: string;
  confirmar: (fecha: string) => void;
  cerrar: () => void;
}) {
  const hoy = useDiaNegocio();
  const [fecha, setFecha] = useState(hoy);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) cerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar entrega</DialogTitle>
          <DialogDescription>Indica el día en que se entregó el embarque.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (fecha) confirmar(fecha); }} className="space-y-4">
          <Label htmlFor="fecha-efectiva-entrega">Fecha efectiva de entrega</Label>
          <DatePickerMx id="fecha-efectiva-entrega" value={fecha} onChange={setFecha} min={fechaLlegada} max={hoy} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button type="submit" disabled={!fecha || fecha > hoy || (!!fechaLlegada && fecha < fechaLlegada)}>Marcar Entregado</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
