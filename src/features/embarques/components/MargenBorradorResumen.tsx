import { formatCurrency, formatNumber } from '@/lib/formatters';
import type { AprobacionMargen } from '../services/aprobacionMargen';

export function MargenBorradorResumen({ snapshot: s }: { snapshot: AprobacionMargen['snapshot'] }) {
  const dinero = (valor: number | null) => valor === null ? 'N/D' : formatCurrency(valor, s.moneda);
  const items = [
    ['Venta', dinero(s.venta)], ['Costo', dinero(s.costo)],
    ['Utilidad', dinero(s.venta === null || s.costo === null ? null : s.venta - s.costo)],
    ['Margen', s.margen_pct === null ? 'N/D' : `${formatNumber(s.margen_pct, { decimals: 2 })}%`],
    ['Mínimo', `${formatNumber(s.minimo_pct, { decimals: 2 })}%`],
  ];
  return <dl className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
    {items.map(([label, value]) => <div key={label}>
      <dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}
