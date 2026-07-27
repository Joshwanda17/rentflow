/**
 * HR data contracts — Metrics
 * Part of the HR module contract. Do not add, rename or remove fields.
 */

export type MetricUnit =
  | 'count'
  | 'percent'
  | 'currency_ugx'
  | 'hours'
  | 'days'
  | 'ratio';

export type MetricDirection = 'higher_is_better' | 'lower_is_better';

export type MetricPeriodType = 'weekly' | 'monthly' | 'quarterly';

/**
 * Layer 1 universal primitives are derived from task timestamps and work for
 * every department with zero configuration. Layer 2 metrics are ROWS, not code.
 * If the string "Collections" ever appears in a conditional, the design is wrong.
 */

export type MetricSourceKey =
  // Layer 1 — universal, derived from the task event log
  | 'on_time_completion_rate'
  | 'acceptance_lag_hours'
  | 'cycle_time_hours'
  | 'rework_rate'
  | 'overdue_open_count'
  | 'completed_count'
  // Layer 2 — configured per department
  | 'manual'
  | 'external';

export interface MetricDefinition {
  id: string;
  key: string;                       // machine key, unique per department
  name: string;
  description: string;
  /** null = universal, applies to every department */
  department_id: string | null;
  unit: MetricUnit;
  direction: MetricDirection;
  target_value: number | null;
  /** Thresholds must be defensible. "Below team average" is not a threshold. */
  target_basis: 'target' | 'sla' | 'own_trend';
  period_type: MetricPeriodType;
  source: 'derived_task' | 'manual_entry' | 'external_system';
  source_key: MetricSourceKey;
  version: number;
  active: boolean;
  created_at: string;
  created_by_employee_id: string;
}

export type SnapshotStatus = 'open' | 'locked';

/**
 * IMMUTABLE once locked. Corrections create a NEW row that points at the one it
 * supersedes. This is what makes a monthly report you can screenshot and trust.
 */

export interface MetricSnapshot {
  id: string;
  metric_definition_id: string;
  metric_definition_version: number;
  subject_type: 'employee' | 'department';
  subject_id: string;
  /** Which posting this was measured under. Null for department subjects. */
  assignment_id: string | null;
  period_type: MetricPeriodType;
  period_start: string;
  period_end: string;
  value: number;
  target_value: number | null;
  attainment_pct: number | null;
  status: SnapshotStatus;
  computed_at: string;
  /** Immutable copy of the numbers the calculation ran on. */
  inputs_snapshot: Record<string, number | string>;
  supersedes_snapshot_id: string | null;
  correction_reason: string | null;
}

/** Statistics detects the anomaly. AI only narrates it. Never the reverse. */

export interface PerformanceFlag {
  id: string;
  subject_type: 'employee' | 'department';
  subject_id: string;
  metric_definition_id: string;
  period_start: string;
  period_end: string;
  flag_type: 'below_target' | 'sla_breach' | 'trend_decline' | 'trend_improve';
  severity: 'info' | 'watch' | 'action';
  /** Drafted by an LLM FROM the numbers above. Never a judgement of the person. */
  narrative_text: string | null;
  narrative_model: string | null;
  acknowledged_by_employee_id: string | null;
  acknowledged_at: string | null;
  created_at: string;
}
