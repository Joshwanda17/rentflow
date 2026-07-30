import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, UserPlus } from 'lucide-react';
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
  createPosition,
  enrollStaff,
  getDepartments,
  getPositions,
  getStaffDirectory,
  searchUnenrolledStaff,
  type Position,
  type UnenrolledStaffCandidate,
} from '@/hr/api';
import type { Department, Employee } from '@/hr/types';

const NONE = '__none__';

export default function StaffDirectory() {
  const [staff, setStaff] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [directory, positionRows] = await Promise.all([getStaffDirectory(), getPositions()]);
      setStaff(directory);
      setPositions(positionRows);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const positionTitleById = useMemo(
    () => Object.fromEntries(positions.map((p) => [p.id, p.title])) as Record<string, string>,
    [positions],
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
                    <TableHead>Position</TableHead>
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
                      <TableCell>{s.current_assignment?.role_title || '—'}</TableCell>
                      <TableCell>{s.current_assignment?.department_name || '—'}</TableCell>
                      <TableCell>
                        {s.current_assignment?.manager_employee_id
                          ? positionTitleById[s.current_assignment.manager_employee_id] ?? '—'
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

      <EnrollDialog open={open} onOpenChange={setOpen} onEnrolled={() => void load()} />
    </div>
  );
}

function EnrollDialog({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEnrolled: () => void;
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UnenrolledStaffCandidate[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [userId, setUserId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [reportsTo, setReportsTo] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPositionOpen, setAddPositionOpen] = useState(false);

  const loadPositions = useCallback(async () => {
    try {
      setPositions(await getPositions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load positions');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    getDepartments()
      .then(setDepartments)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load departments'));
    void loadPositions();
  }, [open, loadPositions]);

  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    setSearchError(null);
    if (term.length < 2) {
      setUsers([]);
      setUsersLoading(false);
      return;
    }
    let cancelled = false;
    setUsersLoading(true);
    const t = setTimeout(() => {
      searchUnenrolledStaff(term)
        .then((rows) => {
          if (!cancelled) setUsers(rows);
        })
        .catch((e) => {
          if (!cancelled) {
            setUsers([]);
            setSearchError(e instanceof Error ? e.message : 'Search failed');
          }
        })
        .finally(() => {
          if (!cancelled) setUsersLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, search]);

  const reset = () => {
    setSearch('');
    setUsers([]);
    setSearchError(null);
    setUserId('');
    setDepartmentId('');
    setPositionId('');
    setReportsTo(NONE);
    setError(null);
  };

  const selectedUser = users.find((u) => u.user_id === userId);
  const canSave = !!userId && !!departmentId && !!positionId && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await enrollStaff({
        userId,
        departmentId,
        positionId,
        reportsToPositionId: reportsTo === NONE ? null : reportsTo,
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
              {searchError ? (
                <div className="p-3 text-sm text-destructive flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{searchError}</span>
                </div>
              ) : search.trim().length < 2 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </div>
              ) : usersLoading ? (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : users.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  No unenrolled users match this search.
                </div>
              ) : (
                users.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setUserId(u.user_id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                      userId === u.user_id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="font-medium">{u.display_name}</div>
                    <div className="text-xs text-muted-foreground">{u.staff_roles || '—'}</div>
                  </button>
                ))
              )}
            </div>
            {selectedUser && (
              <p className="text-xs text-muted-foreground">Selected: {selectedUser.display_name}</p>
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
            <div className="flex items-center justify-between">
              <Label>Position</Label>
              <button
                type="button"
                onClick={() => setAddPositionOpen(true)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add position
              </button>
            </div>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reports to (optional)</Label>
            <Select value={reportsTo} onValueChange={setReportsTo}>
              <SelectTrigger>
                <SelectValue placeholder="No manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No manager</SelectItem>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
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

        <AddPositionDialog
          open={addPositionOpen}
          onOpenChange={setAddPositionOpen}
          departments={departments}
          onCreated={async (created) => {
            await loadPositions();
            setPositionId(created.id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddPositionDialog({
  open,
  onOpenChange,
  departments,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departments: Department[];
  onCreated: (created: Position) => void | Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setDepartmentId(NONE);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createPosition({
        title: title.trim(),
        departmentId: departmentId === NONE ? null : departmentId,
      });
      toast.success('Position added');
      await onCreated(created);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add position');
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add position</DialogTitle>
          <DialogDescription>Positions carry reporting lines, not people.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Field Operations Officer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Department (optional)</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="No department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No department</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
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
          <Button onClick={handleSave} disabled={title.trim().length < 2 || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
