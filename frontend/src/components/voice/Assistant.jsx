import React, { useEffect, useRef } from 'react';
import { VoxideClient, VoxideWidget } from '@voxide/react';
import { useApp } from '../../context/AppContext';
import { generateDiscrepancyBriefingText } from '../../utils/audioBriefing';

// Shared reference so Voxide action handlers can call live AppContext functions
const appBridgeRef = { current: null };

// Initialize Voxide Client with publishable key
// Explicitly configure panel launcherMode so users get live streaming transcriptions,
// status updates, and visual feedback rather than an opaque voice bar.
export const ai = new VoxideClient({
  publicKey: 'vox_pub_251bbeb18bb55103cc9f8901a01cff0cdaac84be261d9256',
  ui: {
    hotkeyActivate: 'alt+v', // Alt+V toggles hands-free voice triage
    launcherMode: 'panel',
    defaultMode: 'voice',
    position: 'bottom-right',
    theme: 'dark',
    accentColor: '#FF6B00', // Bright Orange
    title: 'SIBLIX Voice Assistant',
    subtitle: 'Maritime Verification Triage (Alt+V)',
    showStatusText: true,
    greeting:
      'SIBLIX Voice Assistant ready. Navigate tabs, trigger buttons (Upload, Verify, ⌘K Search), or filter shipments by status, defect, bank, port, and date window.',
    placeholder: 'Navigate tabs, trigger buttons, or filter shipments...',
    starters: [
      'Go to Company Audit ledger',
      'Inspect shipment EML-1002',
      'Open upload shipping docs modal',
      'Show Awash Bank weight discrepancies at Modjo',
      'Run automated verification pipeline',
    ],
  },
});

// Helper normalizers for the 7 maritime parameters
const isWithinTimeHorizon = (dateStr, horizon) => {
  if (!horizon || horizon === 'all_time' || horizon === 'all') return true;
  const itemDate = new Date(dateStr);
  if (isNaN(itemDate.getTime())) return true;
  const now = new Date();
  const diffHours = (now - itemDate) / (1000 * 60 * 60);

  const h = horizon.toLowerCase().replace(/[\s-]/g, '_');
  if (h === 'today') return diffHours <= 24;
  if (h === 'yesterday') return diffHours > 24 && diffHours <= 48;
  if (h === 'this_week' || h === 'week') return diffHours <= 168; // 7 days
  if (h === 'this_month' || h === 'month') return diffHours <= 720; // 30 days
  return true;
};

const normalizeDefectType = (raw) => {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('weight') || lower.includes('ክብደት') || lower.includes('ulfaatina')) return 'gross_weight_kg';
  if (lower.includes('container') || lower.includes('ኮንቴይነር') || lower.includes('konteeyinara')) return 'container_count';
  if (lower.includes('consignee') || lower.includes('ተቀባይ') || lower.includes('name')) return 'consignee';
  if (lower.includes('port') || lower.includes('discharge') || lower.includes('ወደብ') || lower.includes('buufata')) return 'port_of_discharge';
  if (lower.includes('hs') || lower.includes('tariff') || lower.includes('code')) return 'hs_code';
  if (lower.includes('loading')) return 'port_of_loading';
  if (lower.includes('shipper') || lower.includes('ላኪ')) return 'shipper';
  return raw;
};

const matchesEscalationReason = (email, reason) => {
  if (!reason) return true;
  const r = reason.toLowerCase();
  const text = `${email.body || ''} ${email.subject || ''} ${email.escalationReason || ''}`.toLowerCase();

  if (r.includes('ocr') || r.includes('unreadable') || r.includes('faded') || r.includes('dpi')) {
    return (email.atts && email.atts.some((a) => (a.ocr_dpi && a.ocr_dpi < 50) || a.unreadable)) || text.includes('ocr') || text.includes('dpi') || (email.conf && email.conf < 0.7);
  }
  if (r.includes('missing') || r.includes('attachment')) {
    return (!email.atts || email.atts.length < 2) || text.includes('missing') || (email.defectFields || []).includes('missing_attachment');
  }
  if (r.includes('wrong') || r.includes('type') || r.includes('invalid_doc')) {
    return (email.atts && email.atts.some((a) => a.type === 'OTHER' || a.type === 'UNKNOWN')) || text.includes('wrong');
  }
  if (r.includes('empty') || r.includes('required') || r.includes('null')) {
    return Object.values(email.si || {}).some((v) => v === null || v === '' || v === undefined) || text.includes('empty');
  }
  return text.includes(r);
};

