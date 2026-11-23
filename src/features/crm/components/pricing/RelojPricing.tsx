/**
 * Insignia del reloj de respuesta de Pricing. Se refresca cada minuto.
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calcularReloj } from "@/features/crm/services/pricing/relojPricing";

interface Props { enviadaAt: string | null; venceAt: string | null; respondidaAt: string | null; cancelada?: boolean; pausada?: boolean }

const VARIANTE = {
  ok: "success",
  alerta: "warning",
  vencida: "destructive",
  detenida: "neutral",
} as const;

export function RelojPricing({ enviadaAt, venceAt, respondidaAt, cancelada = false, pausada = false }: Props) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    if (respondidaAt || cancelada || pausada) return undefined;
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, [respondidaAt, cancelada, pausada]);

  if (cancelada) return <Badge variant="neutral">Plazo detenido</Badge>;
  if (pausada) return <Badge variant="warning">Plazo en pausa</Badge>;
  const reloj = calcularReloj({ enviadaAt, venceAt, respondidaAt, ahora });
  if (!reloj) return <span className="text-body-sm text-muted-foreground">—</span>;
  return (
    <Badge variant={VARIANTE[reloj.nivel]} className="gap-1">
      <Clock className="h-3.5 w-3.5" />
      {reloj.texto}
    </Badge>
  );
}
