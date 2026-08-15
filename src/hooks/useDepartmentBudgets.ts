import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Department Budget Collection & CFO Approval — data layer.
 * All reads go through RLS-protected tables; all writes go through the
 * SECURITY DEFINER budget_* RPCs which re-check authorisation server-side.
 * No figures are computed or stored client-side: Budget vs Actual comes
 * straight from the General Ledger via get_budget_vs_actual.
 */

export interface BudgetCycle {
  id: string;
  title: string;
  financial_year: string | null;
  period_type: string;
  period_start: string;
  period_end: string;
  deadline: string | null;
  instructions: string | null;
  status: string;
  created_at: string;
}

export interface BudgetLine {
  id: string;
  submission_id: string;
  sort_order: number;
  description: string;
  category: string | null;
  account_code: string | null;
  quantity: number;
  unit_amount: number;
  line_total: number | null;
  period_month: string | null;
  justification: string | null;
  document_path: string | null;
  status: string;
  approved_amount: number | null;
  decision_note: string | null;
}

export interface BudgetSubmission {
  id: string;
  call_id: string;
  department_id: string | null;
  reference: string;
  title: string | null;
  purpose: string | null;
  total_amount: number;
  approved_total: number;
  status: string;
  version: number;
  parent_submission_id: string | null;
  is_late: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  cfo_comment: string | null;
  created_at: string;
  submitted_by_user_id: string | null;
}

export interface BudgetAccount {
  code: string;
  label: string;
  section: string;
  nature: string;
}

export interface BudgetDepartment {
  id: string;
  name: string;
  key: string;
}

export interface BudgetVsActualRow {
  department_id: string | null;
  department_name: string;
  account_code: string;
  account_label: string | null;
  activity: string;
  requested: number;
  approved: number;
  previous_budget: number;
  actual: number;
  variance: number;
  utilization_pct: number | null;
}

export interface BudgetVsActual {
  cycle: { id: string; title: string; financial_year: string | null; period_start: string; period_end: string };
  rows: BudgetVsActualRow[];
  totals: { approved: number; requested: number; actual: number };
}

export interface BudgetConsolidation {
  cycle: BudgetCycle;
  totals: { requested: number; approved: number };
  by_activity: { activity: string; approved: number; requested: number }[];
  by_department: { department_id: string | null; department_name: string; approved: number; requested: number }[];
  by_account: {
    account_code: string; account_label: string | null; activity: string; section: string | null;
    approved: number; requested: number; actual: number; variance: number; utilization_pct: number | null;
  }[];
}

export interface BudgetEvent {
  id: string;
  submission_id: string;
  event_type: string;
  actor_user_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export const BUDGET_DOCUMENTS_BUCKET = 'budget-documents';

/**
 * Chart-of-accounts codes a department may budget against: spending categories
 * (expenses) and long-term asset purchases (capital items). Balance-sheet
 * accounts such as cash, wallet custody or shareholders' capital are not
 * budgetable — the same rule is enforced server-side in budget_save_draft.
 */
export function isBudgetableAccount(a: BudgetAccount) {
  return a.nature === 'expense' || a.section === 'non_current_asset';
}

export function useBudgetCycles() {
  const [cycles, setCycles] = useState<BudgetCycle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('budget_calls')
      .select('id,title,financial_year,period_type,period_start,period_end,deadline,instructions,status,created_at')
      .order('period_start', { ascending: false });
    if (error) throw error;
    setCycles((data ?? []) as BudgetCycle[]);
    setLoading(false);
  }, []);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  return { cycles, loading, reload: load };
}

export function useBudgetReferenceData() {
  const [accounts, setAccounts] = useState<BudgetAccount[]>([]);
  const [departments, setDepartments] = useState<BudgetDepartment[]>([]);
  const [myDepartments, setMyDepartments] = useState<BudgetDepartment[]>([]);

  useEffect(() => {
    (async () => {
      const [acc, dep, mine] = await Promise.all([
        supabase.from('ledger_account_catalog').select('code,label,section,nature').order('sort_order'),
        supabase.from('hr_departments').select('id,name,key').eq('active', true).order('name'),
        supabase.auth.getUser().then(async ({ data }) => {
          if (!data.user) return { data: [] as string[] };
          const { data: ids } = await supabase.rpc('budget_user_department_ids', { _user_id: data.user.id });
          return { data: (ids ?? []) as unknown as string[] };
        }),
      ]);
      const deps = (dep.data ?? []) as BudgetDepartment[];
      setAccounts((acc.data ?? []) as BudgetAccount[]);
      setDepartments(deps);
      const mineIds = new Set((mine.data ?? []).map(String));
      setMyDepartments(deps.filter(d => mineIds.has(d.id)));
    })().catch(() => undefined);
  }, []);

  return { accounts, departments, myDepartments };
}

export async function fetchSubmissions(callId?: string | null, departmentId?: string | null) {
  let q = supabase
    .from('budget_submissions')
    .select('id,call_id,department_id,reference,title,purpose,total_amount,approved_total,status,version,parent_submission_id,is_late,submitted_at,reviewed_at,cfo_comment,created_at,submitted_by_user_id')
    .order('created_at', { ascending: false });
  if (callId) q = q.eq('call_id', callId);
  if (departmentId) q = q.eq('department_id', departmentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as BudgetSubmission[];
}

export async function fetchLines(submissionId: string) {
  const { data, error } = await supabase
    .from('budget_submission_lines')
    .select('id,submission_id,sort_order,description,category,account_code,quantity,unit_amount,line_total,period_month,justification,document_path,status,approved_amount,decision_note')
    .eq('submission_id', submissionId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as BudgetLine[];
}

export async function fetchEvents(submissionId: string) {
  const { data, error } = await supabase
    .from('budget_submission_events')
    .select('id,submission_id,event_type,actor_user_id,payload,created_at')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as BudgetEvent[];
}

export async function fetchBudgetVsActual(callId: string, departmentId?: string | null) {
  const { data, error } = await supabase.rpc('get_budget_vs_actual', {
    p_call_id: callId,
    p_department_id: departmentId ?? null,
  });
  if (error) throw error;
  return data as unknown as BudgetVsActual;
}

export async function fetchConsolidation(callId: string) {
  const { data, error } = await supabase.rpc('get_budget_consolidation', { p_call_id: callId });
  if (error) throw error;
  return data as unknown as BudgetConsolidation;
}

export async function uploadBudgetDocument(file: File, submissionId?: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? 'anon';
  const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
  const { error } = await supabase.storage.from(BUDGET_DOCUMENTS_BUCKET).upload(path, file);
  if (error) throw error;
  if (submissionId) {
    await supabase.from('budget_submission_documents').insert({
      submission_id: submissionId, storage_path: path, file_name: file.name,
    });
  }
  return path;
}

export async function getBudgetDocumentUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(BUDGET_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Registers any attachment paths that were uploaded before the draft existed,
 * so reviewers and department colleagues can open them from the registry.
 */
export async function registerBudgetDocuments(submissionId: string, paths: string[]) {
  const wanted = paths.filter(Boolean);
  if (!wanted.length) return;
  const { data: existing } = await supabase
    .from('budget_submission_documents')
    .select('storage_path')
    .eq('submission_id', submissionId);
  const known = new Set((existing ?? []).map(r => r.storage_path));
  const missing = wanted.filter(p => !known.has(p));
  if (!missing.length) return;
  await supabase.from('budget_submission_documents').insert(
    missing.map(p => ({
      submission_id: submissionId,
      storage_path: p,
      file_name: p.split('/').pop() ?? null,
    })),
  );
}