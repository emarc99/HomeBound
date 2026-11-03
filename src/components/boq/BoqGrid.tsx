"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ValueFormatterParams,
  type CellClassParams,
  type ICellRendererParams,
} from "ag-grid-community";
import type { BoqRow } from "@/lib/queries";
import { formatNgn } from "@/lib/money";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  accentColor: "#b4532a",
  headerBackgroundColor: "#efe6d8",
  fontSize: 13,
  rowHeight: 36,
  headerHeight: 38,
  wrapperBorderRadius: 10,
});

const ngn = (p: ValueFormatterParams) =>
  p.value == null || (p.value === 0 && p.colDef.field !== "paidNgn") ? "" : formatNgn(p.value);
const qty = (p: ValueFormatterParams) => (p.value ? Number(p.value).toLocaleString("en-NG") : "");

function FlagsCell(p: ICellRendererParams<BoqRow>) {
  const flags = p.data?.flags ?? [];
  if (!flags.length) return <span className="text-palm">✓</span>;
  return (
    <span className="flex flex-wrap gap-1 py-1">
      {flags.map((f) => (
        <span key={f} className="rounded-full bg-red-100 px-2 text-xs leading-5 text-red-800">
          {f}
        </span>
      ))}
    </span>
  );
}

export default function BoqGrid({ rows, stageId }: { rows: BoqRow[]; stageId: string | null }) {
  const data = useMemo(() => (stageId ? rows.filter((r) => r.stageId === stageId) : rows), [rows, stageId]);

  const totals = useMemo(
    () => [
      {
        description: "Total",
        quotedTotalNgn: data.reduce((a, r) => a + r.quotedTotalNgn, 0),
        paidNgn: data.reduce((a, r) => a + r.paidNgn, 0),
        flags: [],
      } as unknown as BoqRow,
    ],
    [data],
  );

  const columns = useMemo<ColDef<BoqRow>[]>(
    () => [
      { field: "stageSeq", headerName: "#", width: 60, hide: !!stageId },
      { field: "description", headerName: "Line item", flex: 2, minWidth: 220 },
      { field: "unit", headerName: "Unit", width: 80 },
      { field: "qtyQuoted", headerName: "Qty quoted", width: 110, valueFormatter: qty, type: "rightAligned" },
      { field: "unitPriceQuotedNgn", headerName: "Quoted unit", width: 130, valueFormatter: ngn, type: "rightAligned" },
      {
        field: "marketMedianNgn",
        headerName: "Market median",
        width: 140,
        valueFormatter: ngn,
        type: "rightAligned",
        tooltipValueGetter: () => "Median unit price for this item in the same state over the last 90 days, across all Homebound projects.",
      },
      {
        headerName: "Quote vs market",
        width: 130,
        type: "rightAligned",
        valueGetter: (p) =>
          p.data?.marketMedianNgn ? Math.round(((p.data.unitPriceQuotedNgn - p.data.marketMedianNgn) / p.data.marketMedianNgn) * 100) : null,
        valueFormatter: (p) => (p.value == null ? "" : `${p.value > 0 ? "+" : ""}${p.value}%`),
        cellClass: (p: CellClassParams) => (p.value > 15 ? "text-red-700 font-medium" : p.value < -5 ? "text-palm" : ""),
      },
      { field: "qtyRequested", headerName: "Requested", width: 110, valueFormatter: qty, type: "rightAligned" },
      { field: "avgRequestedPriceNgn", headerName: "Requested unit", width: 135, valueFormatter: ngn, type: "rightAligned" },
      { field: "qtyDelivered", headerName: "Delivered", width: 105, valueFormatter: qty, type: "rightAligned" },
      { field: "quotedTotalNgn", headerName: "Quoted total", width: 140, valueFormatter: ngn, type: "rightAligned" },
      { field: "paidNgn", headerName: "Paid (PayPal)", width: 140, valueFormatter: ngn, type: "rightAligned" },
      { field: "flags", headerName: "Flags", flex: 1, minWidth: 180, cellRenderer: FlagsCell, cellDataType: false, autoHeight: true, sortable: false },
    ],
    [stageId],
  );

  return (
    <div className="h-full w-full">
      <AgGridReact<BoqRow>
        theme={theme}
        rowData={data}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true, filter: false }}
        pinnedBottomRowData={totals}
        getRowId={(p) => p.data.id ?? "total"}
        tooltipShowDelay={300}
      />
    </div>
  );
}
