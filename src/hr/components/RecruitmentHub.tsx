import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  getCandidates,
  getDepartments,
  getEmployees,
  getHiringRequisitions,
  getJobPostings,
  setJobPostingStatus,
} from '@/hr/api';
import { getResumeUrl } from '@/hr/api/resumes';
import {
  APPLICATION_DECISIONS,
  purgeApplication,
  recordApplicationDecision,
  type ApplicationDecision,
} from '@/hr/api/applications';
import type { Database } from '@/integrations/supabase/types';
import type {
  Application,
  ApplicationStage,
  Candidate,
  CandidateSource,
  Department,
  Employee,
  HiringRequisition,
  JobPosting,
} from '@/hr/types';
import HRInternshipApplications from '@/components/hr/HRInternshipApplications';

const ALL = '__all__';

type ReqStatus = HiringRequisition['status'];

const REQ_STATUS_META: Record<
  ReqStatus,
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  },
  more_info: {
    label: 'More Info',
    icon: HelpCircle,
    className: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-700 border-red-500/30',
  },
};

const POSTING_STATUS_CLASS: Record<JobPosting['status'], string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  open: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
  closed: 'bg-muted text-muted-foreground border-border',
};

/** Withdrawn applications are not a pipeline stage column. */
const PIPELINE_STAGES: { key: ApplicationStage; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'screening', label: 'Screening' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'hired', label: 'Hired' },
  { key: 'rejected', label: 'Rejected' },
];

const SOURCE_LABELS: Record<CandidateSource, string> = {
  career_page: 'Career page',
  referral: 'Referral',
  talent_pool: 'Talent pool',
  work_sample: 'Work sample',
  import: 'Imported',
};

