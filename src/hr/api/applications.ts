/**
 * Professional careers applications — read and triage (`job_applications`).
 *
 * Three deliberate choices, each recorded so they are not undone by accident:
 *
 * 1. Columns are listed explicitly rather than selected with `*`.
 *    `expected_salary` is therefore never read by this screen. It is the widest
 *    individual-pay surface in the database — seven roles hold SELECT on this
 *    table — and it is recorded as never being a scoring input.
 *
 * 2. Nothing here scores, ranks or orders applicants. Rows come back newest
 *    first, which is chronological rather than evaluative. Ordering people is
 *    forbidden by decision; ordering a list by arrival is not.
 *
 * 3. Nothing here deletes. Erasure on request is a separate operation carried
 *    out by an `hr` or `super_admin` holder and recorded when it happens.
 *
 * A decision writes `status`, `decided_at`, `decided_by` and `decision_reason`
 * together, so no decision exists without a reason and an author. Marking
 * someone contacted writes `contacted_at` and `contacted_by` and leaves the
 * status alone — being contacted is not a decision.
 */
import { supabase } from './client';

/** Cap on one fetch. Filtering and counting happen in the browser over this set. */
const MAX_ROWS = 500;

/**
 * The status vocabulary. `new` is the column default, written by the public
 * form; the other three are written here.
 *
 * This list lives in TypeScript because nothing in the database defines it —
 * `job_applications.status` is free text with a default and no check
 * constraint. If a lookup table is added later, this constant is the one place
 * to replace. The screen still renders any status value it finds in the data,
 * including one not listed here, so an unrecognised value is never hidden.
 */
export const APPLICATION_DECISIONS = ['shortlisted', 'hold', 'rejected'] as const;

export type ApplicationDecision = (typeof APPLICATION_DECISIONS)[number];

export interface JobApplicationRow {
  id: string;
  full_name: string;
  email: string | null;
  whatsapp_number: string | null;
  category: string;
  role_interest: string | null;
  experience_level: string | null;
  location: string | null;
  employment_type: string | null;
  current_employer: string | null;
  highest_education: string | null;
  availability_date: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  cover_note: string | null;
  resume_url: string | null;
  resume_filename: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: string;
  contacted_at: string | null;
  contacted_by: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  created_at: string;
}

const COLUMNS = [
  'id',
  'full_name',
  'email',
  'whatsapp_number',
  'category',
  'role_interest',
  'experience_level',
  'location',
  'employment_type',
  'current_employer',
  'highest_education',
  'availability_date',
  'linkedin_url',
  'portfolio_url',
  'cover_note',
  'resume_url',
  'resume_filename',
  'source',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'status',
  'contacted_at',
  'contacted_by',
  'decided_at',
  'decided_by',
  'decision_reason',
  'created_at',
].join(', ');

/** Every application this account is allowed to read, newest first. RLS decides which. */
export async function listJobApplications(): Promise<JobApplicationRow[]> {
  const { data, error } = await supabase
    .from('job_applications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as JobApplicationRow[];
}

async function actingUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  const id = data?.user?.id;
  if (!id) throw new Error('You are signed out. Sign in again to record this.');
  return id;
}

/**
 * Record a decision. The reason is required: a status change with no recorded
 * reason is indistinguishable from a mis-click when it is read back later.
 */
export async function recordApplicationDecision(
  applicationId: string,
  decision: ApplicationDecision,
  reason: string,
): Promise<JobApplicationRow> {
  const trimmedReason = (reason ?? '').trim();
  if (trimmedReason.length < 3) {
    throw new Error('Add a short reason before recording this decision.');
  }

  const decidedBy = await actingUserId();

  const { data, error } = await supabase
    .from('job_applications')
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
      decision_reason: trimmedReason,
    })
    .eq('id', applicationId)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as JobApplicationRow;
}

/**
 * Remove an application from the working list without destroying it.
 *
 * This is a soft removal: `purged_at` is stamped and the row stays in the
 * table. `job_applications` has no `purged_by` column, so authorship of the
 * removal is not written here. Nothing in this module deletes.
 */
export async function purgeApplication(applicationId: string): Promise<void> {
  await actingUserId();

  const { error } = await supabase
    .from('job_applications')
    .update({ purged_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) throw new Error(error.message);
}

/** Stamp that a person has been reached. Not a decision, so the status is untouched. */
export async function markApplicationContacted(
  applicationId: string,
): Promise<JobApplicationRow> {
  const contactedBy = await actingUserId();

  const { data, error } = await supabase
    .from('job_applications')
    .update({
      contacted_at: new Date().toISOString(),
      contacted_by: contactedBy,
    })
    .eq('id', applicationId)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as JobApplicationRow;
}
