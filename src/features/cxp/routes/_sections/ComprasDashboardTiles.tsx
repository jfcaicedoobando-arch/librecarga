/**
 * Tiles del dashboard `/compras`.
 *
 * v13.426.0 — Armonización global: `KpiCard` dejó de ser un clon local y ahora
 * es un adaptador delgado sobre `@/components/shared/KpiCard` (la tarjeta KPI
 * canónica del ERP). Se conserva la API local (`sub`, `tone`, `hint`, `to`)
 * para no tocar los call sites de `Compras.tsx`.
 */
import type { ReactNode } from "react";
import { KpiCard as SharedKpiCard } from "@/components/shared/KpiCard";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Card, CardContent } from "@/components/ui/card";
import type { KpiVariant } from "@/components/shared/kpiCard.tokens";

export type KpiTone = "default" | "info" | "warn" | "danger" | "success";

const TONE_TO_VARIANT: Record<KpiTone, KpiVariant> = {
  default: "default",
  info: "info",
  warn: "warning",
  danger: "destructive",
  success: "success",
};

type Lectura = { isLoading: boolean; isError?: boolean; error?: unknown; isFetching?: boolean; refetch: () => unknown };

export function LecturaCompra({ titulo, lectura, children }: {
  titulo: string; lectura?: Lectura; children: ReactNode;
}) {
  if (lectura?.isError || lectura?.error) {
    return (
      <ErrorStateInline title={titulo} message="No se pudo cargar el cuadro."
        className="py-3" retrying={lectura.isFetching} onRetry={() => void lectura.refetch()} />
    );
  }
  if (lectura?.isLoading) {
    return (
      <Card>
        <CardContent className="p-3">
          <p className="text-body font-medium">{titulo}</p>
          <p role="status" className="text-body-sm text-muted-foreground">Cargando…</p>
        </CardContent>
      </Card>
    );
  }
  return children;
}

export function KpiCard({
  label, value, sub, tone = "default", hint, to, valueTooltip, lectura,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: KpiTone;
  hint?: string;
  to?: string;
  /** Se acepta por compatibilidad; el icono lo resuelve la tarjeta canónica. */
  icon?: React.ReactNode;
  /** Tooltip con la cifra exacta cuando `value` viene en notación compacta. */
  valueTooltip?: string;
  lectura?: Lectura;
}) {
  return (
    <LecturaCompra titulo={label} lectura={lectura}>
      <SharedKpiCard
        label={label}
        value={value}
        sublabel={sub}
        variant={TONE_TO_VARIANT[tone]}
        hint={hint}
        to={to}
        valueTooltip={valueTooltip}
      />
    </LecturaCompra>
  );
}
