import { useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogDescargarZipMes } from "./DialogDescargarZipMes";
import type { FacturasEmitidasProps } from "./facturasEmitidasProps";

export function FacturasExportMenu({ acciones, rangoInvertido }: {
  acciones: FacturasEmitidasProps["acciones"];
  rangoInvertido: boolean;
}) {
  const exportarRef = useRef<HTMLButtonElement>(null);
  const [zipMesOpen, setZipMesOpen] = useState(false);
  const filtradosDeshabilitados = rangoInvertido || acciones.exportacionDeshabilitada;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={exportarRef} variant="outline" className="shrink-0 gap-2">
            <Download className="h-4 w-4" />
            <span>{acciones.exportando ? "Exportando…" : "Exportar"}</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem disabled={filtradosDeshabilitados} onClick={acciones.exportarFacturasCsv}>
            CSV de resultados filtrados
          </DropdownMenuItem>
          <DropdownMenuItem disabled={filtradosDeshabilitados} onClick={acciones.exportarLayoutContable}>
            Layout de resultados filtrados
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setZipMesOpen(true)} title="Paquete PDF+XML de todos los CFDI del mes, generado por el PAC">
            ZIP del mes (PAC)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogDescargarZipMes open={zipMesOpen} onOpenChange={setZipMesOpen}
        onCloseAutoFocus={(event) => {
          if (!exportarRef.current) return;
          event.preventDefault();
          exportarRef.current.focus();
        }} />
    </>
  );
}
