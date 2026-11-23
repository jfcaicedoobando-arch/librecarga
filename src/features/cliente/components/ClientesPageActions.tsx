import { MoreHorizontal, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ClientesPageActions({ onImport, onCreate }: { onImport: () => void; onCreate: () => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" className="hidden md:inline-flex" onClick={onImport}>
        <Upload aria-hidden /> Importar CSV
      </Button>
      <Button className="hidden md:inline-flex" onClick={onCreate}>
        <Plus aria-hidden /> Nuevo Cliente
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="md:hidden" aria-label="Más acciones de clientes">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onImport}>
            <Upload aria-hidden /> Importar CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