const EMPLOYMENT_LABELS: Record<JobPosting['employment_type'], string> = {
  permanent: 'Permanent',
  contract: 'Contract',
  intern: 'Internship',
  probation: 'Probation',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Permanent intake, not a vacancy. Detected by the absence of a closing date. */
function isAlwaysOpen(posting: JobPosting): boolean {
  return posting.requisition_id === null && posting.closes_at === null;
}

type JobApplicationRow = Database['public']['Tables']['job_applications']['Row'];

/** Labels for the decision vocabulary. Keyed by the constant, so no status is invented here. */
const DECISION_LABELS: Record<ApplicationDecision, string> = {
  shortlisted: 'Shortlist',
  hold: 'Hold',
  rejected: 'Decline',
};

const REMOVE_PHRASE = 'REMOVE';

const fmtCount = (n: number) => Math.round(n).toLocaleString();

function ApplicationsTab() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<JobApplicationRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [sortConfig, setSortConfig] = useState<
    { key: 'name' | 'status' | 'created'; dir: 'asc' | 'desc' }
  >({ key: 'created', dir: 'desc' });
  const [pending, setPending] = useState<
    { row: JobApplicationRow; kind: ApplicationDecision | 'remove' } | null
  >(null);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: ['job-applications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .is('purged_at', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as JobApplicationRow[];
    },
  });

  const statuses = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.status ?? '—'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredSorted = useMemo(() => {
    let data = rows;

    const term = search.trim().toLowerCase();
    if (term) {
      data = data.filter((r) =>
        [r.full_name, r.email, r.whatsapp_number, r.public_ref].some((v) =>
          (v ?? '').toLowerCase().includes(term),
        ),
      );
    }

    if (statusFilter !== ALL) {
      data = data.filter((r) => (r.status ?? '—') === statusFilter);
    }

    const sorted = [...data];
    if (sortConfig.key === 'name') {
      sorted.sort((a, b) => {
        const av = (a.full_name ?? '').toLowerCase();
        const bv = (b.full_name ?? '').toLowerCase();
        return av.localeCompare(bv) * (sortConfig.dir === 'asc' ? 1 : -1);
      });
    } else if (sortConfig.key === 'status') {
      sorted.sort((a, b) => {
        const av = (a.status ?? '').toLowerCase();
        const bv = (b.status ?? '').toLowerCase();
        return av.localeCompare(bv) * (sortConfig.dir === 'asc' ? 1 : -1);
      });
    } else {
      sorted.sort((a, b) => {
        const av = new Date(a.created_at).getTime();
        const bv = new Date(b.created_at).getTime();
        return (av - bv) * (sortConfig.dir === 'asc' ? 1 : -1);
      });
    }
    return sorted;
  }, [rows, search, statusFilter, sortConfig]);

  const toggleSort = (key: 'name' | 'status' | 'created') => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  const closeConfirm = () => {
    setPending(null);
    setReason('');
    setTyped('');
  };

  const runPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'remove') {
        await purgeApplication(pending.row.id);
        toast.success(`${pending.row.full_name || 'Application'} removed from the list`);
        setSelected(null);
      } else {
        await recordApplicationDecision(pending.row.id, pending.kind, reason);
        toast.success(
          `${DECISION_LABELS[pending.kind]} recorded for ${pending.row.full_name || 'applicant'}`,
        );
      }
      closeConfirm();
      const fresh = await refetch();
      const next = (fresh.data ?? []).find((r) => r.id === pending.row.id) ?? null;
      setSelected((prev) => (prev && prev.id === pending.row.id ? next : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record this');
    } finally {
      setBusy(false);
    }
  };

  const openCv = async (path: string) => {
    try {
      const url = await getResumeUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open CV');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/40 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Could not load applications</p>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, WhatsApp or reference"
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>all</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        showing {filteredSorted.length} of {rows.length}
      </p>

      {filteredSorted.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No applications match these filters.
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Full name</TableHead>
                <TableHead>Role interest</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('status')}
                >
                  Status
                  {sortConfig.key === 'status' && (
                    <span className="ml-1">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none"
                  onClick={() => toggleSort('created')}
                >
                  Created
                  {sortConfig.key === 'created' && (
                    <span className="ml-1">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSorted.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{row.full_name || '—'}</TableCell>
                  <TableCell>{row.role_interest || '—'}</TableCell>
                  <TableCell>{row.category || '—'}</TableCell>
                  <TableCell>{row.location || '—'}</TableCell>
                  <TableCell>{row.experience_level || '—'}</TableCell>
                  <TableCell>{row.status || '—'}</TableCell>
                  <TableCell>{fmtDateTime(row.created_at)}</TableCell>
                  <TableCell>{row.public_ref || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.full_name || 'Application'}</SheetTitle>
          </SheetHeader>
          {selected && <ApplicationDetail app={selected} onOpenCv={openCv} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="text-sm break-words">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="grid grid-cols-1 gap-3">{children}</div>
    </div>
  );
}

function ApplicationDetail({
  app,
  onOpenCv,
}: {
  app: JobApplicationRow;
  onOpenCv: (path: string) => void;
}) {
  return (
    <div className="space-y-6 py-4">
      <Section title="Contact">
        <Field label="Full name" value={app.full_name} />
        <Field label="Email" value={app.email} />
        <Field label="WhatsApp" value={app.whatsapp_number} />
        <Field label="Location" value={app.location} />
      </Section>

      <Separator />

      <Section title="Role and experience">
        <Field label="Role interest" value={app.role_interest} />
        <Field label="Category" value={app.category} />
        <Field label="Experience level" value={app.experience_level} />
        <Field label="Employment type" value={app.employment_type} />
        <Field
          label="Availability date"
          value={app.availability_date ? fmtDate(app.availability_date) : null}
        />
        <Field label="Cover note" value={app.cover_note} />
      </Section>

      <Separator />

      <Section title="Education and employer">
        <Field label="Highest education" value={app.highest_education} />
        <Field label="Current employer" value={app.current_employer} />
      </Section>

      <Separator />

      <Section title="Links">
        {app.portfolio_url && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Portfolio</Label>
            <a
              href={app.portfolio_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all block"
            >
              {app.portfolio_url}
            </a>
          </div>
        )}
        {app.linkedin_url && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">LinkedIn</Label>
            <a
              href={app.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all block"
            >
              {app.linkedin_url}
            </a>
          </div>
        )}
        {app.resume_url ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">CV</Label>
            <Button size="sm" variant="outline" onClick={() => onOpenCv(app.resume_url!)}>
              <FileText className="h-4 w-4 mr-2" />
              View CV
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No CV attached</p>
        )}
      </Section>

      <Separator />

      <Section title="Consent">
        <Field label="Consent text version" value={app.consent_text_version} />
        <Field
          label="Consented at"
          value={app.consented_at ? fmtDateTime(app.consented_at) : null}
        />
        <Field label="Future roles consent" value={app.future_roles_consent ? 'Yes' : 'No'} />
      </Section>

      <Separator />

      <Section title="Workflow">
        <Field label="Status" value={app.status} />
        <Field
          label="Contacted at"
          value={app.contacted_at ? fmtDateTime(app.contacted_at) : null}
        />
        <Field
          label="Decided at"
          value={app.decided_at ? fmtDateTime(app.decided_at) : null}
        />
        <Field label="Decision reason" value={app.decision_reason} />
      </Section>

      <Separator />

      <Section title="Source and UTM">
        <Field label="Source" value={app.source} />
        <Field label="UTM source" value={app.utm_source} />
        <Field label="UTM medium" value={app.utm_medium} />
        <Field label="UTM campaign" value={app.utm_campaign} />
      </Section>

      <Separator />

      <Section title="Reference">
        <Field label="Public reference" value={app.public_ref} />
      </Section>

      <Separator />

      <Section title="Record">
        <Field label="Created at" value={fmtDateTime(app.created_at)} />
        <Field label="Updated at" value={fmtDateTime(app.updated_at)} />
      </Section>
    </div>
  );
}

export default function RecruitmentHub() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [requisitions, setRequisitions] = useState<HiringRequisition[]>([]);
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [tab, setTab] = useState('internships');
  const [reqStatus, setReqStatus] = useState<ReqStatus>('pending');
  const [openTrail, setOpenTrail] = useState<Record<string, boolean>>({});

  const [confirmClose, setConfirmClose] = useState<JobPosting | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [pipelineJob, setPipelineJob] = useState<string>(ALL);
  const [sortBy, setSortBy] = useState<'newest' | 'score'>('newest');

  const [poolSearch, setPoolSearch] = useState('');
  const [poolSource, setPoolSource] = useState<string>(ALL);
  const [poolLocation, setPoolLocation] = useState<string>(ALL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [reqs, jobs, cands, deps, emps] = await Promise.all([
          getHiringRequisitions(),
          getJobPostings(),
          getCandidates(),
          getDepartments(),
          getEmployees(),
        ]);
        if (cancelled) return;
        setRequisitions(reqs);
        setPostings(jobs);
        setApplications([]);
        setCandidates(cands);
        setDepartments(deps);
        setEmployees(emps);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load recruitment data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const departmentName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? 'Unassigned';
  const employeeName = (id: string | null) =>
    (id ? employees.find((e) => e.id === id)?.full_name : null) ?? '—';
  const candidateById = (id: string) => candidates.find((c) => c.id === id) ?? null;

  async function refreshPostings() {
    const jobs = await getJobPostings();
    setPostings(jobs);
  }

  async function applyStatusChange(id: string, status: 'open' | 'closed') {
    setTogglingId(id);
    try {
      await setJobPostingStatus(id, status);
      await refreshPostings();
      toast.success(`Posting ${status === 'open' ? 'opened' : 'closed'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update posting');
    } finally {
      setTogglingId(null);
      setConfirmClose(null);
    }
  }

  function handleStatusToggle(job: JobPosting, nextStatus: 'open' | 'closed') {
    if (nextStatus === 'closed') {
      setConfirmClose(job);
      return;
    }
    applyStatusChange(job.id, 'open');
  }

  const reqCounts = useMemo(
    () => ({
      pending: requisitions.filter((r) => r.status === 'pending').length,
      more_info: requisitions.filter((r) => r.status === 'more_info').length,
      approved: requisitions.filter((r) => r.status === 'approved').length,
      rejected: requisitions.filter((r) => r.status === 'rejected').length,
    }),
    [requisitions],
  );

  const visibleRequisitions = requisitions.filter((r) => r.status === reqStatus);

  const pipelineApplications = useMemo(() => {
    let rows = applications;
    if (pipelineJob !== ALL) rows = rows.filter((a) => a.job_posting_id === pipelineJob);
    const sorted = [...rows];
    if (sortBy === 'score') {
      // Only when the user explicitly asks for it. Never the default.
      sorted.sort((a, b) => (b.score?.percentage ?? -1) - (a.score?.percentage ?? -1));
    } else {
      sorted.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    return sorted;
  }, [applications, pipelineJob, sortBy]);

  const poolLocations = useMemo(
    () => Array.from(new Set(candidates.map((c) => c.location).filter(Boolean))).sort(),
    [candidates],
  );
  const poolSources = useMemo(
    () => Array.from(new Set(candidates.map((c) => c.source))).sort(),
    [candidates],
  );

  const visibleCandidates = useMemo(() => {
    const term = poolSearch.trim().toLowerCase();
    return candidates
      .filter((c) => (poolSource === ALL ? true : c.source === poolSource))
      .filter((c) => (poolLocation === ALL ? true : c.location === poolLocation))
      .filter((c) =>
        term
          ? [c.full_name, c.email, c.phone, c.location]
              .join(' ')
              .toLowerCase()
              .includes(term)
          : true,
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [candidates, poolSearch, poolSource, poolLocation]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/40 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Could not load recruitment</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
        <TabsTrigger value="internships">Internships</TabsTrigger>
        <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
        <TabsTrigger value="postings">Postings</TabsTrigger>
        <TabsTrigger value="applications">Applications</TabsTrigger>
        <TabsTrigger value="pool">Talent Pool</TabsTrigger>
      </TabsList>

      {/* ---------------- Internships ---------------- */}
      <TabsContent value="internships" className="space-y-3">
        <HRInternshipApplications />
      </TabsContent>

      {/* ---------------- Requisitions ---------------- */}
      <TabsContent value="requisitions" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Headcount requests. Separate from Director funding requisitions.
        </p>
        <Tabs value={reqStatus} onValueChange={(v) => setReqStatus(v as ReqStatus)}>
          <TabsList className="grid grid-cols-4 w-full">
            {(['pending', 'more_info', 'approved', 'rejected'] as ReqStatus[]).map((s) => (
              <TabsTrigger key={s} value={s}>
                {REQ_STATUS_META[s].label} {reqCounts[s] ? `(${reqCounts[s]})` : ''}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={reqStatus} className="mt-4 space-y-3">
            {visibleRequisitions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No {REQ_STATUS_META[reqStatus].label.toLowerCase()} hiring requisitions.
              </div>
            ) : (
              visibleRequisitions.map((req) => {
                const meta = REQ_STATUS_META[req.status];
                const StatusIcon = meta.icon;
                const canAct = req.status === 'pending' || req.status === 'more_info';
                const trailOpen = Boolean(openTrail[req.id]);
                return (
                  <Card key={req.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{req.ref}</span>
                          <Badge variant="outline" className={meta.className}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </div>
                        <h3 className="font-semibold mt-1">{req.job_title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {departmentName(req.department_id)}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          {req.headcount} {req.headcount === 1 ? 'head' : 'heads'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {EMPLOYMENT_LABELS[req.employment_type]}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDateTime(req.created_at)}
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mt-2">{req.justification}</p>

                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                      <div>
                        Requester:{' '}
                        <span className="text-foreground">
                          {employeeName(req.requested_by_employee_id)}
                        </span>
                      </div>
                      <div>
                        Approver:{' '}
                        <span className="text-foreground">
                          {employeeName(req.approver_employee_id)}
                        </span>
                      </div>
                      {req.decided_at && (
                        <div>
                          Decided:{' '}
                          <span className="text-foreground">{fmtDateTime(req.decided_at)}</span>
                        </div>
                      )}
                    </div>

                    {req.decision_note && (
                      <div className="mt-2 rounded-md bg-muted/50 p-2 text-sm">
                        <span className="font-medium">Decision note: </span>
                        {req.decision_note}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {canAct && (
                        <>
                          <Button
                            size="sm"
                            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => toast.success(`${req.ref} approved`)}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            onClick={() => toast.success(`${req.ref} rejected`)}
                          >
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => toast.success(`More information requested on ${req.ref}`)}
                          >
                            <HelpCircle className="h-4 w-4" /> Request info
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setOpenTrail((prev) => ({ ...prev, [req.id]: !prev[req.id] }))
                        }
                      >
                        {trailOpen ? 'Hide audit trail' : 'View audit trail'}
                      </Button>
                    </div>

                    {trailOpen && (
                      <div className="mt-3 border-l-2 border-border pl-3 space-y-2">
                        <div className="text-xs">
                          <span className="font-medium">Raised</span>
                          {' · '}
                          <span className="text-muted-foreground">
                            {employeeName(req.requested_by_employee_id)}
                          </span>
                          {' · '}
                          <span className="text-muted-foreground">{fmtDateTime(req.created_at)}</span>
                        </div>
                        {req.decided_at ? (
                          <div className="text-xs">
                            <span className="font-medium capitalize">
                              {req.status.replace(/_/g, ' ')}
                            </span>
                            {' · '}
                            <span className="text-muted-foreground">
                              {employeeName(req.approver_employee_id)}
                            </span>
                            {' · '}
                            <span className="text-muted-foreground">
                              {fmtDateTime(req.decided_at)}
                            </span>
                            {req.decision_note && (
                              <div className="text-muted-foreground">{req.decision_note}</div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Awaiting a decision.</p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </TabsContent>

      {/* ---------------- Postings ---------------- */}
      <TabsContent value="postings" className="space-y-3">
        {postings.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No job postings yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {postings.map((job) => {
              const alwaysOpen = isAlwaysOpen(job);
              return (
                <Card
                  key={job.id}
                  className={
                    alwaysOpen
                      ? 'p-4 border-2 border-dashed border-primary/40 bg-primary/5'
                      : 'p-4'
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{job.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {departmentName(job.department_id)} · {job.location}
                      </p>
                    </div>
                    {alwaysOpen ? (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 text-primary border-primary/30 shrink-0"
                      >
                        Always open
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`${POSTING_STATUS_CLASS[job.status]} capitalize shrink-0`}
                      >
                        {job.status}
                      </Badge>
                    )}
                  </div>

                  {alwaysOpen && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Permanent intake, not a vacancy.
                    </p>
                  )}

                  {!alwaysOpen && (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {job.status === 'open'
                          ? 'Accepting applications'
                          : 'Not accepting applications'}
                      </span>
                      <Switch
                        checked={job.status === 'open'}
                        disabled={job.status === 'draft' || togglingId === job.id}
                        onCheckedChange={(checked) =>
                          handleStatusToggle(job, checked ? 'open' : 'closed')
                        }
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                    <div>
                      Employment:{' '}
                      <span className="text-foreground">
                        {EMPLOYMENT_LABELS[job.employment_type]}
                      </span>
                    </div>
                    <div>
                      Applications:{' '}
                      <span className="text-foreground">{job.application_count}</span>
                    </div>
                    <div>
                      Closes:{' '}
                      <span className="text-foreground">
                        {job.closes_at ? fmtDate(job.closes_at) : 'No closing date'}
                      </span>
                    </div>
                  </div>

                  <a
                    href={`https://welile.com/careers?c=${job.public_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 font-mono text-xs text-primary break-all hover:underline block"
                  >
                    welile.com/careers?c={job.public_slug}
                  </a>
                </Card>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* ---------------- Applications ---------------- */}
      <TabsContent value="applications" className="space-y-3">
        <ApplicationsTab />
      </TabsContent>

      {/* ---------------- Talent pool ---------------- */}
      <TabsContent value="pool" className="space-y-3">
        <Card className="p-4 bg-primary/5 border-primary/30">
          <p className="text-sm text-foreground">
            Before advertising a new role, search here first. Everyone in this pool has already
            applied to Welile and consented to being contacted.
          </p>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
              placeholder="Search name, email, phone or location"
              className="pl-8 h-9"
            />
          </div>
          <Select value={poolSource} onValueChange={setPoolSource}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              {poolSources.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={poolLocation} onValueChange={setPoolLocation}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All locations</SelectItem>
              {poolLocations.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {visibleCandidates.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {candidates.length === 0
              ? 'Nobody has joined the talent pool yet.'
              : 'No candidates match these filters.'}
          </div>
        ) : (
          <Card className="divide-y divide-border">
            {visibleCandidates.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground">{c.location || '—'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px]">
                    {SOURCE_LABELS[c.source]}
                  </Badge>
                  <div className="text-right">
                    <p className="text-xs text-foreground">
                      First applied {fmtDate(c.created_at)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Retained until {fmtDate(c.retention_until)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </TabsContent>
    </Tabs>

    <AlertDialog
      open={!!confirmClose}
      onOpenChange={(open) => {
        if (!open) setConfirmClose(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close posting?</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to close <strong>{confirmClose?.title}</strong>. The public form will
            stop accepting applications immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmClose(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              confirmClose && applyStatusChange(confirmClose.id, 'closed')
            }
          >
            Close posting
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