const matchesFinancialParties = (email, party) => {
  if (!party) return true;
  let p = party.trim().toLowerCase();
  if (p.includes('አዋሽ') || p.includes('awash')) p = 'awash';
  else if (p.includes('ንግድ ባንክ') || p.includes('cbe') || p.includes('commercial')) p = 'commercial bank';
  else if (p.includes('ዳሸን') || p.includes('dashen')) p = 'dashen';
  else if (p.includes('አቢሲንያ') || p.includes('abyssinia')) p = 'abyssinia';

  const text = `${email.si?.consignee || ''} ${email.bl?.consignee || ''} ${email.si?.shipper || ''} ${email.bl?.shipper || ''} ${email.si?.notify_party || ''} ${email.subject || ''} ${email.body || ''} ${email.from || ''} ${email.sender || ''}`.toLowerCase();
  return text.includes(p);
};

const matchesLogisticsHub = (email, hub) => {
  if (!hub) return true;
  let h = hub.trim().toLowerCase();
  if (h.includes('ሞጆ') || h.includes('mojo') || h.includes('modjo')) h = 'modjo';
  else if (h.includes('ቃሊቲ') || h.includes('kality')) h = 'kality';
  else if (h.includes('ሰመራ') || h.includes('semera')) h = 'semera';
  else if (h.includes('ጅቡቲ') || h.includes('djibouti')) h = 'djibouti';

  const text = `${email.si?.port_of_discharge || ''} ${email.bl?.port_of_discharge || ''} ${email.si?.port_of_loading || ''} ${email.bl?.port_of_loading || ''} ${email.subject || ''} ${email.body || ''}`.toLowerCase();
  return text.includes(h);
};

const matchesSearchEntities = (email, entity) => {
  if (!entity) return true;
  const query = entity.trim().toLowerCase();
  const text = `${email.id || ''} ${email.subject || ''} ${email.body || ''} ${email.from || ''} ${JSON.stringify(email.si || {})} ${JSON.stringify(email.bl || {})}`.toLowerCase();
  return text.includes(query);
};

const normalizeCategory = (raw) => {
  if (!raw || raw === 'ALL' || raw === 'all') return 'ALL';
  const lower = raw.toLowerCase();
  if (lower.includes('comparison') || lower.includes('bl') || lower.includes('lading') || lower.includes('cross')) return 'BL_COMPARISON';
  if (lower.includes('instruction') || lower.includes('si') || lower.includes('request')) return 'SI_REQUEST';
  if (lower.includes('invoice') || lower.includes('demurrage') || lower.includes('detention') || lower.includes('charge')) return 'INVOICE_QUERY';
  if (lower.includes('general') || lower.includes('advisory') || lower.includes('congestion')) return 'GENERAL';
  if (lower.includes('spam') || lower.includes('phishing')) return 'SPAM';
  return raw.toUpperCase();
};

const normalizeStatus = (raw) => {
  if (!raw || raw === 'ALL' || raw === 'all') return 'ALL';
  const s = raw.toUpperCase().trim();
  if (s === 'CLEAN' || s === 'CLEARED' || s === 'MATCH') return 'OK';
  if (s === 'DEFECT' || s === 'DISCREPANCY') return 'MISMATCH';
  if (s === 'REVIEW' || s === 'ESCALATION' || s === 'PENDING') return 'NEEDS_REVIEW';
  if (s === 'APPROVED' || s === 'OVERRIDDEN') return 'REVIEWED';
  if (s === 'REJECT') return 'REJECTED';
  return s;
};

const matchesVerificationStatus = (email, status) => {
  if (!status || status === 'ALL' || status === 'all') return true;
  const s = status.toUpperCase().trim();
  if (s === 'OK' || s === 'CLEAN' || s === 'CLEARED' || s === 'MATCH') return email.status === 'OK' || email.status === 'REVIEWED';
  if (s === 'MISMATCH' || s === 'DEFECT' || s === 'DISCREPANCY') return email.status === 'MISMATCH';
  if (s === 'NEEDS_REVIEW' || s === 'REVIEW' || s === 'ESCALATION' || s === 'PENDING') return email.status === 'NEEDS_REVIEW' || email.status === 'MISMATCH';
  if (s === 'REVIEWED' || s === 'APPROVED') return email.status === 'REVIEWED';
  if (s === 'REJECTED' || s === 'REJECT') return email.status === 'REJECTED';
  if (s === 'PROCESSED') return email.status === 'PROCESSED' || email.status === 'OK' || email.status === 'REVIEWED';
  return email.status === s;
};

