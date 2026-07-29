
// src/components/manager/staff-access/roleCatalog.ts

//

// One source of truth for the role split.

//

// PUBLIC_ROLES  — field operations. Assigned in bulk by anyone holding

//                 `manager`. Dozens of changes a week. Deletable.

// STAFF_ROLES   — confer payroll, disciplinary, KYC and financial access

//                 through RLS. Assigned by `super_admin` only. Never deleted;

//                 removal sets enabled = false.

// MASTER_ROLE   — `super_admin`. Granted in SQL by a named person, never from

//                 a UI. Deliberately absent from STAFF_ROLES.

//

// These two arrays are the exact complement of the app_role enum. Any value

// added to the enum later and not added here is treated as staff, which fails

// closed. Keep them in step with the user_roles RLS policies of 2026-07-29.

export const PUBLIC_ROLES = [

  'tenant',

  'agent',

  'landlord',

  'supporter',

  'senior_agent',

  'sub_agent',

] as const;

export const STAFF_ROLES = [

  'admin',

  'agent_ops',

  'ceo',

  'cfo',

  'cmo',

  'coo',

  'crm',

  'employee',

  'financial_ops',

  'hr',

  'landlord_ops',

  'manager',

  'operations',

  'partner_ops',

  'tenant_ops',

] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const MASTER_ROLE = 'super_admin';

/** Mirrors the user_roles INSERT/UPDATE policy. */

export const CAN_MANAGE_ROLES: string[] = ['super_admin'];

/** Mirrors the staff_permissions INSERT/UPDATE policy. */

export const CAN_MANAGE_DASHBOARDS: string[] = ['super_admin', 'manager'];
