import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, FileText, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
// jsPDF loaded dynamically when needed

export interface Column<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  className?: string;
}

interface FilterOption {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface ExecutiveDataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  filters?: FilterOption[];
  title?: string;
  loading?: boolean;
  limit?: number;
}

export function ExecutiveDataTable<T extends Record<string, any>>({
  data,
  columns,
  filters = [],
  title,
  loading,
  limit = 15,
}: ExecutiveDataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    let result = [...data];

    // Search across all string columns
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const v = row[col.key];
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }

    // Apply dropdown filters
    for (const [key, val] of Object.entries(activeFilters)) {
      if (val && val !== 'all') {
        result = result.filter((row) => String(row[key]).toLowerCase() === val.toLowerCase());
      }
    }

    // Sort
    if (sortKey) {
      result.sort((a, b) => {
        const va = a[sortKey];
        const vb = b[sortKey];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
        return sortDir === 'asc'
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }

    return result.slice(0, limit);
  }, [data, search, sortKey, sortDir, activeFilters, columns, limit]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const exportCSV = () => {
    const header = columns.map((c) => c.label).join(',');
    const rows = filtered.map((row) => columns.map((c) => `"${String(row[c.key] ?? '')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(title || 'Report', 14, 16);
    doc.setFontSize(8);
    const startY = 24;
    const colW = (doc.internal.pageSize.getWidth() - 28) / columns.length;

    // Header
    columns.forEach((col, i) => {
      doc.setFont('helvetica', 'bold');
      doc.text(col.label, 14 + i * colW, startY);
    });

    // Rows
    filtered.forEach((row, ri) => {
      const y = startY + 6 + ri * 5;
      if (y > doc.internal.pageSize.getHeight() - 10) return;
      doc.setFont('helvetica', 'normal');
      columns.forEach((col, ci) => {
        doc.text(String(row[col.key] ?? '').substring(0, 30), 14 + ci * colW, y);
      });
    });

    doc.save(`${title || 'report'}.pdf`);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        {filters.map((f) => (
          <Select
            key={f.key}
            value={activeFilters[f.key] || 'all'}
            onValueChange={(v) => setActiveFilters((prev) => ({ ...prev, [f.key]: v }))}
          >
            <SelectTrigger className="w-full sm:w-[140px] h-9">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {f.label}</SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-9 gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="h-9 gap-1.5">
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {columns.map((col, i) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap',
                      i === 0 && 'sticky left-0 bg-muted/50 z-10',
                      col.sortable !== false && 'cursor-pointer select-none hover:text-foreground',
                      col.className
                    )}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortable !== false && (
                        sortKey === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-3">
                        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                    No records found
                  </td>
                </tr>
              ) : (
                filtered.map((row, ri) => (
                  <tr key={ri} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    {columns.map((col, ci) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-3 py-2.5 whitespace-nowrap',
                          ci === 0 && 'sticky left-0 bg-background z-10 font-medium',
                          col.className
                        )}
                      >
                        {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-t border-border">
            Showing {filtered.length} of {data.length} records (latest {limit})
          </div>
        )}
      </div>
    </div>
  );
}
