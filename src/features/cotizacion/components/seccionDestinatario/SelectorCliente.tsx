import { FormField } from "@/components/shared/FormField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EstadoConsultaClientes, type EstadoCatalogoClientes } from "./EstadoConsultaClientes";

export interface ClienteOption {
  id: string;
  nombre: string;
}

interface Props {
  clientes: ClienteOption[];
  consulta?: EstadoCatalogoClientes;
  clienteId: string;
  disabled: boolean;
  error?: string;
  onChange: (id: string) => void;
}

export function SelectorCliente({ clientes, consulta, clienteId, disabled, error, onChange }: Props) {
  const hayClientes = clientes.length > 0;
  const clienteFueraDelCatalogo = clienteId && !clientes.some((cliente) => cliente.id === clienteId);
  return (
    <>
      <FormField label="Cliente" required error={error}>
        <Select value={clienteId} disabled={disabled || !hayClientes} onValueChange={onChange}>
          <SelectTrigger aria-label="Cliente">
            <SelectValue placeholder="Seleccionar cliente">
              {clienteFueraDelCatalogo ? "Cliente seleccionado" : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {clientes.map((cliente) => (
              <SelectItem key={cliente.id} value={cliente.id}>{cliente.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {consulta && <EstadoConsultaClientes consulta={consulta} hayClientes={hayClientes} />}
    </>
  );
}
