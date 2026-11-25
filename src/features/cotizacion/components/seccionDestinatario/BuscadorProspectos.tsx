/**
 * Buscador con debounce de leads/oportunidades existentes.
 */
import { useState, useMemo } from "react";
import { Building2, Search } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/shared";
import { useCrmProspectoSearch, type ProspectoMatch } from "@/features/crm/hooks";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";

interface Props {
  onSelect: (m: ProspectoMatch) => void;
}

export function BuscadorProspectos({ onSelect }: Props) {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 200);
  const { data, isFetching, isError, refetch } = useCrmProspectoSearch(debounced);
  const items = useMemo(() => data ?? [], [data]);

  return (
    <div className="space-y-2">
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder="Buscar por empresa, contacto, email…"
        autoFocus
        aria-label="Buscar prospecto por empresa, contacto o email"
      />
      {isError ? (
        <ErrorStateInline
          message="No se pudo buscar prospectos."
          onRetry={refetch}
          className="py-3"
        />
      ) : debounced.length < 2 ? (
        <EmptyStateInline
          icon={Search}
          message="Escribe al menos 2 caracteres para buscar."
          density="compact"
        />
      ) : isFetching ? (
        <EmptyStateInline loading message="Buscando…" density="compact" />
      ) : items.length === 0 ? (
        <EmptyStateInline
          icon={Building2}
          message="Sin prospectos u oportunidades elegibles."
          hint="Sólo aparecen prospectos calificados y oportunidades abiertas sin cliente. Da de alta o califica el prospecto en el CRM."
          density="compact"
        />
      ) : (
        <ul className="max-h-60 overflow-auto rounded-md border bg-background divide-y">
          {items.map((m) => (
            <li key={`${m.kind}-${m.id}`}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onSelect(m)}
                className="flex h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none px-3 py-2 text-left font-normal hover:bg-muted/60"
              >
                <Badge
                  variant="outline"
                  className={
                    m.kind === "oportunidad"
                      ? "border-primary/40 text-primary"
                      : "border-muted-foreground/40"
                  }
                >
                  {m.kind === "oportunidad" ? "Oport." : "Lead"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{m.empresa}</p>
                  <p className="truncate text-body-sm text-muted-foreground">
                    {m.contacto || m.email || "—"}
                    {m.etapaNombre ? ` · ${m.etapaNombre}` : ""}
                  </p>
                </div>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
