import { Badge } from "@/components/ui/badge";
import type { EstatusCobranza } from "../services/estadoCuenta";

const ESTADO_CUENTA_BADGE: Record<EstatusCobranza, "outline" | "warning" | "destructive" | "secondary"> = {
  Vigente: "outline",
  "Por vencer": "warning",
  Vencida: "destructive",
  Pagada: "secondary",
  "Sin saldo": "secondary",
};

export function EstadoCuentaEstatusBadge({ estatus }: { estatus: EstatusCobranza }) {
  return <Badge variant={ESTADO_CUENTA_BADGE[estatus]}>{estatus}</Badge>;
}
