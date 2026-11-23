import { Badge } from "@/components/ui/badge";
import { toTitleCase, formatPhoneMx, correctSpanishPlace, formatCurrency } from "@/lib/formatters";
import { creditoClienteExcedido, type ClienteRow } from "@/features/cliente/components/clientesTableConfig";

export function ClienteMobileCard({ c }: { c: ClienteRow }) {
  const saldo = Number(c.saldo_pendiente_mxn ?? 0);
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="font-semibold text-sm truncate">{toTitleCase(c.nombre)}</div>
      {creditoClienteExcedido(c) && (
        <Badge variant="destructive" className="w-fit text-2xs px-1.5 py-0">
          Crédito excedido
        </Badge>
      )}
      {saldo > 0.01 && (
        <div className="text-label">
          Por cobrar <span className="font-medium tabular-nums">{formatCurrency(saldo, "MXN")}</span>
        </div>
      )}
      <div className="text-label font-mono text-muted-foreground truncate">
        {(c.rfc || "—").toUpperCase()}
      </div>
      {(c.ciudad || c.estado) && (
        <div className="text-label text-muted-foreground truncate">
          {[correctSpanishPlace(c.ciudad), correctSpanishPlace(c.estado)]
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
      {(c.contacto || c.telefono) && (
        <div className="text-label text-muted-foreground truncate">
          {[toTitleCase(c.contacto), formatPhoneMx(c.telefono)].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
