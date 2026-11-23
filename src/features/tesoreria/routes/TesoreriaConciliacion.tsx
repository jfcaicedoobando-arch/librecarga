import { useTextoUrl } from "@/hooks/shared/useFiltroUrl";
import { ConciliacionCuenta } from "./_sections/ConciliacionCuenta";

export default function TesoreriaConciliacion() {
  const [cuentaId, cambiarCuenta] = useTextoUrl("cuenta");

  // Una cuenta distinta inicia una nueva selección, captura y revisión.
  return <ConciliacionCuenta key={cuentaId} cuentaId={cuentaId} cambiarCuenta={cambiarCuenta} />;
}
