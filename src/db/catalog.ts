import type { LineItemCategory } from "./schema";

export type CatalogItem = {
  itemKey: string;
  description: string;
  unit: string;
  category: LineItemCategory;
  baseIbadanNgn: number;
  aliases: string[];
};

// Illustrative Nov 2026 prices for Ibadan; other cities are scaled by CITY_FACTORS.
export const CATALOG: CatalogItem[] = [
  { itemKey: "cement-50kg", description: "Dangote 3X 42.5R cement, 50kg bag", unit: "bag", category: "material", baseIbadanNgn: 10200, aliases: ["dangote cement bag", "cement 42.5", "BUA cement 50kg", "cement bag"] },
  { itemKey: "block-9in", description: "9-inch sandcrete hollow block", unit: "piece", category: "material", baseIbadanNgn: 780, aliases: ["9 inches block", "9in hollow block", "nine inch block"] },
  { itemKey: "block-6in", description: "6-inch sandcrete hollow block", unit: "piece", category: "material", baseIbadanNgn: 620, aliases: ["6 inches block", "6in block"] },
  { itemKey: "rod-12mm", description: "12mm high-tensile iron rod, 12m length", unit: "length", category: "material", baseIbadanNgn: 17500, aliases: ["12mm rod", "Y12 rebar", "12 mm iron"] },
  { itemKey: "rod-16mm", description: "16mm high-tensile iron rod, 12m length", unit: "length", category: "material", baseIbadanNgn: 30000, aliases: ["16mm rod", "Y16 rebar"] },
  { itemKey: "binding-wire", description: "Binding wire, 20kg roll", unit: "roll", category: "material", baseIbadanNgn: 32000, aliases: ["binding wire roll", "tie wire"] },
  { itemKey: "sharp-sand-trip", description: "Sharp sand, 20-tonne tipper load", unit: "trip", category: "material", baseIbadanNgn: 280000, aliases: ["sharp sand trip", "river sand tipper"] },
  { itemKey: "granite-trip", description: "Granite chippings 3/4, 20-tonne tipper load", unit: "trip", category: "material", baseIbadanNgn: 820000, aliases: ["granite 3/4 trip", "chippings tipper"] },
  { itemKey: "timber-2x4", description: "Hardwood 2x4 timber, 12ft", unit: "piece", category: "material", baseIbadanNgn: 4200, aliases: ["2 by 4 wood", "2x4 hardwood"] },
  { itemKey: "timber-2x6", description: "Hardwood 2x6 timber, 12ft", unit: "piece", category: "material", baseIbadanNgn: 6500, aliases: ["2 by 6 wood", "2x6 hardwood"] },
  { itemKey: "longspan-alu", description: "Longspan aluminium roofing sheet, 0.55mm", unit: "sqm", category: "material", baseIbadanNgn: 7800, aliases: ["longspan aluminium", "aluminium roofing 0.55"] },
  { itemKey: "roofing-nails", description: "Roofing nails, carton", unit: "carton", category: "material", baseIbadanNgn: 28000, aliases: ["roofing nail carton"] },
  { itemKey: "pvc-4in", description: "4-inch PVC soil pipe, 5.8m", unit: "length", category: "material", baseIbadanNgn: 9500, aliases: ["4 inch pvc pipe", "soil pipe 4in"] },
  { itemKey: "cable-2.5mm", description: "2.5mm² copper cable, 100m coil", unit: "coil", category: "material", baseIbadanNgn: 78000, aliases: ["2.5mm wire coil", "2.5 cable"] },
  { itemKey: "floor-tile-60", description: "60x60 porcelain floor tile", unit: "sqm", category: "finish", baseIbadanNgn: 14500, aliases: ["60 by 60 tiles", "porcelain tile 60x60"] },
  { itemKey: "wc-suite", description: "Close-coupled WC suite", unit: "piece", category: "finish", baseIbadanNgn: 185000, aliases: ["water closet", "toilet seat set", "WC"] },
  { itemKey: "basin-pedestal", description: "Wash-hand basin with pedestal", unit: "piece", category: "finish", baseIbadanNgn: 95000, aliases: ["wash hand basin", "pedestal basin"] },
  { itemKey: "shower-mixer", description: "Thermostatic shower mixer set", unit: "set", category: "finish", baseIbadanNgn: 120000, aliases: ["shower set", "shower mixer"] },
  { itemKey: "emulsion-20l", description: "Emulsion paint, 20L bucket", unit: "bucket", category: "finish", baseIbadanNgn: 48000, aliases: ["emulsion paint bucket", "20 litre paint"] },
  { itemKey: "steel-door", description: "Security steel door, exterior", unit: "piece", category: "finish", baseIbadanNgn: 420000, aliases: ["security door", "steel door"] },
  { itemKey: "labor", description: "Labor (workmanship)", unit: "lot", category: "labor", baseIbadanNgn: 0, aliases: [] },
];

export const CITY_FACTORS: Record<string, { state: string; factor: number }> = {
  Ibadan: { state: "Oyo", factor: 1.0 },
  Lagos: { state: "Lagos", factor: 1.15 },
  Abuja: { state: "FCT", factor: 1.12 },
  "Port Harcourt": { state: "Rivers", factor: 1.1 },
  Enugu: { state: "Enugu", factor: 1.03 },
};

export function catalogItem(itemKey: string): CatalogItem {
  const item = CATALOG.find((c) => c.itemKey === itemKey);
  if (!item) throw new Error(`Unknown catalog item ${itemKey}`);
  return item;
}
