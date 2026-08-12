import { generateHouseVerificationReportPdf } from './src/lib/generateHouseVerificationReportPdf';
import { generateLandlordVerificationReportPdf } from './src/lib/generateLandlordVerificationReportPdf';
import { writeFileSync } from 'fs';

const house: any = {
  id: '1', title: 'Single Room in Central', house_category: 'single_room', monthly_rent: 200000, daily_rate: 6600,
  number_of_rooms: 1, address: 'Plot 4', district: 'Wakiso', village: 'Kira', region: 'Central',
  latitude: 0.3, longitude: 32.5, photo_count: 3, lc1_chairperson_name: 'LC1 Man', lc1_chairperson_phone: '0700',
  lc1_chairperson_village: 'Kira', verified: true, verified_at: new Date().toISOString(), verified_by_name: 'Jane',
  rejection_reason: null, rejected_at: null, rejected_by_name: null,
  review_comment: 'Photos and GPS confirmed on site visit.', review_comment_at: new Date().toISOString(),
  review_comment_by_name: 'Jane', review_comment_action: 'listing_verified', service_center_comment: null,
  activity_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  status: 'active', is_hidden: false, listing_bonus_paid: true, listing_bonus_paid_at: null,
  agent_name: 'Agent A', agent_phone: '0701', agent_email: 'a@b.c', tenant_id: null, tenant_name: null, tenant_phone: null,
  landlord_name: 'LL One', landlord_phone: '0702', landlord_verified: true, landlord_verification_status: 'verified',
  mobile_money_name: 'LL One', mobile_money_number: '0702', bank_name: null, account_number: null,
  landlord_village: 'Kira', landlord_district: 'Wakiso', landlord_region: 'Central',
};
const house2 = { ...house, id: '2', title: 'No comment house', review_comment: null };
const blob1 = generateHouseVerificationReportPdf([house, house2], { scope: 'verified', totalMatched: 2, search: '', quick: 'all', dateFrom: null, dateTo: null } as any);

const ll: any = {
  id: 'l1', name: 'LL One', phone: '0702', status: 'verified', source: 'ops_queue',
  verification_reason: 'Met landlord, confirmed ownership documents.', service_center_comment: null,
  verification_updated_at: new Date().toISOString(), verified_by_name: 'Jane', created_at: new Date().toISOString(),
  activity_at: new Date().toISOString(), village: 'Kira', district: 'Wakiso', region: 'Central',
  property_address: 'Plot 4', monthly_rent: 200000, number_of_houses: 2, number_of_rooms: 3,
  house_category: 'single_room', has_smartphone: true, mobile_money_name: 'LL One', mobile_money_number: '0702',
  bank_name: null, account_number: null, caretaker_name: null, caretaker_phone: null, tin: null,
  tenant_count: 1, has_tenant: true, agent_name: 'Agent A', agent_phone: '0701', tenant_name: 'T', tenant_phone: '0703',
};
const ll2 = { ...ll, id: 'l2', name: 'LL Two', verification_reason: null };
const blob2 = generateLandlordVerificationReportPdf([ll, ll2], { scope: 'verified', totalMatched: 2, search: '', quick: 'all', dateFrom: null, dateTo: null } as any);

for (const [n, b] of [['houses', blob1], ['landlords', blob2]] as any) {
  writeFileSync(`/tmp/pdfqa/${n}.pdf`, Buffer.from(await (b as Blob).arrayBuffer()));
}
console.log('ok');
