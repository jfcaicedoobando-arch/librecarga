/**
 * Lista de empresas existentes que coinciden con lo que se escribe en el
 * nombre, para evitar capturar duplicados. Al elegir una se abre su ficha.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { useDebounce } from "@/hooks/shared/useDebounce";
import { useEmpresasSimilares } from "@/features/crm/hooks/useEmpresasSimilares";

interface Props { nombre: string; onElegir: () => void; disabled?: boolean }

export function EmpresasSimilares({ nombre, onElegir, disabled }: Props) {
  const termino = useDebounce(nombre.trim(), 300);
  const q = useEmpresasSimilares(termino);
  if (termino.length < 2) return null;
  if (q.isError) return (
    <ErrorStateInline
      title="No pudimos comprobar si ya existe una empresa con ese nombre"
      message="Reintenta la consulta o continúa con tu captura."
      onRetry={() => void q.refetch()}
      retrying={q.isFetching}
    />
  );
  if (!q.data?.filas.length) return null;
  return <ResultadosEmpresas filas={q.data.filas.slice(0, 6)} total={q.data.total} onElegir={onElegir} disabled={disabled} />;
}

function ResultadosEmpresas({ filas, total, onElegir, disabled }: {
  filas: Array<{ id: string; nombre: string }>;
  total: number;
  onElegir: () => void;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const [destino, setDestino] = useState<string | null>(null);
  return (
    <div className="rounded-md border bg-muted/40 p-2" role="region" aria-label="Empresas existentes">
      <p className="mb-1 text-caption text-muted-foreground">
        Ya existen {total} empresa{total === 1 ? "" : "s"} con ese nombre:
      </p>
      <ul className="space-y-0.5">
        {filas.map((f) => (
          <li key={f.id}>
            <Link to={`/crm/empresas/${f.id}`} aria-disabled={disabled} onClick={(event) => {
              if (!disabled && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
              event.preventDefault();
              if (!disabled) setDestino(`/crm/empresas/${f.id}`);
            }}
              className="block rounded px-2 py-1 text-body-sm hover:bg-accent hover:text-accent-foreground">
              {f.nombre}
            </Link>
          </li>
        ))}
      </ul>
      <ConfirmActionDialog
        open={destino !== null}
        onOpenChange={(open) => { if (!open) setDestino(null); }}
        title="¿Descartar y abrir la empresa existente?"
        description="Se perderán los datos capturados en el alta."
        cancelLabel="Seguir completando"
        confirmLabel="Descartar y abrir empresa"
        variant="destructive"
        confirmDisabled={disabled}
        onConfirm={() => {
          if (!destino || disabled) return;
          onElegir();
          navigate(destino);
        }}
      />
    </div>
  );
}
