/**
 * Portal de Brokers · Consultar empresa: búsqueda discreta (sólo nombre y si es
 * Cliente/Prospecto), petición para prospectos y alta de empresas nuevas.
 */
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import SearchInput from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounce, useDocumentTitle } from "@/hooks/shared";
import { useBrokerOrganizaciones, useBuscarEmpresaBroker } from "../hooks/useBrokerPortal";
import type { EmpresaEncontrada } from "../services/brokerPortal";
import SolicitudEmpresaDialog from "../components/SolicitudEmpresaDialog";
import AltaProspectoDialog from "../components/AltaProspectoDialog";
import MisSolicitudesBroker from "../components/MisSolicitudesBroker";

function Accion({ e, onPedir }: { e: EmpresaEncontrada; onPedir: () => void }) {
  if (e.es_mia) return <Badge variant="secondary">Ya es tuya</Badge>;
  if (e.tipo === "Cliente") return <span className="text-body-sm text-muted-foreground">No disponible</span>;
  return <Button size="sm" variant="outline" onClick={onPedir}>Solicitar</Button>;
}

function estadoBusqueda(termino: string, consultado: string, brokerId: string | null,
  consulta: { isFetching: boolean; isError: boolean; isSuccess: boolean }) {
  if (!brokerId || termino.length < 3) return "inactiva";
  if (termino !== consultado || consulta.isFetching) return "buscando";
  if (consulta.isError) return "error";
  return consulta.isSuccess ? "lista" : "buscando";
}

function OrganizacionesConsulta({ orgs, brokerId, onChange }: {
  orgs: ReturnType<typeof useBrokerOrganizaciones>;
  brokerId: string | null;
  onChange: (id: string) => void;
}) {
  if (orgs.isLoading) return <EmptyStateInline loading message="Cargando organizaciones…" />;
  if (orgs.isError) return (
    <ErrorStateInline title="No pudimos cargar tus organizaciones"
      message="Reintenta para consultar las empresas de tu organización."
      onRetry={() => void orgs.refetch()} retrying={orgs.isFetching} />
  );
  if (!brokerId) return <EmptyStateInline message="No tienes una organización vinculada." />;
  if (!orgs.data || orgs.data.length < 2) return null;
  return (
    <Select value={brokerId} onValueChange={onChange}>
      <SelectTrigger className="max-w-sm" aria-label="Organización"><SelectValue /></SelectTrigger>
      <SelectContent>
        {orgs.data.map((o) => <SelectItem key={o.broker_id} value={o.broker_id}>{o.organizacion}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ResultadosEmpresa({ estado, empresas, onPedir, onAlta, onRetry }: {
  estado: ReturnType<typeof estadoBusqueda>;
  empresas: EmpresaEncontrada[];
  onPedir: (empresa: EmpresaEncontrada) => void;
  onAlta: () => void;
  onRetry: () => void;
}) {
  if (estado === "inactiva") return null;
  if (estado === "buscando") return <p role="status" className="text-body-sm text-muted-foreground">Buscando…</p>;
  if (estado === "error") return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-body-sm text-destructive">
      <p>No se pudo consultar esta empresa.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Reintentar búsqueda</Button>
    </div>
  );
  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {empresas.map((e) => (
          <div key={e.empresa_id} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-medium truncate">{e.nombre}</span>
              <Badge variant="outline">{e.tipo === "Cliente" ? "Cliente" : `Prospecto${e.etapa ? ` · ${e.etapa}` : ""}`}</Badge>
            </div>
            <Accion e={e} onPedir={() => onPedir(e)} />
          </div>
        ))}
        {empresas.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-body-sm text-muted-foreground">No encontramos esa empresa.</span>
            <Button size="sm" onClick={onAlta}><Plus className="h-4 w-4" /> Registrar empresa nueva</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BrokerConsultar() {
  useDocumentTitle("Consultar empresa");
  const orgs = useBrokerOrganizaciones();
  const [elegido, setElegido] = useState<string | null>(null);
  const brokerId = orgs.isError ? null
    : orgs.data?.find((org) => org.broker_id === elegido)?.broker_id ?? orgs.data?.[0]?.broker_id ?? null;
  const [texto, setTexto] = useState("");
  const buscado = useDebounce(texto, 300);
  const q = useBuscarEmpresaBroker(brokerId, buscado);
  const [pedir, setPedir] = useState<EmpresaEncontrada | null>(null);
  const [alta, setAlta] = useState<string | null>(null);
  const termino = texto.trim();
  const estado = estadoBusqueda(termino, buscado.trim(), brokerId, q);
  const res = q.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Search className="h-6 w-6 text-primary" />}
        title="Consultar empresa"
        description="Revisa si una empresa ya existe antes de registrarla."
      />
      <OrganizacionesConsulta orgs={orgs} brokerId={brokerId} onChange={setElegido} />
      {brokerId && <SearchInput value={texto} onChange={setTexto}
        placeholder="Escribe al menos 3 letras del nombre…" aria-label="Buscar empresa" />}
      <ResultadosEmpresa estado={estado} empresas={res} onPedir={setPedir}
        onAlta={() => setAlta(termino)} onRetry={() => void q.refetch()} />
      <MisSolicitudesBroker />
      <SolicitudEmpresaDialog brokerId={brokerId} empresa={pedir} onClose={() => setPedir(null)} />
      {alta && <AltaProspectoDialog brokerId={brokerId} open nombreInicial={alta} onClose={() => setAlta(null)} />}
    </div>
  );
}
