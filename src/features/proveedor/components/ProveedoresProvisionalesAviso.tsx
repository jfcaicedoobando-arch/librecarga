/** Aviso con los agentes provisionales pendientes de aprobación por Contabilidad. */
import { Link } from "react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useProveedoresProvisionales } from "@/features/proveedor/hooks/useProveedoresProvisionales";

export function ProveedoresProvisionalesAviso() {
  const { data = [], isError, isFetching, refetch } = useProveedoresProvisionales();
  if (isError) return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertTitle>No se pudo consultar qué proveedores están pendientes de aprobación</AlertTitle>
      <AlertDescription>
        <Button type="button" size="sm" variant="outline" loading={isFetching} onClick={() => void refetch()}>
          Reintentar consulta de provisionales
        </Button>
      </AlertDescription>
    </Alert>
  );
  if (data.length === 0) return null;
  return (
    <Alert variant="warning">
      <AlertTriangle className="size-4" />
      <AlertTitle>
        Provisionales por aprobar ({data.length})
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>Estos proveedores permiten capturar tarifas, pero sus facturas y pagos están bloqueados mientras sigan provisionales. Abre su ficha para revisar los datos que Contabilidad debe completar antes de aprobar.</p>
        <div className="flex flex-wrap gap-2">
          {data.map((p) => (
            <Link key={p.id} to={`/proveedores/${p.id}`}>
              <Badge variant="outline" className="hover:bg-muted">{p.nombre}</Badge>
            </Link>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
