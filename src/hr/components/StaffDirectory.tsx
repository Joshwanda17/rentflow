import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  enrollStaff,
  getDepartments,
  getEnrollableUsers,
  getStaffDirectory,
  type EnrollableUser,
} from '@/hr/api';
import type { Department, Employee } from '@/hr/types';

const NONE = '__none__';

export default function StaffDirectory() {
  const [staff, setStaff] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setStaff(await getStaffDirectory());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameByStaffId = useMemo(
    () => Object.fromEntries(staff.map((s) => [s.id, s.full_name])) as Record<string, string>,
    [staff],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Enroll staff member
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <div className="p-6 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {loadError}
            </div>
          ) : staff.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No one is enrolled in performance tracking yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Job title</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reports to</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.staff_number}</TableCell>
                      <TableCell className="font-medium">{s.full_name || '—'}</TableCell>
                      <TableCell>{s.current_assignment?.role_title ?? '—'}</TableCell>
                      <TableCell>{s.current_assignment?.department_name || '—'}</TableCell>
                      <TableCell>
                        {s.current_assignment?.manager_employee_id
                          ? nameByStaffId[s.current_assignment.manager_employee_id] ?? '—'
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
                          {s.status === 'active' ? 'Active' : 'Exited'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EnrollDialog
        open={open}
        onOpenChange={setOpen}
        existingStaff={staff}
        onEnrolled={() => void load()}
      />
    </div>
  );
}

function EnrollDialog({
  open,
  onOpenChange,
  existingStaff,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingStaff: Employee[];
  onEnrolled: () => void;
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<EnrollableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userId, setUserId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [reportsTo, setReportsTo] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    getDepartments()
      .then(setDepartments)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load departments'));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsersLoading(true);
    const t = setTimeout(() => {
      getEnrollableUsers(search)
        .then((rows) => {
          if (!cancelled) setUsers(rows);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load users');
        })
        .finally(() => {
          if (!cancelled) setUsersLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, search]);

  const reset = () => {
    setSearch('');
    setUserId('');
    setDepartmentId('');
    setJobTitle('');
    setReportsTo(NONE);
    setError(null);
  };

  const selectedUser = users.find((u) => u.id === userId);
  const canSave = !!userId && !!departmentId && jobTitle.trim().length > 1 && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await enrollStaff({
        userId,
        departmentId,
        jobTitle: jobTitle.trim(),
        reportsToStaffId: reportsTo === NONE ? null : reportsTo,
        startedOn: new Date().toISOString().slice(0, 10),
      });
      toast.success('Staff member enrolled');
      reset();
      onOpenChange(false);
      onEnrolled();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const denied =
        /row-level security|permission denied|not authorized|violates row/i.test(raw);
      setError(
        denied
          ? 'Enrollment was refused by the database. Enrolling staff requires the hr or super_admin role.'
          : `Enrollment failed: ${raw}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enroll staff member</DialogTitle>
          <DialogDescription>
            Adds one staff record and an opening assignment starting today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Platform user</Label>
            <Input
              placeholder="Search by name, email or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
              {usersLoading ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                </div>
              ) : users.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No unenrolled users match this search.
                </div>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUserId(u.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                      userId === u.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.email || u.phone || '—'}
                    </div>
                  </button>
                ))
              )}
            </div>
            {selectedUser && (
              <p className="text-xs text-muted-foreground">Selected: {selectedUser.full_name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Job title</Label>
            <Input
              placeholder="e.g. Field Operations Officer"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Reports to (optional)</Label>
            <Select value={reportsTo} onValueChange={setReportsTo}>
              <SelectTrigger>
                <SelectValue placeholder="No manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No manager</SelectItem>
                {existingStaff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.staff_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
