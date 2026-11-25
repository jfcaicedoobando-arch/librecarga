import { ArrowDownUp, Mail, MoreHorizontal, Plus, Upload } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DescargarTarifarioButton } from "./DescargarTarifarioButton";

type Props = Omit<ComponentProps<typeof DescargarTarifarioButton>, "enMenu"> & {
  puedeEditar: boolean;
  movil: boolean;
  ordenMovil: ReactNode;
  onExtraer: () => void;
  onImportar: () => void;
  onNueva: () => void;
};

export function TarifarioAcciones({ puedeEditar, movil, ordenMovil, onExtraer, onImportar, onNueva, ...descarga }: Props) {
  return (
    <div className="flex flex-wrap items-start gap-2 md:ml-auto">
      {movil ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" type="button" aria-label="Más acciones del tarifario">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DescargarTarifarioButton {...descarga} enMenu />
            {puedeEditar && (
              <>
                <DropdownMenuItem onSelect={onExtraer} className="gap-2">
                  <Mail className="size-4" /> Extraer de correo
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onImportar} className="gap-2">
                  <Upload className="size-4" /> Importar CSV/Excel
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2"><ArrowDownUp className="size-4" /> Ordenar por</DropdownMenuSubTrigger>
              <DropdownMenuPortal><DropdownMenuSubContent>{ordenMovil}</DropdownMenuSubContent></DropdownMenuPortal>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
          <DescargarTarifarioButton {...descarga} />
          {puedeEditar && (
            <>
              <Button variant="outline" type="button" onClick={onExtraer}>
                <Mail className="mr-1 size-4" /> Extraer de correo
              </Button>
              <Button variant="outline" type="button" onClick={onImportar}>
                <Upload className="mr-1 size-4" /> Importar CSV/Excel
              </Button>
            </>
          )}
        </>
      )}
      {puedeEditar && <Button type="button" onClick={onNueva}><Plus className="mr-1 size-4" /> Nueva tarifa</Button>}
    </div>
  );
}
