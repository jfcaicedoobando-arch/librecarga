/**
 * Subcomponente presentacional: tarjeta del checklist de validaciones de cierre.
 * v13.106.1 — Modo `informativo` para embarques ya cerrados (legacy).
 * v13.361.0 — Checklist agrupado por fase del ciclo de vida del embarque.
 * v13.384.0 — Checks aún no evaluables (sin facturas / sin costos comprobados)
 *              se muestran en gris "No aplica aún".
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CierreChecklistFase } from "./CierreChecklistFase";
import { agruparChecksPorFase } from "@/features/embarques/utils/cierreCheckOrden";
import { calcularReglasNoAplica } from "@/features/embarques/utils/cierreCheckNoAplica";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { ClipboardList } from "lucide-react";


export interface CierreCheck {
  regla: string;
  ok: boolean;
  detalle?: unknown;
}

interface Props {
  isLoading: boolean;
  falloConsulta?: { reintentando: boolean; reintentar: () => void };
  checks: CierreCheck[];
  embarqueId: string;
  /** v13.385.0 — Expediente, para enlazar checks a módulos externos. */
  expediente?: string;
  /** Si true, presenta el checklist como referencia (sin badges rojos ni CTAs). */
  informativo?: boolean;
  /** v13.386.0 — El embarque no genera comisión: los checks de comisión salen en gris. */
  sinComision?: boolean;
  /** v13.823.370 (P2-5) — Sin requisitos documentales registrados: el check documental no es evaluable. */
  sinRequisitosDocumentales?: boolean;
  /** @deprecated — los labels están en `cierreCheckMeta`. */
  etiquetas?: Record<string, string>;
}

export function CierreChecklistCard({
  isLoading, falloConsulta, checks, embarqueId, expediente,
  informativo = false, sinComision = false, sinRequisitosDocumentales = false,
}: Props) {
  const noAplica = calcularReglasNoAplica(checks, { sinComision, sinRequisitosDocumentales });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {informativo ? "Checklist de cierre (informativo)" : "Checklist de cierre"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {informativo && (
          <p className="text-body-sm text-muted-foreground">
            Este embarque se cerró antes de que existieran algunas de estas reglas.
            La lista es solo referencial; no requiere acción.
          </p>
        )}
        {falloConsulta ? (
          <ErrorStateInline
            title="No se pudo verificar el checklist de cierre"
            message="Reintenta para consultar los requisitos de cierre de este embarque."
            onRetry={falloConsulta.reintentar}
            retrying={falloConsulta.reintentando}
          />
        ) : isLoading ? (
          <p role="status" className="text-body text-muted-foreground">Validando…</p>
        ) : checks.length === 0 ? (
          <EmptyStateInline icon={ClipboardList} message="Sin datos." className="py-4" />
        ) : null}
        <div className="space-y-4">
          {agruparChecksPorFase(checks).map((grupo) => (
            <CierreChecklistFase
              key={grupo.fase.id}
              grupo={grupo}
              embarqueId={embarqueId}
              expediente={expediente}
              informativo={informativo}
              noAplica={noAplica}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
