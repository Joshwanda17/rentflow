/**
 * HR data access — Recruitment
 * No component may import from `src/hr/mocks/` directly. Read through here.
 */
import type {
  Application,
  Candidate,
  HiringRequisition,
  JobPosting,
  Rubric,
} from '../types';
import recruitmentData from '../mocks/recruitment.json';
import applicationData from '../mocks/applications.json';
import { resolve } from './client';

export async function getHiringRequisitions(): Promise<HiringRequisition[]> {
  return resolve(recruitmentData.hiring_requisitions as HiringRequisition[]);
}

export async function getJobPostings(status?: string): Promise<JobPosting[]> {
  let rows = recruitmentData.job_postings as JobPosting[];
  if (status) rows = rows.filter((j) => j.status === status);
  return resolve(rows);
}

export async function getJobPosting(jobId: string): Promise<JobPosting | null> {
  const found = (recruitmentData.job_postings as JobPosting[]).find((j) => j.id === jobId);
  return resolve(found ?? null);
}

export async function getCandidates(): Promise<Candidate[]> {
  return resolve(recruitmentData.candidates as Candidate[]);
}

export async function getRubrics(): Promise<Rubric[]> {
  return resolve(recruitmentData.rubrics as unknown as Rubric[]);
}

export async function getRubric(rubricId: string): Promise<Rubric | null> {
  const found = (recruitmentData.rubrics as unknown as Rubric[]).find((r) => r.id === rubricId);
  return resolve(found ?? null);
}

export async function getApplications(
  params: { jobPostingId?: string; stage?: string } = {},
): Promise<Application[]> {
  let rows = applicationData.applications as unknown as Application[];
  if (params.jobPostingId) rows = rows.filter((a) => a.job_posting_id === params.jobPostingId);
  if (params.stage) rows = rows.filter((a) => a.stage === params.stage);
  return resolve(rows);
}

export async function getApplication(applicationId: string): Promise<Application | null> {
  const found = (applicationData.applications as unknown as Application[]).find(
    (a) => a.id === applicationId,
  );
  return resolve(found ?? null);
}

/**
 * Mock write. Note the required `decidedByEmployeeId` — there is no code path
 * in this application that changes an application stage without a named human.
 */
export async function setApplicationStage(
  applicationId: string,
  stage: Application['stage'],
  decidedByEmployeeId: string,
  reason: string,
): Promise<Application> {
  const found = (applicationData.applications as unknown as Application[]).find(
    (a) => a.id === applicationId,
  );
  if (!found) throw new Error('Application not found');
  return resolve({
    ...found,
    stage,
    decided_by_employee_id: decidedByEmployeeId,
    decision_reason: reason,
    stage_changed_at: new Date().toISOString(),
  });
}
