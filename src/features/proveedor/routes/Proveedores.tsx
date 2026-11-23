import { useEffect, useState } from "react";
import { useFiltroUrl, useTextoUrl } from "@/hooks/shared";
import { useSearchParams } from "react-router";
import { parseAsInteger, useQueryState } from "nuqs";
import { Truck, Plus, Upload, MoreHorizontal } from "lucide-react";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NuevoProveedorDialog from "@/features/proveedor/components/NuevoProveedorDialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePermissions } from "@/hooks/shared";
import { ProveedorTable } from "../components/ProveedorTable";
import {
  ProveedoresFiltros,
  type OrigenFiltro,
  type TipoFiltro,
} from "../components/ProveedoresFiltros";
import { useProveedoresCrear } from "@/features/proveedor/hooks/useProveedoresCrear";
import { ProveedoresImportDialog } from "../components/ProveedoresImportDialog";
import { ProveedoresProvisionalesAviso } from "../components/ProveedoresProvisionalesAviso";

import { PageContainer } from "@/components/shared/PageContainer";
import { useDocumentTitle } from "@/hooks/shared";

const ORIGENES_FILTRO = ["todos", "Nacional", "Extranjero"] as const;

export default function Proveedores() {
  useDocumentTitle("Proveedores");
  // M8 (Ola 8): filtros del directorio en la URL (link compartible).
  const [search, setSearch] = useTextoUrl("q");
  const [origen, setOrigen] = useFiltroUrl<OrigenFiltro>("origen", ORIGENES_FILTRO, "todos");
  const [tipoFiltro, setTipoFiltro] = useTextoUrl("tipo", "todos") as readonly [TipoFiltro, (v: TipoFiltro) => void];
  const [, setPage] = useQueryState("page", parseAsInteger);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  // Atajo desde la captura de facturas de proveedor: ?nuevo=1&rfc=&nombre=
  const [searchParams, setSearchParams] = useSearchParams();
  const prefillRfc = searchParams.get("rfc") ?? "";
  const prefillNombre = searchParams.get("nombre") ?? "";
  const pedirNuevo = searchParams.get("nuevo") === "1";
  useEffect(() => {
    if (pedirNuevo) setNuevoOpen(true);
  }, [pedirNuevo]);
  const cerrarNuevo = (abierto: boolean) => {
    setNuevoOpen(abierto);
    if (!abierto && pedirNuevo) {
      const next = new URLSearchParams(searchParams);
      next.delete("nuevo"); next.delete("rfc"); next.delete("nombre");
      setSearchParams(next, { replace: true });
    }
  };
  const [importOpen, setImportOpen] = useState(false);
  const { canEdit } = usePermissions();
  const handleAdd = useProveedoresCrear();

  const cambiarBusqueda = (valor: string) => {
    setSearch(valor);
    void setPage(null);
  };
  const cambiarOrigen = (valor: OrigenFiltro) => {
    setOrigen(valor);
    void setPage(null);
  };
  const cambiarTipo = (valor: TipoFiltro) => {
    setTipoFiltro(valor);
    void setPage(null);
  };
  const restaurarFiltros = (valores: { search: string; origen: OrigenFiltro; tipoFiltro: TipoFiltro; pagina: number | null }) => {
    setSearch(valores.search);
    setOrigen(valores.origen);
    setTipoFiltro(valores.tipoFiltro);
    void setPage(valores.pagina);
  };
  const limpiarFiltros = () => {
    setSearch("");
    setOrigen("todos");
    setTipoFiltro("todos");
    void setPage(null);
  };

  return (
    // pb-24 md:pb-0: evita que el FAB tape la última fila en mobile.
    <PageContainer className="pb-24 md:pb-6">

      <PageHeader
        icon={<Truck className="h-6 w-6 text-accent" />}
        title="Proveedores"
        description="Directorio único de proveedores. La categoría contable de cada gasto se asigna por factura."
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Importar CSV
              </Button>
              <Button className="hidden md:inline-flex" onClick={() => setNuevoOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo Proveedor
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="sm:hidden" aria-label="Más acciones de proveedores">
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                    <Upload aria-hidden /> Importar CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null
        }
      />

      <ProveedoresProvisionalesAviso />

      <ProveedoresFiltros
        search={search}
        onSearchChange={cambiarBusqueda}
        origen={origen}
        onOrigenChange={cambiarOrigen}
        tipoFiltro={tipoFiltro}
        onTipoChange={cambiarTipo}
        onLimpiar={limpiarFiltros}
        snapshot={() => ({ search, origen, tipoFiltro, pagina: Number(searchParams.get("page")) || null })}
        restore={restaurarFiltros}
      />

      <ProveedorTable
        tipo={tipoFiltro !== "todos" ? tipoFiltro : null}
        search={search}
        origen={origen}
        onLimpiarFiltros={limpiarFiltros}
        canCreate={canEdit}
        onCreateNew={() => setNuevoOpen(true)}
      />

      <NuevoProveedorDialog
        key={`${prefillRfc}|${prefillNombre}`}
        open={nuevoOpen}
        onOpenChange={cerrarNuevo}
        onSave={handleAdd}
        prefill={pedirNuevo ? { rfc: prefillRfc, nombre: prefillNombre } : undefined}
      />

      <ProveedoresImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {canEdit && (
        <FloatingActionButton
          onClick={() => setNuevoOpen(true)}
          icon={<Plus className="h-6 w-6" />}
          label="Nuevo proveedor"
        />
      )}
    </PageContainer>
  );
}
