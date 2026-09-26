export const INITIAL_EMAILS = [
  {
    id: 'EML-1001',
    subject: 'BL Verification Request — Booking MSCU7890123',
    sender: 'ops@meridian-traders.com',
    from: 'Lena Hoffmann · Meridian Traders',
    category: 'BL_COMPARISON',
    status: 'MISMATCH',
    conf: 0.98,
    date: 'Sep 21, 2026',
    time: '09:14',
    body: 'Hi team, please verify the draft BL (MSCU7890123) against our SI before release. Flag anything that does not match — especially container counts, our forwarding agent reported a possible over-count at the terminal.',
    atts: [
      { name: 'SI_MSCU7890123.pdf', type: 'SI', size: '412 KB', fields: 7, status: 'extracted', excerpt: ['SHIPPER: MERIDIAN TRADERS LTD.', 'CONSIGNEE: PACIFIC RIM IMPORTS INC.', 'CONTAINER COUNT: 3 x 40HC', 'GROSS WEIGHT: 21,500 KG'] },
      { name: 'BL_draft_MSCU7890123.pdf', type: 'BL', size: '388 KB', fields: 7, status: 'extracted', excerpt: ['Shipper: Meridian Traders Ltd.', 'Total Containers: 4', 'Gross Weight: 21,500 kg'] }
    ],
    defectFields: ['container_count'],
    si: {
      shipper: 'Meridian Traders Ltd.',
      consignee: 'Pacific Rim Imports Inc.',
      notify_party: 'Pacific Rim Imports — Receiving Dept.',
      port_of_loading: 'Shanghai, CN (CNSHA)',
      port_of_discharge: 'Rotterdam, NL (NLRTM)',
      container_count: 3,
      gross_weight_kg: 21500
    },
    bl: {
      shipper: 'Meridian Traders Ltd.',
      consignee: 'Pacific Rim Imports Inc.',
      notify_party: 'Pacific Rim Imports — Receiving Dept.',
      port_of_loading: 'Shanghai, CN (CNSHA)',
      port_of_discharge: 'Rotterdam, NL (NLRTM)',
      container_count: 4,
      gross_weight_kg: 21500
    },
    evidence: [
      { field: 'container_count', doc: 'SI', text: 'CONTAINER COUNT: 3 x 40HC' },
      { field: 'container_count', doc: 'BL', text: 'TOTAL CONTAINERS: 4' }
    ]
  },
  {
    id: 'EML-1002',
    subject: 'Draft BL for approval — HSCG2299017',
    sender: 'freight@nordwind-line.de',
    from: 'Jonas Weber · Nordwind Line',
    category: 'BL_COMPARISON',
    status: 'OK',
    conf: 0.99,
    date: 'Sep 21, 2026',
    time: '08:52',
    body: 'Our draft BL for booking HSCG2299017 is ready. Please run it against the SI on file and confirm everything matches before we issue the original.',
    atts: [
      { name: 'SI_HSCG2299017.pdf', type: 'SI', size: '351 KB', fields: 7, status: 'extracted' },
      { name: 'BL_HSCG2299017.pdf', type: 'BL', size: '330 KB', fields: 7, status: 'extracted' }
    ],
    defectFields: [],
    si: {
      shipper: 'Nordwind Logistik GmbH',
      consignee: 'Andes Fresh Foods S.A.',
      notify_party: 'Andes Fresh Foods S.A.',
      port_of_loading: 'Hamburg, DE (DEHAM)',
      port_of_discharge: 'Buenos Aires, AR (ARBUE)',
      container_count: 2,
      gross_weight_kg: 18400
    },
    bl: {
      shipper: 'Nordwind Logistik GmbH',
      consignee: 'Andes Fresh Foods S.A.',
      notify_party: 'Andes Fresh Foods S.A.',
      port_of_loading: 'Hamburg, DE (DEHAM)',
      port_of_discharge: 'Buenos Aires, AR (ARBUE)',
      container_count: 2,
      gross_weight_kg: 18400
    },
    evidence: []
  },
  {
    id: 'EML-1003',
    subject: 'BL vs SI check — container numbers differ?',
    sender: 'docs@evergreen-hk.com',
    from: 'Vivian Cheng · Evergreen HK',
    category: 'BL_COMPARISON',
    status: 'NEEDS_REVIEW',
    conf: 0.62,
    date: 'Sep 21, 2026',
    time: '09:41',
    body: 'Attached are our SI and the scanned draft BL. The copy from the terminal is quite faded — please check the container numbers carefully.',
    atts: [
      { name: 'SI_EVG2201.pdf', type: 'SI', size: '298 KB', fields: 7, status: 'extracted', excerpt: ['SHIPPER: EVERGREEN HARDWARE CO. LTD.', 'CONSIGNEE: HALCYON RETAIL GROUP', 'CONTAINER COUNT: 3 x 40HC'] },
      { name: 'BL_scan_EVG2201.pdf', type: 'BL', size: '1.2 MB', fields: 2, status: 'failed', excerpt: ['[scan quality 41 dpi — OCR failed]', 'Shipper: Evergreen Hardware Co. ????'] }
    ],
    defectFields: [],
    reviewReason: 'unreadable',
    si: {
      shipper: 'Evergreen Hardware Co. Ltd.',
      consignee: 'Halcyon Retail Group',
      notify_party: 'Halcyon Retail Group',
      port_of_loading: 'Hong Kong (HKHKG)',
      port_of_discharge: 'Felixstowe, GB (GBFXT)',
      container_count: 3,
      gross_weight_kg: 19750
    },
    bl: null,
    evidence: []
  },
  {
    id: 'EML-1004',
    subject: 'SI vs draft BL — please verify weights',
    sender: 'shipping@aptus-chemicals.com',
    from: 'Priya Nair · Aptus Chemicals',
    category: 'BL_COMPARISON',
    status: 'MISMATCH',
    conf: 0.96,
    date: 'Sep 20, 2026',
    time: '17:26',
    body: 'The gross weight on the draft BL looks higher than what we declared on the SI. Could you run the comparison and confirm which figure is correct?',
    atts: [
      { name: 'SI_APT88410.pdf', type: 'SI', size: '402 KB', fields: 7, status: 'extracted' },
      { name: 'BL_APT88410.pdf', type: 'BL', size: '377 KB', fields: 7, status: 'extracted' }
    ],
    defectFields: ['gross_weight_kg'],
    si: {
      shipper: 'Aptus Chemicals NV',
      consignee: 'Westport Industrial Corp.',
      notify_party: 'Westport Industrial Corp.',
      port_of_loading: 'Busan, KR (KRPUS)',
      port_of_discharge: 'Long Beach, US (USLGB)',
      container_count: 5,
      gross_weight_kg: 22850
    },
    bl: {
      shipper: 'Aptus Chemicals NV',
      consignee: 'Westport Industrial Corp.',
      notify_party: 'Westport Industrial Corp.',
      port_of_loading: 'Busan, KR (KRPUS)',
      port_of_discharge: 'Long Beach, US (USLGB)',
      container_count: 5,
      gross_weight_kg: 24850
    },
    evidence: [
      { field: 'gross_weight_kg', doc: 'SI', text: 'GROSS WEIGHT: 22,850 KG' },
      { field: 'gross_weight_kg', doc: 'BL', text: 'GROSS WEIGHT: 24,850 KG' }
    ]
  },
  {
    id: 'EML-1005',
    subject: 'New SI for booking EGHJ3310455',
    sender: 'ops@transandes.cl',
    from: 'Marco Silva · TransAndes',
    category: 'SI_REQUEST',
    status: 'PROCESSED',
    conf: 0.94,
    date: 'Sep 20, 2026',
    time: '15:03',
    body: 'Please find the completed Shipping Instruction for booking EGHJ3310455 attached. Kindly confirm receipt and expected BL cut-off.',
    atts: [
      { name: 'SI_EGHJ3310455.pdf', type: 'SI', size: '366 KB', fields: 7, status: 'extracted' }
    ],
    defectFields: [],
    si: {
      shipper: 'TransAndes Frutera SA',
      consignee: 'Rotterdam Fresh Hub BV',
      notify_party: 'Rotterdam Fresh Hub BV',
      port_of_loading: 'Valparaiso (CLVAP)',
      port_of_discharge: 'Rotterdam (NLRTM)',
      container_count: 3,
      gross_weight_kg: 24600
    }
  },
  {
    id: 'EML-1006',
    subject: 'Invoice INV-88412 — detention charges clarification',
    sender: 'ap@halcyon-retail.com',
    from: 'Accounts · Halcyon Retail',
    category: 'INVOICE_QUERY',
    status: 'PROCESSED',
    conf: 0.91,
    date: 'Sep 20, 2026',
    time: '11:47',
    body: 'We received invoice INV-88412 with two days of detention charges. Could you clarify why free time was exceeded? Booking ref HSCG2299017.',
    atts: [],
    defectFields: []
  },
  {
    id: 'EML-1007',
    subject: 'Port congestion update — Singapore, Week 38',
    sender: 'notices@portnet.sg',
    from: 'PSA Port Updates',
    category: 'GENERAL',
    status: 'PROCESSED',
    conf: 0.88,
    date: 'Sep 20, 2026',
    time: '10:12',
    body: 'Advisory: berth congestion at Singapore PSA continues. Vessels may experience 12–24h delays. No action is required from consignees at this time.',
    atts: [],
    defectFields: []
  },
  {
    id: 'EML-1008',
    subject: 'URGENT: Your shipment is being held — action required',
    sender: 'unknown@fast-cash-now.biz',
    from: 'Dr. Money',
    category: 'SPAM',
    status: 'PROCESSED',
    conf: 0.99,
    date: 'Sep 20, 2026',
    time: '09:38',
    body: 'Dear customer, your container has been seized by customs! Pay the release fee immediately via gift card to avoid permanent forfeiture…',
    atts: [],
    defectFields: []
  },
  {
    id: 'EML-1009',
    subject: 'BL check request (SI attached)',
    sender: 'tom@fjordlog.no',
    from: 'Tom Eriksen · Fjord Logistics',
    category: 'BL_COMPARISON',
    status: 'NEEDS_REVIEW',
    conf: 0.58,
    date: 'Sep 19, 2026',
    time: '16:44',
    body: 'Please compare our SI with the draft BL once it is issued. I believe only the SI made it into this email — the BL will follow from the carrier.',
    atts: [
      { name: 'SI_FJL55120.pdf', type: 'SI', size: '289 KB', fields: 7, status: 'extracted', excerpt: ['SHIPPER: FJORD LOGISTICS AS', 'CONSIGNEE: BAFFIN OUTDOOR CO.', 'CONTAINER COUNT: 2 x 20GP'] }
    ],
    defectFields: [],
    reviewReason: 'missing_attachment',
    si: {
      shipper: 'Fjord Logistics AS',
      consignee: 'Baffin Outdoor Co.',
      notify_party: 'Baffin Outdoor Co.',
      port_of_loading: 'Oslo (NOOSL)',
      port_of_discharge: 'Halifax, CA (CAHZD)',
      container_count: 2,
      gross_weight_kg: 14100
    },
    bl: null
  },
  {
    id: 'EML-1010',
    subject: 'Draft BL 559102 — consignee looks wrong',
    sender: 'anna@kestrel-ab.se',
    from: 'Anna Lindqvist · Kestrel Outdoor',
    category: 'BL_COMPARISON',
    status: 'MISMATCH',
    conf: 0.95,
    date: 'Sep 19, 2026',
    time: '14:05',
    body: 'Quick one — the consignee on draft BL 559102 does not look like the entity on our SI. Please run the check and flag the difference.',
    atts: [
      { name: 'SI_KST559102.pdf', type: 'SI', size: '344 KB', fields: 7, status: 'extracted' },
      { name: 'BL_KST559102.pdf', type: 'BL', size: '318 KB', fields: 7, status: 'extracted' }
    ],
    defectFields: ['consignee'],
    si: {
      shipper: 'Kestrel Outdoor Supply AB',
      consignee: 'Brightwave Retail Ltd.',
      notify_party: 'Brightwave Retail Ltd.',
      port_of_loading: 'Gothenburg (SEGOT)',
      port_of_discharge: 'Boston, US (USBOS)',
      container_count: 1,
      gross_weight_kg: 9200
    },
    bl: {
      shipper: 'Kestrel Outdoor Supply AB',
      consignee: 'Brightwave Global Trade Inc.',
      notify_party: 'Brightwave Retail Ltd.',
      port_of_loading: 'Gothenburg (SEGOT)',
      port_of_discharge: 'Boston, US (USBOS)',
      container_count: 1,
      gross_weight_kg: 9200
    },
    evidence: [
      { field: 'consignee', doc: 'SI', text: 'CONSIGNEE: BRIGHTWAVE RETAIL LTD.' },
      { field: 'consignee', doc: 'BL', text: 'CONSIGNEE: BRIGHTWAVE GLOBAL TRADE INC.' }
    ]
  }
];

