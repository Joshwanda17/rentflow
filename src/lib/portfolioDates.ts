import { format, isValid, parse } from 'date-fns';

const pad2 = (value: number) => String(value).padStart(2, '0');

export function formatLocalDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatUtcDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function dateOnlyToLocalDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateOnlyToUtcMiddayIso(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`;
}

export function extractDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : formatLocalDateOnly(date);
}

export function formatDateOnlyForDisplay(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const dateOnly = extractDateOnly(value);
  if (!dateOnly) return '—';

  return dateOnlyToLocalDate(dateOnly).toLocaleDateString('en-UG', options);
}

export function parseContributionDate(raw: any): string | null {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'number') {
    const serial = Math.floor(raw);
    const excelDays = serial > 59 ? serial - 1 : serial;
    const date = new Date(Date.UTC(1899, 11, 31 + excelDays));
    return Number.isNaN(date.getTime()) ? null : formatUtcDateOnly(date);
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatUtcDateOnly(raw);
  }

  const value = String(raw).trim();
  if (!value) return null;

  if (/^\d{1,2}-[A-Za-z]{3}-\d{2}$/.test(value)) {
    const date = parse(value, 'd-MMM-yy', new Date());
    return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
  }

  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(value)) {
    const date = parse(value, 'd-MMM-yyyy', new Date());
    return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${pad2(Number(isoMatch[2]))}-${pad2(Number(isoMatch[3]))}`;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const date = parse(value, 'M/d/yyyy', new Date());
    return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
  }

  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(value)) {
    const date = parse(value, 'd-M-yyyy', new Date());
    return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
  }

  return null;
}