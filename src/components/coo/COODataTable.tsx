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

        <div className="rounded-2xl border-2 border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  {tableCols.map(col => (
                    <th
                      key={col.key}
                      className={cn(
                        'px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={tableCols.length} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No data available
                    </td>
                  </tr>
                ) : (
                  paged.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedRow(row)}
                      className="border-b border-border/30 last:border-0 hover:bg-primary/5 transition-colors cursor-pointer active:bg-primary/10"
                    >
                      {tableCols.map(col => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-3 py-2.5 tabular-nums',
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                          )}
                        >
                          {col.render ? col.render(row) : String((row as any)[col.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 active:scale-95"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 active:scale-95"
                >
                  <ChevronRight className="h-4 w-4" />
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