// Register REAL operational capabilities for SIBLIX.AI
ai.register({
  // 1. Comprehensive Multi-Parameter Shipment Filtering
  filterShipments: {
    description:
      'Filter and search shipping documents across all operational dimensions: Category (BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL), Status (OK, MISMATCH, NEEDS_REVIEW, REVIEWED), Defect Type (Gross Weight, Consignee name, Container Count, Port of Discharge, HS Code), Review Escalation Reason (Unreadable OCR, Missing Attachment, Wrong Document Type), Financial Opening Banks (Awash Bank, CBE, Dashen), Logistics Hubs (Modjo Dry Port, Kality, Semera, Djibouti), Search Entities (Booking reference, Container ID, Commodity), and Time Horizon (today, yesterday, this_week, this_month).',
    params: {
      category: {
        type: 'string',
        required: false,
        description:
          'Category: Filters correspondence by classification intent (BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL, SPAM, or ALL)',
      },
      status: {
        type: 'string',
        required: false,
        description:
          'Status: Filters shipments by verification workflow status (OK clean match, MISMATCH discrepancy, NEEDS_REVIEW human escalation, REVIEWED, REJECTED, or ALL)',
      },
      verificationStatus: {
        type: 'string',
        required: false,
        description:
          'Verification Status: Alias for status filter (OK, MISMATCH, NEEDS_REVIEW, ALL)',
      },
      defectType: {
        type: 'string',
        required: false,
        description:
          'Defect Type: Identifies specific field failures (e.g. Gross Weight, Consignee name, Container Count, Port of Discharge, or HS Code)',
      },
      reviewEscalationReason: {
        type: 'string',
        required: false,
        description:
          'Review Escalation Reason: Captures safety-halt categories (e.g. Unreadable OCR, Missing Attachment, Wrong Document Type, or Empty Required Value)',
      },
      financialAndLegalParties: {
        type: 'string',
        required: false,
        description:
          'Financial & Legal Parties: Filters by opening bank (Awash Bank, Commercial Bank of Ethiopia, Dashen Bank) or specific exporter/shipper names',
      },
      logisticsHubsAndCorridors: {
        type: 'string',
        required: false,
        description:
          'Logistics Hubs & Corridors: Filters by transit or inland destination dry ports (Modjo Dry Port, Kality, Semera, Port of Djibouti)',
      },
      searchEntities: {
        type: 'string',
        required: false,
        description:
          'Search Entities: Freeform identifiers extracted from speech (Booking References, Container IDs, or commodities like Coffee or Sesame)',
      },
      timeHorizon: {
        type: 'string',
        required: false,
        description:
          'Time Horizon: Relative date windows (e.g. "today", "yesterday", "this_week", "this_month", or "all_time")',
      },
    },
    handler: async ({
      category,
      status,
      verificationStatus,
      defectType,
      reviewEscalationReason,
      financialAndLegalParties,
      logisticsHubsAndCorridors,
      searchEntities,
      timeHorizon,
    }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const normalizedCat = normalizeCategory(category);
      const activeStatus = normalizeStatus(status || verificationStatus);
      const normalizedDefect = normalizeDefectType(defectType);

      // Apply UI filter state in React AppContext
      if (normalizedCat) {
        app.setSelectedCategory(normalizedCat);
      }
      if (activeStatus) {
        app.setSelectedStatus(activeStatus);
      } else {
        app.setSelectedStatus('ALL');
      }

      if (normalizedDefect) {
        app.filterByDefectField(normalizedDefect, `Defect: ${normalizedDefect}`);
      } else {
        app.clearDefectFilter();
      }

      const activeSearchTerms = [financialAndLegalParties, logisticsHubsAndCorridors, searchEntities]
        .filter(Boolean)
        .join(' ');

      app.setSearchQuery(activeSearchTerms);
      app.setActiveTab('emails');

      // Filter the email collection against all dimensions
      const matches = app.emails.filter((e) => {
        if (normalizedCat && normalizedCat !== 'ALL' && e.category !== normalizedCat) return false;
        if (!matchesVerificationStatus(e, activeStatus)) return false;
        if (normalizedDefect) {
          const hasDefect = (e.defectFields || []).some(
            (f) => f === normalizedDefect || (normalizedDefect === 'gross_weight_kg' && f === 'gross_weight')
          );
          if (!hasDefect) return false;
        }
        if (!matchesEscalationReason(e, reviewEscalationReason)) return false;
        if (!matchesFinancialParties(e, financialAndLegalParties)) return false;
        if (!matchesLogisticsHub(e, logisticsHubsAndCorridors)) return false;
        if (!matchesSearchEntities(e, searchEntities)) return false;
        if (!isWithinTimeHorizon(e.date, timeHorizon)) return false;
        return true;
      });

      // Construct rich feedback summary
      const appliedFilters = [];
      if (normalizedCat && normalizedCat !== 'ALL') appliedFilters.push(`Category: ${normalizedCat}`);
      if (activeStatus && activeStatus !== 'ALL') appliedFilters.push(`Status: ${activeStatus}`);
      if (defectType) appliedFilters.push(`Defect: ${defectType}`);
      if (reviewEscalationReason) appliedFilters.push(`Reason: ${reviewEscalationReason}`);
      if (financialAndLegalParties) appliedFilters.push(`Party: ${financialAndLegalParties}`);
      if (logisticsHubsAndCorridors) appliedFilters.push(`Port: ${logisticsHubsAndCorridors}`);
      if (searchEntities) appliedFilters.push(`Entity: ${searchEntities}`);
      if (timeHorizon) appliedFilters.push(`Time: ${timeHorizon}`);

      const summaryText = appliedFilters.length > 0
        ? `Found ${matches.length} shipments matching [${appliedFilters.join(', ')}].`
        : `Showing all ${matches.length} shipments in inbox.`;

      return {
        status: 'ok',
        matchedCount: matches.length,
        appliedFilters,
        topShipmentIds: matches.slice(0, 5).map((m) => m.id),
        summary: summaryText,
      };
    },
  },

  // 2. Dedicated Category Filter Tool
  filterByCategory: {
    description:
      'Filter shipping correspondence by category: BL_COMPARISON (BL verification), SI_REQUEST (Shipping Instruction submission), INVOICE_QUERY (Demurrage or freight invoices), GENERAL (Operations advisories), SPAM, or ALL.',
    params: {
      category: {
        type: 'string',
        required: true,
        description: 'Category name: BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL, SPAM, or ALL',
      },
    },
    handler: async ({ category }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const catKey = normalizeCategory(category);
      app.setSelectedCategory(catKey);
      app.setActiveTab('emails');

      const matches = app.emails.filter((e) => (catKey === 'ALL' ? true : e.category === catKey));

      return {
        status: 'ok',
        category: catKey,
        matchedCount: matches.length,
        summary: `Filtered inbox to ${catKey === 'ALL' ? 'all categories' : catKey}. Found ${matches.length} matching emails.`,
      };
    },
  },

  // 3. Dedicated Status Filter Tool
  filterByStatus: {
    description:
      'Filter shipments by verification workflow status: OK (Clean match), MISMATCH (Discrepancy flagged), NEEDS_REVIEW (Needs human review), REVIEWED (Approved & cleared), REJECTED (Rejected to shipper), or ALL.',
    params: {
      status: {
        type: 'string',
        required: true,
        description: 'Target status: OK, MISMATCH, NEEDS_REVIEW, REVIEWED, REJECTED, or ALL',
      },
    },
    handler: async ({ status }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const finalStatus = normalizeStatus(status);
      app.setSelectedStatus(finalStatus);
      app.setActiveTab('emails');

      const matches = app.emails.filter((e) => matchesVerificationStatus(e, finalStatus));

      return {
        status: 'ok',
        statusFilter: finalStatus,
        matchedCount: matches.length,
        summary: `Filtered inbox to status: ${finalStatus}. Found ${matches.length} matching shipments.`,
      };
    },
  },

  // 2. Hands-Free Querying: Bank, Carrier, Port, Container, or Reference
  // Backward-compatible with search queries
  searchShipments: {
    description:
      'Search shipments by bank, carrier, port, container number, or entity keywords. Supports English, Amharic ("የአዋሽ ባንክ ጫነቶች"), and Afaan Oromoo ("Meeshaalee buufata Mojootti").',
    params: {
      query: {
        type: 'string',
        required: true,
        description: 'Search keyword such as bank name, port, container number, or carrier',
      },
      verificationStatus: {
        type: 'string',
        required: false,
        description: 'Optional status: OK, MISMATCH, or NEEDS_REVIEW',
      },
      timeHorizon: {
        type: 'string',
        required: false,
        description: 'Optional date window: today, yesterday, this_week, this_month',
      },
    },
    handler: async ({ query, verificationStatus, timeHorizon }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      let cleanQuery = query.trim();
      if (cleanQuery.includes('አዋሽ') || cleanQuery.toLowerCase().includes('awash')) cleanQuery = 'Awash';
      else if (cleanQuery.includes('ንግድ ባንክ') || cleanQuery.toLowerCase().includes('cbe') || cleanQuery.toLowerCase().includes('commercial bank')) cleanQuery = 'Commercial Bank';
      else if (cleanQuery.includes('ዳሸን') || cleanQuery.toLowerCase().includes('dashen')) cleanQuery = 'Dashen';
      else if (cleanQuery.includes('ሞጆ') || cleanQuery.toLowerCase().includes('mojo') || cleanQuery.toLowerCase().includes('modjo')) cleanQuery = 'Modjo';
      else if (cleanQuery.includes('ጅቡቲ') || cleanQuery.toLowerCase().includes('djibouti')) cleanQuery = 'Djibouti';
      else if (cleanQuery.includes('ቃሊቲ') || cleanQuery.toLowerCase().includes('kality')) cleanQuery = 'Kality';

      app.setSearchQuery(cleanQuery);
      if (verificationStatus) app.setSelectedStatus(verificationStatus.toUpperCase());
      app.setActiveTab('emails');

      const matches = app.emails.filter((e) => {
        if (!matchesVerificationStatus(e, verificationStatus)) return false;
        if (!isWithinTimeHorizon(e.date, timeHorizon)) return false;
        const text = `${e.subject} ${e.from} ${e.id} ${e.si?.consignee || ''} ${e.bl?.consignee || ''} ${e.si?.port_of_discharge || ''}`.toLowerCase();
        return text.includes(cleanQuery.toLowerCase());
      });

      return {
        status: 'ok',
        query: cleanQuery,
        matchedCount: matches.length,
        summary: `Filtered inbox to "${cleanQuery}". Found ${matches.length} matching shipping documents.`,
      };
    },
  },

  // 3. Discrepancy & Defect Filtering (Weight discrepancies, missing attachments, container mismatches)
  filterDiscrepancies: {
    description:
      'Filter shipping documents by specific discrepancy or defect type, with optional bank, corridor, or time horizon filters.',
    params: {
      defectType: {
        type: 'string',
        required: true,
        description:
          'Defect type: gross_weight_kg (weight discrepancy), container_count (container variance), consignee (consignee mismatch), port_of_discharge (port error), hs_code, or missing_attachment',
      },
      bankOrCarrier: {
        type: 'string',
        required: false,
        description: 'Optional bank or carrier filter e.g. Awash Bank, CBE',
      },
      logisticsHubsAndCorridors: {
        type: 'string',
        required: false,
        description: 'Optional dry port corridor e.g. Modjo, Kality, Semera',
      },
      timeHorizon: {
        type: 'string',
        required: false,
        description: 'Optional relative time window e.g. today, this_week',
      },
    },
    handler: async ({ defectType, bankOrCarrier, logisticsHubsAndCorridors, timeHorizon }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const fieldKey = normalizeDefectType(defectType) || defectType;
      app.filterByDefectField(fieldKey, `Defect: ${fieldKey}`);

      const searchWords = [bankOrCarrier, logisticsHubsAndCorridors].filter(Boolean).join(' ');
      if (searchWords) {
        app.setSearchQuery(searchWords);
      }

      const matchingReviews = app.reviewQueue.filter((e) => {
        const hasDefect = (e.defectFields || []).includes(fieldKey);
        if (!hasDefect) return false;
        if (!matchesFinancialParties(e, bankOrCarrier)) return false;
        if (!matchesLogisticsHub(e, logisticsHubsAndCorridors)) return false;
        if (!isWithinTimeHorizon(e.date, timeHorizon)) return false;
        return true;
      });

      return {
        status: 'ok',
        field: fieldKey,
        reviewCount: matchingReviews.length,
        summary: `Filtered to ${fieldKey} discrepancies${bankOrCarrier ? ` for ${bankOrCarrier}` : ''}${logisticsHubsAndCorridors ? ` at ${logisticsHubsAndCorridors}` : ''}. Found ${matchingReviews.length} flagged shipments in queue.`,
      };
    },
  },

  // 3. Port Clearance Query
  // Afaan Oromoo: "Meeshaalee buufata Mojootti qophii ta'an naaf agarsiisi" ("Show me shipments cleared for Modjo port")
  queryClearedPortShipments: {
    description:
      'Show shipments cleared for a specific dry port or maritime terminal, such as Modjo Dry Port, Kality, or Djibouti. Handles Afaan Oromoo queries like "Meeshaalee buufata Mojootti qophii ta\'an naaf agarsiisi" ("Show me shipments cleared for Modjo port").',
    params: {
      port: {
        type: 'string',
        required: true,
        description: 'Dry port name e.g. Modjo, Kality, Djibouti',
      },
    },
    handler: async ({ port }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      app.setSearchQuery(port);
      app.setSelectedStatus('OK');
      app.setActiveTab('emails');

      const cleared = app.emails.filter((e) => {
        const p = `${e.si?.port_of_discharge || ''} ${e.bl?.port_of_discharge || ''} ${e.subject}`.toLowerCase();
        return p.includes(port.toLowerCase()) && (e.status === 'OK' || e.status === 'REVIEWED');
      });

      return {
        status: 'ok',
        port,
        clearedCount: cleared.length,
        summary: `Found ${cleared.length} shipments cleared for ${port} with zero discrepancy holds.`,
      };
    },
  },

  // 4. Audio Discrepancy Briefing
  // Rapid 10-second summary for an inspector checking physical documents against a terminal screen
  audioDiscrepancyBriefing: {
    description:
      'Generate and speak a rapid 10-second audio discrepancy briefing for an inspector checking physical documents against a terminal screen. Can specify a shipment ID like EML-1002 or defaults to the currently inspected shipment.',
    params: {
      shipmentId: {
        type: 'string',
        required: false,
        description: 'Optional shipment or email ID (e.g. EML-1002). If omitted, uses currently selected shipment.',
      },
    },
    handler: async ({ shipmentId }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const targetId = shipmentId || app.selectedEmailId;
      const shipment = app.emails.find((e) => e.id === targetId) || app.selectedEmail;

      if (!shipment) {
        return { status: 'error', message: `Shipment ${targetId} not found in current desk database.` };
      }

      app.setSelectedEmailId(shipment.id);
      app.setActiveTab('detail');

      const briefing = generateDiscrepancyBriefingText(shipment);

      return {
        status: 'ok',
        shipmentId: shipment.id,
        briefing,
        spoken: true,
      };
    },
  },

  // 5. Auditable Voice Notes for Manual Overrides
  // "Approved because shipper submitted amended NBE permit via phone"
  approveOverrideWithVoiceJustification: {
    description:
      'Approve and release a flagged shipment with an auditable voice note justification (e.g. "Approved because shipper submitted amended NBE permit via phone"). Permanently records the justification into the legal compliance audit trail.',
    params: {
      shipmentId: {
        type: 'string',
        required: false,
        description: 'Shipment or email ID to approve (e.g. EML-1002). Defaults to selected shipment.',
      },
      justification: {
        type: 'string',
        required: true,
        description: 'The verbal justification / phone confirmation reason for releasing the shipment',
      },
    },
    handler: async ({ shipmentId, justification }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const targetId = shipmentId || app.selectedEmailId;
      if (!targetId) return { status: 'error', message: 'No shipment specified for approval override.' };

      await app.submitReviewDecision(targetId, {
        action: 'approve',
        action_taken: 'MANUAL_OVERRIDE_APPROVED',
        notes: `[VOICE NOTE]: ${justification}`,
        voice_note: justification,
      });

      return {
        status: 'ok',
        shipmentId: targetId,
        justification,
        summary: `Shipment ${targetId} approved with voice justification recorded to audit trail: "${justification}".`,
      };
    },
  },

  // 6. Voice Rejection with Justification
  rejectShipmentWithVoiceJustification: {
    description:
      'Reject a flagged shipment back to shipper with an auditable voice note justification (e.g. "Rejected due to severe gross weight discrepancy"). Permanently records the justification into the legal compliance audit trail.',
    params: {
      shipmentId: {
        type: 'string',
        required: false,
        description: 'Shipment or email ID to reject (e.g. EML-1002). Defaults to selected shipment.',
      },
      justification: {
        type: 'string',
        required: true,
        description: 'The verbal justification or discrepancy reason for rejecting the shipment',
      },
    },
    handler: async ({ shipmentId, justification }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const targetId = shipmentId || app.selectedEmailId;
      if (!targetId) return { status: 'error', message: 'No shipment specified for rejection.' };

      await app.submitReviewDecision(targetId, {
        action: 'reject',
        action_taken: 'REJECTED_TO_SHIPPER',
        audit_reason_code: 'DEFECT_STANDS_UNRESOLVED',
        notes: `[VOICE NOTE]: ${justification}`,
        voice_note: justification,
      });

      return {
        status: 'ok',
        shipmentId: targetId,
        justification,
        summary: `Shipment ${targetId} rejected with voice justification recorded to audit trail: "${justification}".`,
      };
    },
  },

  // 6. Navigate Workspace Tabs & Views (Enhanced Multi-Parameter)
  navigateToTab: {
    description:
      'Navigate across all workspace tabs, pages, and sub-views: "dashboard" (overview), "emails" (inbox & explorer), "reviews" (human review queue), "detail" (shipment inspector), "audit" (company compliance audit ledger), "evaluation" (quality & benchmarks / SLAs), "settings", "profile" (my operator account), or "landing" (marketing website). Also supports jumping directly to a shipment or specific page section.',
    params: {
      tab: {
        type: 'string',
        required: true,
        description:
          'Target tab: dashboard, emails (inbox), reviews (queue), detail (inspector), audit (ledger), evaluation (benchmarks), settings, profile, landing',
      },
      shipmentId: {
        type: 'string',
        required: false,
        description: 'Optional shipment or email ID (e.g. EML-1002). If provided, selects this shipment and opens the inspector view.',
      },
      section: {
        type: 'string',
        required: false,
        description: 'Optional page section anchor to scroll into view: interactive-demo, drivers, timeline, metrics, security',
      },
      filter: {
        type: 'string',
        required: false,
        description: 'Optional search term or filter to apply immediately upon arrival',
      },
    },
    handler: async ({ tab, shipmentId, section, filter }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const lower = tab.toLowerCase();
      let target = 'dashboard';
      if (lower.includes('email') || lower.includes('inbox') || lower.includes('explore')) target = 'emails';
      else if (lower.includes('review') || lower.includes('queue')) target = 'reviews';
      else if (lower.includes('audit') || lower.includes('ledger') || lower.includes('compliance')) target = 'audit';
      else if (lower.includes('eval') || lower.includes('quality') || lower.includes('benchmark') || lower.includes('sla')) target = 'evaluation';
      else if (lower.includes('setting') || lower.includes('config') || lower.includes('preference')) target = 'settings';
      else if (lower.includes('profile') || lower.includes('account') || lower.includes('user') || lower.includes('team')) target = 'profile';
      else if (lower.includes('detail') || lower.includes('inspect') || lower.includes('comparison')) target = 'detail';
      else if (lower.includes('landing') || lower.includes('home') || lower.includes('market')) target = 'landing';

      if (shipmentId) {
        const cleanId = shipmentId.toUpperCase().trim();
        const found = app.emails.find((e) => e.id === cleanId || e.id.includes(cleanId));
        if (found) {
          app.setSelectedEmailId(found.id);
          target = 'detail';
        }
      }

      if (filter) {
        app.setSearchQuery(filter);
      }

      app.setActiveTab(target);

      if (section && typeof document !== 'undefined') {
        setTimeout(() => {
          const el = document.getElementById(section) || document.querySelector(`[data-section="${section}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      }

      return {
        status: 'ok',
        navigatedTo: target,
        selectedShipmentId: shipmentId || app.selectedEmailId,
        summary: `Navigated to ${target}${shipmentId ? ` inspecting ${shipmentId}` : ''}${section ? ` at section ${section}` : ''}.`,
      };
    },
  },

  // 7. Interactive Button & Action Trigger Tool
  triggerActionButton: {
    description:
      'Trigger any workspace action button or modal dialog: "upload_docs" (open upload modal), "command_palette" (open quick search ⌘K), "verify_all" (run automated pipeline), "auth_modal" (open sign-in / registration), "clear_filters" (reset search & filter chips), "export_audit" (export compliance logs), or "logout" (sign out).',
    params: {
      button: {
        type: 'string',
        required: true,
        description:
          'Action button: upload_docs, command_palette, verify_all (run_pipeline), auth_modal, clear_filters, export_audit, logout',
      },
      actionType: {
        type: 'string',
        required: false,
        description: 'Optional sub-action: open, close, signin, register, reset',
      },
    },
    handler: async ({ button, actionType }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const b = button.toLowerCase();

      if (b.includes('upload') || b.includes('import') || b.includes('drop')) {
        app.setUploadModalOpen(actionType !== 'close');
        return {
          status: 'ok',
          action: 'upload_modal',
          state: actionType !== 'close' ? 'opened' : 'closed',
          summary: 'Opened Upload Shipping Documents modal.',
        };
      }

      if (b.includes('palette') || b.includes('search') || b.includes('command') || b.includes('find')) {
        app.setCommandPaletteOpen(actionType !== 'close');
        return {
          status: 'ok',
          action: 'command_palette',
          state: actionType !== 'close' ? 'opened' : 'closed',
          summary: 'Opened Quick Search Command Palette (⌘K).',
        };
      }

      if (b.includes('verify') || b.includes('pipeline') || b.includes('run') || b.includes('process')) {
        app.runProcessingPipeline(true);
        return {
          status: 'ok',
          action: 'run_pipeline',
          summary: 'Started 3-stage automated verification pipeline across all shipments.',
        };
      }

      if (b.includes('auth') || b.includes('login') || b.includes('sign') || b.includes('register')) {
        if (actionType === 'register') app.setAuthMode('register');
        else app.setAuthMode('signin');
        app.setAuthModalOpen(actionType !== 'close');
        return {
          status: 'ok',
          action: 'auth_modal',
          state: actionType !== 'close' ? 'opened' : 'closed',
          summary: 'Opened Authentication dialog.',
        };
      }

      if (b.includes('clear') || b.includes('reset')) {
        app.setSearchQuery('');
        app.setSelectedStatus('ALL');
        app.setSelectedCategory('ALL');
        app.clearDefectFilter();
        return {
          status: 'ok',
          action: 'clear_filters',
          summary: 'Reset all active search queries, status, category, and defect filters.',
        };
      }

      if (b.includes('export') || b.includes('download')) {
        app.setActiveTab('audit');
        return {
          status: 'ok',
          action: 'export_audit',
          summary: 'Navigated to audit ledger for export.',
        };
      }

      if (b.includes('logout') || b.includes('signout')) {
        app.handleLogout();
        return {
          status: 'ok',
          action: 'logout',
          summary: 'Signed out of current operator session.',
        };
      }

      return { status: 'error', message: `Unrecognized button or action: ${button}` };
    },
  },

  // 8. Direct Shipment Inspection Tool
  inspectShipment: {
    description:
      'Open the side-by-side inspection view for a specific shipment or email ID (e.g. EML-1001, EML-1004). Automatically displays the SI vs BL comparison, extracted fields, and legal approval banner.',
    params: {
      shipmentId: {
        type: 'string',
        required: true,
        description: 'Shipment or email ID (e.g. EML-1001, EML-1002, MSCU...)',
      },
    },
    handler: async ({ shipmentId }) => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      const cleanId = shipmentId.toUpperCase().trim();
      const shipment = app.emails.find(
        (e) =>
          e.id === cleanId ||
          e.id.includes(cleanId) ||
          (e.subject && e.subject.toUpperCase().includes(cleanId))
      );

      if (!shipment) {
        return { status: 'error', message: `Shipment ${shipmentId} not found in workspace.` };
      }

      app.setSelectedEmailId(shipment.id);
      app.setActiveTab('detail');

      const defects =
        shipment.defectFields && shipment.defectFields.length > 0
          ? shipment.defectFields.join(', ')
          : 'None (Clean Match)';

      return {
        status: 'ok',
        shipmentId: shipment.id,
        verificationStatus: shipment.status,
        defectFields: shipment.defectFields || [],
        summary: `Inspecting shipment ${shipment.id} (${shipment.status}). Defect fields: ${defects}.`,
      };
    },
  },

  // 9. Trigger Automated Pipeline Verification
  runVerificationPipeline: {
    description:
      'Trigger the automated 3-stage verification pipeline across all pending shipping instructions and bills of lading.',
    handler: async () => {
      const app = appBridgeRef.current;
      if (!app) return { status: 'error', message: 'Operations desk context unavailable.' };

      app.runProcessingPipeline(true);
      return {
        status: 'ok',
        message: 'Started 3-stage automated verification pipeline across all registered shipping correspondence.',
      };
    },
  },
});

// Bind live UI state so the voice agent has real-time awareness
ai.bindState(() => {
  const app = appBridgeRef.current;
  if (!app) {
    return {
      desk: 'SIBLIX Operations Desk',
      currentPage: typeof location !== 'undefined' ? location.pathname : '/',
    };
  }

  return {
    currentPage: typeof location !== 'undefined' ? location.pathname : '/',
    activeTab: app.activeTab,
    selectedShipmentId: app.selectedEmailId,
    totalShipments: app.emails.length,
    pendingReviewsCount: app.reviewQueue.length,
    activeSearchFilter: app.searchQuery || 'None',
    activeCategoryFilter: app.selectedCategory || 'ALL',
    activeStatusFilter: app.selectedStatus || 'ALL',
    activeDefectFilter: app.selectedDefectField || 'None',
    userRole: app.userRole,
    organization: app.userOrganization || 'Default Desk',
  };
});

/**
 * Assistant Component
 * Mounted ONCE in the true root of the application (App.jsx).
 * Connects Voxide voice AI to live React state.
 */
export function Assistant() {
  const app = useApp();

  // Keep bridge ref fresh with current AppContext
  useEffect(() => {
    appBridgeRef.current = app;
  }, [app]);

  // Set user context in Voxide client if logged in
  useEffect(() => {
    if (app?.username) {
      ai.setUser({
        userId: app.username,
        name: app.username,
        organization: app.userOrganization || 'Default Desk',
        role: app.userRole,
      });
    }
  }, [app?.username, app?.userOrganization, app?.userRole]);

  // Render VoxideWidget passing bright orange accentColor to ensure floating message button is bright orange
  return <VoxideWidget client={ai} accentColor="#FF6B00" />;
}

export default Assistant;
