export const toCents = (price: string) => {
  const [whole = "0", fraction = ""] = price.split(".");

  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
};

export const fromCents = (cents: number) =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
