/**
 * HR data access — Metrics
 * No component may import from `src/hr/mocks/` directly. Read through here.
 */
import type { MetricDefinition, MetricSnapshot, PerformanceFlag } from '../types';
import metricData from '../mocks/metrics.json';
import { resolve } from './client';

export async function getMetricDefinitions(
  departmentId?: string,
): Promise<MetricDefinition[]> {
  let rows = metricData.metric_definitions as MetricDefinition[];
  if (departmentId) {
    // null department_id means universal — always included.
    rows = rows.filter((m) => m.department_id === null || m.department_id === departmentId);
  }
  return resolve(rows);
}

export async function getMetricSnapshots(params: {
  subjectType: 'employee' | 'department';
  subjectId: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<MetricSnapshot[]> {
  let rows = (metricData.metric_snapshots as MetricSnapshot[]).filter(
    (s) => s.subject_type === params.subjectType && s.subject_id === params.subjectId,
  );
  if (params.periodStart) {
    rows = rows.filter((s) => s.period_start >= (params.periodStart as string));
  }
  if (params.periodEnd) {
    rows = rows.filter((s) => s.period_end <= (params.periodEnd as string));
  }
  return resolve(rows);
}

export async function getPerformanceFlags(params: {
  subjectType?: 'employee' | 'department';
  subjectId?: string;
}): Promise<PerformanceFlag[]> {
  let rows = metricData.performance_flags as PerformanceFlag[];
  if (params.subjectType) {
    rows = rows.filter((f) => f.subject_type === params.subjectType);
  }
  if (params.subjectId) {
    rows = rows.filter((f) => f.subject_id === params.subjectId);
  }
  return resolve(rows);
}
