import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SeveridadAuditoria } from "@/features/auditoria/types";
import { severidadConfig } from "./hallazgosTablaConfig";

export function HallazgoSeveridadBadge({ severidad }: { severidad: SeveridadAuditoria }) {
  const { label, className } = severidadConfig[severidad];
  return <Badge variant="outline" className={cn("text-label", className)}>{label}</Badge>;
}
