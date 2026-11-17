/** Notas que Pricing capturó en la tarifa; visibles para el solicitante. */
export function NotasTarifa({ notas }: { notas: string | null | undefined }) {
  const texto = notas?.trim();
  if (!texto) return null;
  return (
    <div className="col-span-2 md:col-span-4">
      <span className="text-muted-foreground">Notas: </span>
      <span className="whitespace-pre-wrap">{texto}</span>
    </div>
  );
}
