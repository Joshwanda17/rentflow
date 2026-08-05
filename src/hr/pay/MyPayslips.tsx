import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PersonalLayout from '@/components/layout/PersonalLayout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { listMyPayslips, type MyPayslipRow } from '@/hr/pay/api/myPay';

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Employee self-service list of their own paid payslips. */
export default function MyPayslips() {
  const [rows, setRows] = useState<MyPayslipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await listMyPayslips();
        if (alive) setRows(data);
      } catch (err) {
        if (alive) setError((err as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <PersonalLayout title="My payslips">
      <Card>
        <CardContent className="pt-6">
          {loading && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
              Loading your payslips…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No payslips yet. They appear here once a payroll run has been paid.
            </p>
          )}
          {!loading && !error && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Pay date</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">PAYE</TableHead>
                  <TableHead className="text-right">NSSF</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link className="underline" to={`/hr/pay/payslips/${r.id}`}>
                        {r.period_code ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link className="underline" to={`/hr/pay/payslips/${r.id}`}>
                        {formatDate(r.pay_date)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{formatAmount(r.gross)}</TableCell>
                    <TableCell className="text-right">{formatAmount(r.paye)}</TableCell>
                    <TableCell className="text-right">
                      {formatAmount(r.nssf_employee)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAmount(r.other_deductions)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatAmount(r.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            This is your own record. If any figure looks wrong, contact HR.
          </p>
        </CardContent>
      </Card>
    </HRPlaceholderPage>
  );
}