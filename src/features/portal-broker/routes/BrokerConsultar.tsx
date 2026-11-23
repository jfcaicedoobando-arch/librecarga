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

export default function BrokerConsultar() {
  useDocumentTitle("Consultar empresa");
  const orgs = useBrokerOrganizaciones();
  const [elegido, setElegido] = useState<string | null>(null);
  const brokerId = elegido ?? orgs.data?.[0]?.broker_id ?? null;
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
      {(orgs.data?.length ?? 0) > 1 && (
        <Select value={brokerId ?? undefined} onValueChange={setElegido}>
          <SelectTrigger className="max-w-sm" aria-label="Organización"><SelectValue /></SelectTrigger>
          <SelectContent>
            {orgs.data?.map((o) => <SelectItem key={o.broker_id} value={o.broker_id}>{o.organizacion}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <SearchInput value={texto} onChange={setTexto} placeholder="Escribe al menos 3 letras del nombre…" aria-label="Buscar empresa" />
      {estado === "buscando" && <p role="status" className="text-body-sm text-muted-foreground">Buscando…</p>}
      {estado === "error" && (
        <p role="alert" className="text-body-sm text-destructive">No se pudo buscar. Intenta de nuevo.</p>
      )}
      {estado === "lista" && (
        <Card>
          <CardContent className="p-0 divide-y">
            {res.map((e) => (
              <div key={e.empresa_id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="font-medium truncate">{e.nombre}</span>
                  <Badge variant="outline">{e.tipo === "Cliente" ? "Cliente" : `Prospecto${e.etapa ? ` · ${e.etapa}` : ""}`}</Badge>
                </div>
                <Accion e={e} onPedir={() => setPedir(e)} />
              </div>
            ))}
            {res.length === 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="text-body-sm text-muted-foreground">No encontramos esa empresa.</span>
                <Button size="sm" onClick={() => setAlta(termino)}><Plus className="h-4 w-4" /> Registrar empresa nueva</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <MisSolicitudesBroker />
      <SolicitudEmpresaDialog brokerId={brokerId} empresa={pedir} onClose={() => setPedir(null)} />
      {alta && <AltaProspectoDialog brokerId={brokerId} open nombreInicial={alta} onClose={() => setAlta(null)} />}
    </div>
  );
}
