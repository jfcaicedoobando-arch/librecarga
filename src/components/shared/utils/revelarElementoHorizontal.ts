export function revelarElementoHorizontal(contenedor: HTMLElement, elemento: HTMLElement) {
  const marco = contenedor.getBoundingClientRect();
  const item = elemento.getBoundingClientRect();

  if (item.left < marco.left) contenedor.scrollLeft += item.left - marco.left;
  else if (item.right > marco.right) contenedor.scrollLeft += item.right - marco.right;
}
