import { REGIMENES_FISCALES_SAT } from "@/constants/regimenFiscalSAT";
import { formatFechaHora } from "@/lib/formatters";
import type { PerfilFiscalEmisor } from "../domain/perfilFiscalEmisor";

export function PerfilFiscalDatos({ perfil }: { perfil: NonNullable<PerfilFiscalEmisor["perfil"]> }) {
  const regimen = REGIMENES_FISCALES_SAT.find((r) => r.clave === perfil.regimen_fiscal);
  const tipo = perfil.tipo_persona === "fisica" ? "Persona física" : perfil.tipo_persona === "moral" ? "Persona moral" : null;
  const campos = [
    ["RFC", perfil.rfc], ["Razón social", perfil.razon_social], ["Tipo de persona", tipo],
    ["Régimen fiscal", regimen ? `${regimen.clave} — ${regimen.descripcion}` : perfil.regimen_fiscal],
    ["Código postal fiscal", perfil.codigo_postal], ["Última sincronización", formatFechaHora(perfil.sincronizado_at)],
  ];
  return <dl className="grid gap-4 sm:grid-cols-2">
    {campos.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium">{value || "Pendiente"}</dd>
    </div>)}
  </dl>;
}
