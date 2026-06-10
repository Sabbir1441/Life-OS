let currencySymbol = "৳";

export function setCurrencySymbol(symbol: string) {
  currencySymbol = symbol || "৳";
}

export function getCurrencySymbol() {
  return currencySymbol;
}

export const fmt = (n: number) =>
  currencySymbol + Math.round(n).toLocaleString();
