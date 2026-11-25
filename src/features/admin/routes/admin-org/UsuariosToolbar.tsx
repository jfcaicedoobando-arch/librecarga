import SearchInput from "@/components/shared/SearchInput";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import {
  ASSIGNABLE_ROLE_GROUPS,
  ROLE_LABELS,
} from "@/features/admin/domain/roles/roleCatalog";

export const TODOS = "todos" as const;

interface UsuariosToolbarProps {
  busqueda: string;
  onBusquedaChange: (v: string) => void;
  filtroRol: string;
  onFiltroRolChange: (v: string) => void;
  totalFiltrados: number;
  total: number;
  /** VB-16: usuarios con estado "activo" (reemplaza al conteo de roles,
   *  que no comunicaba nada accionable). */
  activos: number;
  /** U-06: filtro por estado de la cuenta. */
  filtroEstado: string;
  onFiltroEstadoChange: (v: string) => void;
}

/**
 * Barra superior de la tabla de usuarios: buscador + filtro por rol +
 * contador. Extraído de `Usuarios.tsx` para mantenerlo ≤200 líneas.
 */
export function UsuariosToolbar({
  busqueda,
  onBusquedaChange,
  filtroRol,
  onFiltroRolChange,
  totalFiltrados,
  total,
  activos,
  filtroEstado,
  onFiltroEstadoChange,
}: UsuariosToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          aria-label="Buscar por correo"
          placeholder="Buscar por correo…"
          value={busqueda}
          onChange={onBusquedaChange}
          className="flex-1 sm:max-w-sm"
        />
        <Select value={filtroRol} onValueChange={onFiltroRolChange}>
          <SelectTrigger className="sm:w-[220px]" aria-label="Filtrar por rol">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los roles</SelectItem>
            {ASSIGNABLE_ROLE_GROUPS.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel className="text-overline">
                  {group.label}
                </SelectLabel>
                {group.roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={onFiltroEstadoChange}>
          <SelectTrigger className="sm:w-[200px]" aria-label="Filtrar por estado">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="pendiente">Invitación pendiente</SelectItem>
            <SelectItem value="desactivado">Desactivados</SelectItem>
            <SelectItem value="legacy">Rol legado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>
          <strong className="text-foreground">{totalFiltrados}</strong> de {total} usuario
          {total === 1 ? "" : "s"} · {activos} activo{activos === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
