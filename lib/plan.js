export const monthLabel = (d) => new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(d);
