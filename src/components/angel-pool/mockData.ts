export interface MockInvestor {
  id: string;
  name: string;
  amount: number;
  shares: number;
  date: string;
  status: 'confirmed' | 'pending' | 'partial';
}

export interface MockFeedEvent {
  id: string;
  type: 'pledge' | 'secured';
  name: string;
  amount: number;
  timestamp: string;
}

export const MOCK_INVESTORS: MockInvestor[] = [
  { id: '1', name: 'Kamanzi David', amount: 20_000_000, shares: 1000, date: '2026-03-28', status: 'confirmed' },
  { id: '2', name: 'Namubiru Grace', amount: 15_000_000, shares: 750, date: '2026-03-27', status: 'confirmed' },
  { id: '3', name: 'Okello Joseph', amount: 12_000_000, shares: 600, date: '2026-03-26', status: 'confirmed' },
  { id: '4', name: 'Apio Sarah', amount: 10_000_000, shares: 500, date: '2026-03-25', status: 'confirmed' },
  { id: '5', name: 'Mugisha Peter', amount: 8_000_000, shares: 400, date: '2026-03-24', status: 'confirmed' },
  { id: '6', name: 'Nakato Rebecca', amount: 6_000_000, shares: 300, date: '2026-03-23', status: 'partial' },
  { id: '7', name: 'Ssempijja Ronald', amount: 5_000_000, shares: 250, date: '2026-03-22', status: 'confirmed' },
  { id: '8', name: 'Nabirye Fatuma', amount: 4_000_000, shares: 200, date: '2026-03-21', status: 'pending' },
  { id: '9', name: 'Tumusiime Brian', amount: 3_000_000, shares: 150, date: '2026-03-20', status: 'confirmed' },
  { id: '10', name: 'Birungi Mercy', amount: 2_000_000, shares: 100, date: '2026-03-19', status: 'pending' },
];

export const MOCK_TOTAL_RAISED = 175_000_000; // 35% filled

export const MOCK_FEED_EVENTS: MockFeedEvent[] = [
  { id: 'e1', type: 'secured', name: 'Kamanzi D.', amount: 20_000_000, timestamp: '2 min ago' },
  { id: 'e2', type: 'pledge', name: 'Namubiru G.', amount: 15_000_000, timestamp: '5 min ago' },
  { id: 'e3', type: 'secured', name: 'Okello J.', amount: 12_000_000, timestamp: '12 min ago' },
  { id: 'e4', type: 'pledge', name: 'Apio S.', amount: 10_000_000, timestamp: '18 min ago' },
  { id: 'e5', type: 'secured', name: 'Mugisha P.', amount: 8_000_000, timestamp: '25 min ago' },
  { id: 'e6', type: 'pledge', name: 'Nakato R.', amount: 6_000_000, timestamp: '32 min ago' },
  { id: 'e7', type: 'secured', name: 'Ssempijja R.', amount: 5_000_000, timestamp: '45 min ago' },
  { id: 'e8', type: 'pledge', name: 'Nabirye F.', amount: 4_000_000, timestamp: '1 hr ago' },
  { id: 'e9', type: 'secured', name: 'Tumusiime B.', amount: 3_000_000, timestamp: '1.5 hr ago' },
  { id: 'e10', type: 'pledge', name: 'Birungi M.', amount: 2_000_000, timestamp: '2 hr ago' },
  { id: 'e11', type: 'secured', name: 'Katamba E.', amount: 7_500_000, timestamp: '3 hr ago' },
  { id: 'e12', type: 'pledge', name: 'Lubega S.', amount: 1_500_000, timestamp: '4 hr ago' },
  { id: 'e13', type: 'secured', name: 'Nankya C.', amount: 9_000_000, timestamp: '5 hr ago' },
  { id: 'e14', type: 'pledge', name: 'Sserunkuma A.', amount: 3_500_000, timestamp: '6 hr ago' },
  { id: 'e15', type: 'secured', name: 'Kyeyune M.', amount: 11_000_000, timestamp: '7 hr ago' },
];