/**
 * Computes a continuous 7-day usage time-series dynamically from emails or recent activity.
 * The 7 dates always end on TODAY (or the latest email timestamp), formatted as "Sep 18" ... "Sep 24".
 */
export function getDynamicUsageTimeSeries(emails = []) {
  const now = new Date();
  let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const e of emails) {
    const raw = e.createdAt || e.created_at || e.date;
    if (raw) {
      const ed = new Date(raw);
      if (!isNaN(ed.getTime()) && ed > endDate) {
        endDate = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
      }
    }
  }

  // 7 rolling calendar days leading up to endDate
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({
      date: dateLabel,
      ymd,
      processed: 0,
      matches: 0,
      mismatches: 0,
      reviews: 0,
    });
  }

  const dayBuckets = {};
  days.forEach((d) => {
    dayBuckets[d.ymd] = d;
  });

  const blEmails = emails.filter((e) => e.category === 'BL_COMPARISON');
  const cleanMatches = blEmails.filter((e) => e.status === 'OK' || e.status === 'REVIEWED').length;
  const mismatches = blEmails.filter((e) => e.status === 'MISMATCH').length;
  const needsReview = emails.filter((e) => e.status === 'NEEDS_REVIEW').length;
  const totalProcessed = emails.filter((e) => e.status !== 'PENDING').length;

  for (const e of emails) {
    const raw = e.createdAt || e.created_at || e.date;
    if (!raw) continue;
    const ed = new Date(raw);
    if (isNaN(ed.getTime())) continue;
    const ymd = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
    if (dayBuckets[ymd]) {
      if (e.status !== 'PENDING') dayBuckets[ymd].processed++;
      if (e.status === 'OK' || e.status === 'REVIEWED') dayBuckets[ymd].matches++;
      if (e.status === 'MISMATCH') dayBuckets[ymd].mismatches++;
      if (e.status === 'NEEDS_REVIEW') dayBuckets[ymd].reviews++;
    }
  }

  const daysWithData = days.filter((d) => d.processed > 0).length;
  // If emails were loaded in a single bulk seed timestamp, distribute baseline curve realistically across the 7 days
  if (emails.length > 0 && daysWithData <= 1) {
    const ratios = [0.09, 0.12, 0.15, 0.19, 0.17, 0.16, 0.12];
    const matchRatio = totalProcessed > 0 ? cleanMatches / totalProcessed : 0.88;
    const mismatchRatio = totalProcessed > 0 ? mismatches / totalProcessed : 0.08;
    const reviewRatio = totalProcessed > 0 ? needsReview / totalProcessed : 0.04;

    return days.map((day, idx) => {
      const p = Math.max(1, Math.round(totalProcessed * ratios[idx]));
      const m = Math.round(p * matchRatio);
      const mm = Math.round(p * mismatchRatio);
      const r = Math.max(0, p - m - mm);
      return {
        date: day.date,
        processed: p,
        matches: m,
        mismatches: mm,
        reviews: r,
      };
    });
  }

  // If no emails in state yet, return clean zeroes for each calendar day
  if (emails.length === 0) {
    return days.map((day) => ({
      date: day.date,
      processed: 0,
      matches: 0,
      mismatches: 0,
      reviews: 0,
    }));
  }

  return days.map(({ date, processed, matches, mismatches, reviews }) => ({
    date,
    processed,
    matches,
    mismatches,
    reviews,
  }));
}

export const USAGE_TIME_SERIES = getDynamicUsageTimeSeries([]);

export const FIELD_ACCURACY_STATS = [
  { field: 'Shipper', accuracy: 98.4, matched: 492, total: 500 },
  { field: 'Consignee', accuracy: 95.8, matched: 479, total: 500 },
  { field: 'Notify Party', accuracy: 94.2, matched: 471, total: 500 },
  { field: 'Port of Loading', accuracy: 99.1, matched: 495, total: 500 },
  { field: 'Port of Discharge', accuracy: 98.6, matched: 493, total: 500 },
  { field: 'Container Count', accuracy: 92.4, matched: 462, total: 500 },
  { field: 'Gross Weight', accuracy: 91.0, matched: 455, total: 500 },
];
