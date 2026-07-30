import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Plus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  createDepartment,
  createPosition,
  addAssignment,
  enrollStaff,
  getActiveAssignmentsByStaff,
  getDepartments,
  getPositions,
  getStaffDirectory,
  searchUnenrolledStaff,
  type ActiveAssignment,
  type Position,
  type UnenrolledStaffCandidate,
} from '@/hr/api';
import type { Department, Employee } from '@/hr/types';

const NONE = '__none__';

/** Turns any thrown value into something a person can read. */
function readableError(e: unknown, action: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/hr_assign_one_primary/i.test(raw)) {
    return 'This person already has a primary position. Untick the primary box, or try again — the existing primary must be cleared first.';
  }
  if (/hr_assign_no_dup_position/i.test(raw)) {
    return 'This person already holds that position. Choose a different position.';
  }
  if (/row-level security|permission denied|not authorized|violates row/i.test(raw)) {
    return `${action} was refused by the database. This requires the hr or super_admin role.`;
  }
  return `${action} failed: ${raw}`;
}

export default function StaffDirectory() {
  const [staff, setStaff] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ActiveAssignment[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addFor, setAddFor] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [directory, positionRows, assignmentRows] = await Promise.all([
        getStaffDirectory(),
        getPositions(),
        getActiveAssignmentsByStaff(),
      ]);
      setStaff(directory);
      setPositions(positionRows);
      setAssignments(assignmentRows);
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
                    <TableHead className="w-8" />
                    <TableHead>Ref</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Reports to</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((s) => {
                    const rows = assignments[s.id] ?? [];
                    const isOpen = expanded[s.id] === true;
                    return (
                      <>
                        <TableRow key={s.id}>
                          <TableCell className="pr-0">
                            <button
                              type="button"
                              aria-label={isOpen ? 'Hide positions' : 'Show positions'}
                              aria-expanded={isOpen}
                              onClick={() =>
                                setExpanded((prev) => ({ ...prev, [s.id]: !prev[s.id] }))
                              }
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{s.staff_number}</TableCell>
                          <TableCell className="font-medium">
                            {s.full_name || '—'}
                            {rows.length > 1 && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                {rows.length} positions
                              </Badge>
                            )}
                          </TableCell>
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
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => setAddFor(s)}>
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Add position
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${s.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={7} className="py-3">
                              {rows.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No active positions for this person yet.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs uppercase text-muted-foreground">
                                        <th className="text-left font-medium py-1 pr-4">Position</th>
                                        <th className="text-left font-medium py-1 pr-4">Department</th>
                                        <th className="text-left font-medium py-1 pr-4">Reports to</th>
                                        <th className="text-left font-medium py-1 pr-4">Started on</th>
                                        <th className="text-left font-medium py-1">Primary</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map((a) => (
                                        <tr key={a.id} className="border-t border-border/40">
                                          <td className="py-1.5 pr-4">{a.position_title || '—'}</td>
                                          <td className="py-1.5 pr-4">{a.department_name || '—'}</td>
                                          <td className="py-1.5 pr-4">{a.reports_to_title || '—'}</td>
                                          <td className="py-1.5 pr-4">{a.started_on}</td>
                                          <td className="py-1.5">
                                            {a.is_primary ? (
                                              <Badge>Primary</Badge>
                                            ) : (
                                              <span className="text-muted-foreground">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
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
  const [addDepartmentOpen, setAddDepartmentOpen] = useState(false);

  const loadDepartments = useCallback(async () => {
    try {
      setDepartments(await getDepartments());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load departments');
    }
  }, []);

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
  const missing: string[] = [];
  if (!userId) missing.push('a platform user');
  if (!departmentId) missing.push('a department');
  if (!positionId) missing.push('a position');
  const canSave = missing.length === 0 && !saving;
  const disabledReason =
    missing.length === 0
      ? null
      : `Select ${
          missing.length === 1
            ? missing[0]
            : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
        } to continue.`;

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
            <div className="flex items-center justify-between">
              <Label>Department</Label>
              <button
                type="button"
                onClick={() => setAddDepartmentOpen(true)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add department
              </button>
            </div>
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

        <div className="space-y-2">
          {disabledReason && (
            <p className="text-xs text-muted-foreground text-right">{disabledReason}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              aria-disabled={!canSave}
              title={disabledReason ?? undefined}
              className={!canSave ? 'opacity-50 cursor-not-allowed pointer-events-none' : undefined}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enroll
            </Button>
          </DialogFooter>
        </div>

        <AddPositionDialog
          open={addPositionOpen}
          onOpenChange={setAddPositionOpen}
          departments={departments}
          onCreated={async (created) => {
            await loadPositions();
            setPositionId(created.id);
          }}
        />

        <AddDepartmentDialog
          open={addDepartmentOpen}
          onOpenChange={setAddDepartmentOpen}
          onCreated={async (created) => {
            await loadDepartments();
            setDepartmentId(created.id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddDepartmentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (created: Department) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'output' | 'time'>('output');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setMode('output');
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createDepartment({ name: name.trim(), measurementMode: mode });
      toast.success('Department added');
      await onCreated(created);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add department');
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
          <DialogTitle>Add department</DialogTitle>
          <DialogDescription>
            Departments group postings and set how work is measured.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g. Field Operations"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Measured by</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'output' | 'time')}>
              <SelectTrigger>
                <SelectValue placeholder="Select measurement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="output">Output — tasks and deliverables</SelectItem>
                <SelectItem value="time">Time — hours, shifts and attendance</SelectItem>
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
          <Button onClick={handleSave} disabled={name.trim().length < 2 || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
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
