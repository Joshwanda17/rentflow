// Script to generate the partner import template
// This file creates the template at build time
import * as XLSX from 'xlsx';

const headers = [
  'Partner Name',
  'Phone',
  'Email',
  'Investment Amount',
  'ROI %',
  'Duration (Months)',
  'ROI Mode',
];

const sampleData = [
  ['Ssenkaali Pius', '0700123456', 'pius@example.com', 500000, 15, 12, 'monthly_compounding'],
  ['Ssenkaali Pius', '0700123456', 'pius@example.com', 300000, 15, 12, 'monthly_payout'],
  ['Namukisha Esther', '0754155112', 'esther@example.com', 1000000, 15, 12, 'monthly_compounding'],
  ['John Doe', '0771234567', '', 200000, 15, 6, 'monthly_payout'],
];

export function generateTemplate(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // Partner Name
    { wch: 15 }, // Phone
    { wch: 25 }, // Email
    { wch: 18 }, // Investment Amount
    { wch: 8 },  // ROI %
    { wch: 18 }, // Duration
    { wch: 22 }, // ROI Mode
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Partners');
  
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}
