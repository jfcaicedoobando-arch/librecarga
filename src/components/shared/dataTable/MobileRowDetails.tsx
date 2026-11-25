import type { ReactNode } from "react";

/** Presenta los campos de una fila con sus etiquetas en la tarjeta móvil. */
export function MobileRowDetails({ fields }: {
  fields: ReadonlyArray<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-2 text-body-sm">
      {fields.map(({ label, value }) => (
        <div key={label} className="min-w-0 break-words">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
