export type StrategyTemplate = {
  id: string; name: string; spread: boolean; side: "call" | "put"; days: 7 | 14 | 30;
  units: number; premium: string; thesis: string;
};
export type TemplateTerms = Omit<StrategyTemplate, "id" | "name">;
export const TEMPLATE_KEY = "silicon:strategy-templates:v1";
export function readTemplates(): StrategyTemplate[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "[]");
    return Array.isArray(rows) ? rows.filter((r): r is StrategyTemplate =>
      r && typeof r.id === "string" && typeof r.name === "string" && r.name.length <= 80 && typeof r.spread === "boolean" &&
      ["call", "put"].includes(r.side) && [7, 14, 30].includes(r.days) && typeof r.units === "number" && r.units >= 1 && r.units <= 100 &&
      typeof r.premium === "string" && /^\d+(\.\d{1,6})?$/.test(r.premium) && Number(r.premium) >= .1 && Number(r.premium) <= 9.9 && typeof r.thesis === "string" && r.thesis.length <= 600).slice(0, 50) : [];
  } catch { return []; }
}
export function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const blob = new Blob([rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
