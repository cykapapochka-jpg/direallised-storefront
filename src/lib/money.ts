export function money(value: number) {
  return `${value.toLocaleString("ru-RU").replace(",", " ")} ₽`;
}
