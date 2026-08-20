import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/hr/api/client';

interface Surface {
  id: string;
  key: string;
  label: string;
}

type Severity = 'critical' | 'high' | 'normal';
type Origin = 'internal' | 'external';
type Channel = 'phone' | 'whatsapp' | 'email' | 'in_person' | 'in_app';

interface TicketRow {
  id: string;
  ref: string;
  title: string;
  severity: string;
  raised_at: string;
  task_id: string | null;
  closed_no_task_at: string | null;
  hr_ticket_surfaces?: { label: string } | null;
}

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
];

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'in_app', label: 'In the app' },
];

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring';

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stateOf(row: TicketRow) {
  if (row.closed_no_task_at) return 'Closed';
  if (row.task_id) return 'Being worked on';
  return 'Waiting to be picked up';
}

interface RaiseTicketProps {
  staffId: string | null;
}

export default function RaiseTicket({ staffId }: RaiseTicketProps) {
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [surfaceId, setSurfaceId] = useState('');
  const [severity, setSeverity] = useState<Severity>('normal');
  const [severityBasis, setSeverityBasis] = useState('');
  const [origin, setOrigin] = useState<Origin>('internal');
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [reporterChannel, setReporterChannel] = useState<Channel>('phone');
  const [reportedAt, setReportedAt] = useState('');
  const [reporterWords, setReporterWords] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [failure, setFailure] = useState('');

  const loadTickets = useCallback(async () => {
    if (!staffId) return;
    const { data } = await supabase
      .from('hr_tickets')
      .select(
        'id, ref, title, severity, raised_at, task_id, closed_no_task_at, hr_ticket_surfaces(label)',
      )
      .eq('raised_by', staffId)
      .order('raised_at', { ascending: false });
    setTickets((data ?? []) as unknown as TicketRow[]);
  }, [staffId]);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('hr_ticket_surfaces')
        .select('id, key, label')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (!cancelled) setSurfaces((data ?? []) as unknown as Surface[]);
    })();
    void loadTickets();
    return () => {
      cancelled = true;
    };
  }, [staffId, loadTickets]);

  if (!staffId) return null;

  const validate = () => {
    const next: Record<string, string> = {};
    if (title.trim().length < 10) next.title = 'Please write at least 10 characters.';
    if (body.trim().length < 20) next.body = 'Please write at least 20 characters.';
    if (!surfaceId) next.surfaceId = 'Please choose an area.';
    if (severity === 'critical' && severityBasis.trim().length < 10) {
      next.severityBasis = 'Please write at least 10 characters.';
    }
    if (origin === 'external') {
      if (!reporterName.trim()) next.reporterName = 'Please give a name.';
      if (!reporterContact.trim()) next.reporterContact = 'Please give a way to reach them.';
      if (!reporterChannel) next.reporterChannel = 'Please choose how they reached you.';
      if (!reportedAt) next.reportedAt = 'Please give the date and time.';
      if (reporterWords.trim().length < 20) {
        next.reporterWords = 'Please write at least 20 characters.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    setSuccess('');
    setFailure('');
    if (!validate()) return;
    setSubmitting(true);
    const external = origin === 'external';
    const payload = {
      title: title.trim(),
      body: body.trim(),
      severity,
      surface_id: surfaceId,
      origin,
      raised_by: staffId,
      severity_basis: severity === 'critical' ? severityBasis.trim() : null,
      reporter_name: external ? reporterName.trim() : null,
      reporter_contact: external ? reporterContact.trim() : null,
      reporter_channel: external ? reporterChannel : null,
      reported_at: external ? new Date(reportedAt).toISOString() : null,
      reporter_words: external ? reporterWords.trim() : null,
    };
    const { data, error } = await supabase
      .from('hr_tickets')
      .insert(payload as never)
      .select('ref')
      .single();
    setSubmitting(false);
    if (error) {
      setFailure(error.message);
      return;
    }
    setTitle('');
    setBody('');
    setSurfaceId('');
    setSeverity('normal');
    setSeverityBasis('');
    setOrigin('internal');
    setReporterName('');
    setReporterContact('');
    setReporterChannel('phone');
    setReportedAt('');
    setReporterWords('');
    setErrors({});
    setSuccess(`Ticket ${(data as { ref?: string } | null)?.ref ?? ''} was raised.`);
    void loadTickets();
  };

  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-destructive">{errors[key]}</p> : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Raise a ticket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="ticket-title">Title</Label>
            <Input
              id="ticket-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
            />
            {fieldError('title')}
          </div>

          <div>
            <Label htmlFor="ticket-body">What happened</Label>
            <Textarea
              id="ticket-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what you saw"
            />
            {fieldError('body')}
          </div>

          <div>
            <Label htmlFor="ticket-area">Area</Label>
            <select
              id="ticket-area"
              className={selectClass}
              value={surfaceId}
              onChange={(e) => setSurfaceId(e.target.value)}
            >
              <option value="">Choose an area</option>
              {surfaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {fieldError('surfaceId')}
          </div>

          <div>
            <Label htmlFor="ticket-severity">How bad is it</Label>
            <select
              id="ticket-severity"
              className={selectClass}
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {severity === 'critical' && (
            <div>
              <Label htmlFor="ticket-basis">Why is this critical</Label>
              <Input
                id="ticket-basis"
                value={severityBasis}
                onChange={(e) => setSeverityBasis(e.target.value)}
              />
              {fieldError('severityBasis')}
            </div>
          )}

          <div>
            <Label htmlFor="ticket-origin">Did someone report this to you</Label>
            <select
              id="ticket-origin"
              className={selectClass}
              value={origin}
              onChange={(e) => setOrigin(e.target.value as Origin)}
            >
              <option value="internal">No, I found it myself</option>
              <option value="external">Yes, someone reported it</option>
            </select>
          </div>

          {origin === 'external' && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="ticket-reporter-name">Who reported it</Label>
                <Input
                  id="ticket-reporter-name"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                />
                {fieldError('reporterName')}
              </div>
              <div>
                <Label htmlFor="ticket-reporter-contact">How to reach them</Label>
                <Input
                  id="ticket-reporter-contact"
                  value={reporterContact}
                  onChange={(e) => setReporterContact(e.target.value)}
                />
                {fieldError('reporterContact')}
              </div>
              <div>
                <Label htmlFor="ticket-reporter-channel">How did they reach you</Label>
                <select
                  id="ticket-reporter-channel"
                  className={selectClass}
                  value={reporterChannel}
                  onChange={(e) => setReporterChannel(e.target.value as Channel)}
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {fieldError('reporterChannel')}
              </div>
              <div>
                <Label htmlFor="ticket-reported-at">When did they report it</Label>
                <Input
                  id="ticket-reported-at"
                  type="datetime-local"
                  value={reportedAt}
                  onChange={(e) => setReportedAt(e.target.value)}
                />
                {fieldError('reportedAt')}
              </div>
              <div>
                <Label htmlFor="ticket-reporter-words">What did they say</Label>
                <Textarea
                  id="ticket-reporter-words"
                  rows={3}
                  value={reporterWords}
                  onChange={(e) => setReporterWords(e.target.value)}
                />
                {fieldError('reporterWords')}
              </div>
            </div>
          )}

          {success && <p className="text-sm text-emerald-600">{success}</p>}
          {failure && <p className="text-sm text-destructive">{failure}</p>}

          <Button onClick={submit} disabled={submitting}>
            Raise ticket
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">My tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              You have not raised any tickets yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>How bad</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.ref}</TableCell>
                    <TableCell>{row.title}</TableCell>
                    <TableCell>{row.hr_ticket_surfaces?.label ?? '—'}</TableCell>
                    <TableCell className="capitalize">{row.severity}</TableCell>
                    <TableCell>{formatDateTime(row.raised_at)}</TableCell>
                    <TableCell>{stateOf(row)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
