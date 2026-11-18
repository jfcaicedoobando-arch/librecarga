/** La bandeja ya exige estado Aceptada. */
export function estadoCompatibleConAceptadasSinEmbarque(estado: string): boolean {
  return estado === "todos" || estado === "Aceptada";
}
