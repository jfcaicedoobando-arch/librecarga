import type { ReactNode } from "react";
import { usePricingScope } from "../../hooks/wizard/usePricingScope";
import { useVistaFiscalCotizacion } from "../../hooks/wizard/useVistaFiscalCotizacion";
import type { ConceptoVentaCotizacion } from "../../types";
import { ResumenFiscalCotizacion } from "../ResumenFiscalCotizacion";

interface Props {
  clienteId: string | null;
  cotizacionId: string | null;
  conceptos: readonly ConceptoVentaCotizacion[];
  children: (resumenFiscal?: ReactNode) => ReactNode;
}

export function VistaFiscalCotizacion(props: Props) {
  const scope = usePricingScope();
  if (!scope.userId || !scope.organizationId) return props.children();
  return <VistaFiscalActiva {...props} scope={scope} organizationId={scope.organizationId} />;
}

function VistaFiscalActiva({
  children, ...opciones
}: Props & { scope: ReturnType<typeof usePricingScope>; organizationId: string }) {
  const fiscal = useVistaFiscalCotizacion(opciones);
  if (fiscal.estado === "legacy") return children();
  if ("bloques" in fiscal) return children(<ResumenFiscalCotizacion {...fiscal} />);
  if (fiscal.estado === "error") {
    return children(<ResumenFiscalCotizacion estado="error" onReintentar={fiscal.reintentar} />);
  }
  return children(<ResumenFiscalCotizacion estado={fiscal.estado === "cargando" ? "cargando" : "revision"} />);
}
