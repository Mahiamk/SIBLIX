/**
 * SIBLIX.AI — Real Data Structures & Dynamic Metrics
 * All mock/hardcoded datasets have been removed in favor of real database records.
 */

export const INITIAL_EMAILS = [];

/**
 * Computes field-by-field verification accuracy dynamically from real emails.
 */
export function computeFieldAccuracyStats(emails = []) {
  const fields = [
    { key: 'shipper', label: 'Shipper' },
    { key: 'consignee', label: 'Consignee' },
    { key: 'notify_party', label: 'Notify Party' },
    { key: 'port_of_loading', label: 'Port of Loading' },
    { key: 'port_of_discharge', label: 'Port of Discharge' },
    { key: 'container_number', label: 'Container ID' },
    { key: 'gross_weight_kg', label: 'Gross Weight' },
  ];

  const blEmails = (emails || []).filter(
    (e) => e.category === 'BL_COMPARISON' && e.status !== 'PENDING'
  );
  const total = blEmails.length;

  if (total === 0) {
    return fields.map((f) => ({
      field: f.label,
      accuracy: 100.0,
      matched: 0,
      total: 0,
    }));
  }

  return fields.map((f) => {
    let defects = 0;
    for (const e of blEmails) {
      if (Array.isArray(e.defectFields)) {
        if (e.defectFields.includes(f.key)) {
          defects++;
        } else if (f.key === 'gross_weight_kg' && (e.defectFields.includes('gross_weight') || e.defectFields.includes('gross_weight_kg'))) {
          defects++;
        } else if (f.key === 'container_number' && (e.defectFields.includes('container_count') || e.defectFields.includes('container_number'))) {
          defects++;
        } else if (f.key === 'port_of_discharge' && (e.defectFields.includes('port_discharge') || e.defectFields.includes('port_of_discharge'))) {
          defects++;
        } else if (f.key === 'port_of_loading' && (e.defectFields.includes('port_loading') || e.defectFields.includes('port_of_loading'))) {
          defects++;
        }
      }
    }
    const matched = Math.max(0, total - defects);
    const accuracy = total > 0 ? Number(((matched / total) * 100).toFixed(1)) : 100.0;
    return {
      field: f.label,
      accuracy,
      matched,
      total,
    };
  });
}

/**
 * Computes a continuous 7-day usage time-series dynamically from emails.
 * The 7 dates always end on TODAY (or the latest email timestamp), formatted as "Sep 18" ... "Sep 24".
 */
export function getDynamicUsageTimeSeries(emails = []) {
  const now = new Date();
  let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const e of (emails || [])) {
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

  for (const e of (emails || [])) {
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

  return days.map(({ date, processed, matches, mismatches, reviews }) => ({
    date,
    processed,
    matches,
    mismatches,
    reviews,
  }));
}

export const USAGE_TIME_SERIES = getDynamicUsageTimeSeries([]);
export const FIELD_ACCURACY_STATS = computeFieldAccuracyStats([]);
