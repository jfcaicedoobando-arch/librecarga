/**
 * Selector de tipo de contenedor (catálogo deduplicado).
 *
 * P1 auditoría v13.824.3: el Select controlado mostraba "Selecciona" tras
 * elegir una opción cuando el ID guardado era un duplicado legacy que no está
 * en la lista visible. Analogía: elegiste una credencial vieja de la misma
 * persona; aquí traducimos ese ID al de la ficha que sí aparece en la lista,
 * así el trigger siempre refleja la selección (mouse y teclado).
 */
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTiposContenedor } from "@/features/catalogos/hooks";
import { resolverIdCanonicoTipo } from "@/features/catalogos/utils/tiposContenedorCanonico";

interface Props {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TipoContenedorSelect({
  id, value, onChange, placeholder = "Selecciona", disabled,
}: Props) {
  const avisoId = useId();
  const { data: tipos = [], isLoading, isError, isFetching, refetch } = useTiposContenedor();

  // Siempre un string estable (el componente permanece controlado): `""`
  // representa "sin selección" y Radix muestra el placeholder.
  const canonico = resolverIdCanonicoTipo(tipos, value);
  const visible = tipos.some((t) => t.id === canonico) ? canonico : "";

  const ayuda = isLoading ? "Cargando tipos de contenedor…"
    : isError ? "No se pudo consultar el catálogo de tipos de contenedor."
    : tipos.length === 0 ? "No hay tipos de contenedor disponibles. Consulta al responsable de Catálogos."
    : undefined;

  return (
    <div className="min-w-0 space-y-1">
      <Select value={visible} onValueChange={onChange} disabled={disabled || tipos.length === 0}>
        <SelectTrigger id={id} aria-describedby={ayuda ? avisoId : undefined} aria-busy={isLoading}>
          <SelectValue placeholder={value && ayuda ? "Tipo de contenedor guardado" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {tipos.map((t) => (
            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {ayuda && <p id={avisoId} role="status" className="text-label text-muted-foreground">{ayuda}</p>}
      {isError && <Button type="button" variant="outline" size="sm" loading={isFetching} onClick={() => void refetch()}>Reintentar</Button>}
    </div>
  );
}
