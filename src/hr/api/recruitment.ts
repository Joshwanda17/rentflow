/**
 * HR data access — Recruitment
 */
import { supabase, unwrap, requireUserId } from './client';
import type {
  Application,
  Candidate,
  HiringRequisition,
  JobPosting,
  Rubric,
} from '../types';

const NOT_PROVISIONED = 'Recruitment tables are not provisioned yet';

export async function getHiringRequisitions(): Promise<HiringRequisition[]> {
  return [];
}

export async function getJobPostings(_status?: string): Promise<JobPosting[]> {
  return [];
}

export async function getJobPosting(_jobId: string): Promise<JobPosting | null> {
  return null;
}

export async function getCandidates(): Promise<Candidate[]> {
  return [];
}

export async function getRubrics(): Promise<Rubric[]> {
  return [];
}

export async function getRubric(_rubricId: string): Promise<Rubric | null> {
  return null;
}

export async function getApplications(
  _params: { jobPostingId?: string; stage?: string } = {},
): Promise<Application[]> {
  return [];
}

export async function getApplication(_applicationId: string): Promise<Application | null> {
  return null;
}

export async function setApplicationStage(
  _applicationId: string,
  _stage: Application['stage'],
  _decidedByEmployeeId: string,
  _reason: string,
): Promise<Application> {
  throw new Error(NOT_PROVISIONED);
}
