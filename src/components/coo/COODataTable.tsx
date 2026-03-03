import { useState } from 'react';
import { Download, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle
} from '@/components/ui/drawer';

export interface COOColumn<T = any> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** If true, this column is only shown in the detail drawer, not in the main table */
  detailOnly?: boolean;
}

interface COODataTableProps<T = any> {
  columns: COOColumn<T>[];
  data: T[];
  title: string;
  pageSize?: number;
  exportFilename?: string;
  /** Additional columns shown only in the row detail drawer */
  detailColumns?: COOColumn<T>[];
}

function exportToCSV<T>(columns: COOColumn<T>[], data: T[], filename: string) {
  const exportCols = columns.filter(c => !c.detailOnly);
  const header = exportCols.map(c => c.label).join(',');
  const rows = data.map(row =>
    exportCols.map(c => {
      const val = (row as any)[c.key];
      const str = String(val ?? '').replace(/,/g, ' ').replace(/\n/g, ' ');
      return `"${str}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function COODataTable<T>({ columns, data, title, pageSize = 15, exportFilename, detailColumns }: COODataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<T | null>(null);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const paged = data.slice(page * pageSize, (page + 1) * pageSize);

  const tableCols = columns.filter(c => !c.detailOnly);
  const allDetailCols = [...columns, ...(detailColumns || [])];

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
          <button
            onClick={() => exportToCSV(columns, data, exportFilename || title.toLowerCase().replace(/\s+/g, '-'))}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

      <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] font-mono">
              <thead>
                <tr className="border-b-2 border-border bg-muted/50">
                  <th className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground text-center w-10">#</th>
                  {tableCols.map(col => (
                    <th
                      key={col.key}
                      className={cn(
                        'px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground whitespace-nowrap border-l border-border/40',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={tableCols.length + 1} className="px-3 py-10 text-center text-xs text-muted-foreground italic">
                      No records found
                    </td>
                  </tr>
                ) : (
                  paged.map((row, i) => {
                    const rowIndex = page * pageSize + i + 1;
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelectedRow(row)}
                        className={cn(
                          'transition-colors cursor-pointer active:bg-primary/10',
                          i % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                          'hover:bg-primary/[0.07]'
                        )}
                      >
                        <td className="px-3 py-2 text-[10px] font-bold text-muted-foreground/60 text-center tabular-nums">{rowIndex}</td>
                        {tableCols.map(col => (
                          <td
                            key={col.key}
                            className={cn(
                              'px-3 py-2 tabular-nums border-l border-border/20',
                              col.align === 'right' ? 'text-right font-semibold' : col.align === 'center' ? 'text-center' : 'text-left',
                              col.align === 'right' && 'tracking-tight'
                            )}
                          >
                            {col.render ? col.render(row) : String((row as any)[col.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {paged.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-3 py-1.5 text-[9px] font-black text-muted-foreground" colSpan={tableCols.length + 1}>
                      {data.length} RECORD{data.length !== 1 ? 'S' : ''} TOTAL
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/60 bg-muted/30">
              <span className="text-[10px] font-bold text-muted-foreground tabular-nums tracking-wide">
                SHOWING {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} OF {data.length}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-20 active:scale-95 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-bold tabular-nums text-muted-foreground px-1.5">
                  {page + 1}/{totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-20 active:scale-95 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row Detail Drawer */}
      <Drawer open={!!selectedRow} onOpenChange={(open) => { if (!open) setSelectedRow(null); }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-base font-black tracking-tight">Record Details</DrawerTitle>
          </DrawerHeader>
          {selectedRow && (
            <div className="p-4 pb-8 space-y-2 max-h-[60vh] overflow-y-auto">
              {allDetailCols.map(col => {
                const rawVal = (selectedRow as any)[col.key];
                const display = col.render ? col.render(selectedRow) : String(rawVal ?? '—');
                return (
                  <div key={col.key} className="flex items-start justify-between py-2.5 px-3 rounded-xl bg-muted/50 gap-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground shrink-0">{col.label}</span>
                    <span className="text-sm font-semibold text-right">{display}</span>
                  </div>
                );
              })}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
