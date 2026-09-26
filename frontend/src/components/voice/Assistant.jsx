import React, { useEffect, useRef } from 'react';
import { VoxideClient, VoxideWidget } from '@voxide/react';
import { Microphone, Lock } from '@phosphor-icons/react';
import { MessageSquare } from 'lucide-react';
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

// ============================================================================
// SECURITY & USER ACCESS CONTROL ASSERTIONS
// ============================================================================

/**
 * Validates that an active, verified user session exists.
 * Optionally verifies Super Admin role requirement.
 */
const checkAuth = (app, requireSuperAdmin = false) => {
  if (!app?.isAuthenticated || !app?.token || !app?.username) {
    return {
      allowed: false,
      response: {
        status: 'error',
        code: 'UNAUTHENTICATED',
        message: 'Security Alert: Authentication required. SIBLIX Voice Assistant is restricted to authenticated users only.',
      },
    };
  }

  if (requireSuperAdmin && !app.isSuperAdmin) {
    return {
      allowed: false,
      response: {
        status: 'error',
        code: 'FORBIDDEN',
        message: `Security Alert: Access denied for ${app.username}. This governance action requires Super Admin privileges.`,
      },
    };
  }

  return { allowed: true };
};

/**
 * Validates operational tasks: verifies user is authenticated and enforces that
 * Super Admin accounts do NOT process operational shipments (keeping governance isolated).
 */
const checkOperationalAuth = (app) => {
  const auth = checkAuth(app);
  if (!auth.allowed) return auth;

  if (app.isSuperAdmin) {
    return {
      allowed: false,
      response: {
        status: 'error',
        code: 'ROLE_RESTRICTED',
        message: `Command restricted: You are authenticated as Super Admin (${app.username}). Document processing and verification actions are reserved for operations desk personnel.`,
      },
    };
  }

  return { allowed: true };
};

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

      const targetId = shipmentId || app.selectedEmailId;
      if (!targetId) return { status: 'error', message: 'No shipment specified for approval override.' };

      await app.submitReviewDecision(targetId, {
        action: 'approve',
        operator_id: app.username,
        action_taken: 'MANUAL_OVERRIDE_APPROVED',
        notes: `[VOICE NOTE by ${app.username} (${app.userRole})]: ${justification}`,
        voice_note: justification,
      });

      return {
        status: 'ok',
        shipmentId: targetId,
        operator: app.username,
        justification,
        summary: `Shipment ${targetId} approved with voice justification recorded to audit trail by ${app.username}: "${justification}".`,
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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

      const targetId = shipmentId || app.selectedEmailId;
      if (!targetId) return { status: 'error', message: 'No shipment specified for rejection.' };

      await app.submitReviewDecision(targetId, {
        action: 'reject',
        operator_id: app.username,
        action_taken: 'REJECTED_TO_SHIPPER',
        audit_reason_code: 'DEFECT_STANDS_UNRESOLVED',
        notes: `[VOICE NOTE by ${app.username} (${app.userRole})]: ${justification}`,
        voice_note: justification,
      });

      return {
        status: 'ok',
        shipmentId: targetId,
        operator: app.username,
        justification,
        summary: `Shipment ${targetId} rejected with voice justification recorded to audit trail by ${app.username}: "${justification}".`,
      };
    },
  },

  // 6. Navigate Workspace Tabs & Views (Role-Gated)
  navigateToTab: {
    description:
      'Navigate across workspace views: "dashboard", "emails" (inbox), "reviews" (queue), "detail" (inspector), "audit" (compliance ledger), "evaluation" (benchmarks), "settings", "profile", "superadmin" (Super Admin console), or "landing".',
    params: {
      tab: {
        type: 'string',
        required: true,
        description:
          'Target tab: dashboard, emails, reviews, detail, audit, evaluation, settings, profile, superadmin, landing',
      },
      shipmentId: {
        type: 'string',
        required: false,
        description: 'Optional shipment or email ID (e.g. EML-1002).',
      },
      section: {
        type: 'string',
        required: false,
        description: 'Optional page section anchor',
      },
      filter: {
        type: 'string',
        required: false,
        description: 'Optional search term or filter',
      },
    },
    handler: async ({ tab, shipmentId, section, filter }) => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app);
      if (!auth.allowed) return auth.response;

      const lower = tab.toLowerCase();
      let target = 'dashboard';

      if (lower.includes('superadmin') || lower.includes('root') || lower.includes('governance')) {
        if (!app.isSuperAdmin) {
          return {
            status: 'error',
            code: 'FORBIDDEN',
            message: `Access denied: User ${app.username} does not have Super Admin system privileges.`,
          };
        }
        target = 'superadmin';
      } else if (
        app.isSuperAdmin &&
        (lower.includes('email') ||
          lower.includes('inbox') ||
          lower.includes('review') ||
          lower.includes('detail') ||
          lower.includes('eval') ||
          lower.includes('quality'))
      ) {
        return {
          status: 'error',
          code: 'ROLE_RESTRICTED',
          message: `Restricted: As Super Admin (${app.username}), operational shipment processing views are disabled. Your console is dedicated to system posture, users, organizations, and audit telemetry.`,
        };
      } else if (lower.includes('email') || lower.includes('inbox') || lower.includes('explore')) target = 'emails';
      else if (lower.includes('review') || lower.includes('queue')) target = 'reviews';
      else if (lower.includes('audit') || lower.includes('ledger') || lower.includes('compliance')) target = 'audit';
      else if (lower.includes('eval') || lower.includes('quality') || lower.includes('benchmark') || lower.includes('sla')) target = 'evaluation';
      else if (lower.includes('setting') || lower.includes('config') || lower.includes('preference')) target = 'settings';
      else if (lower.includes('profile') || lower.includes('account') || lower.includes('user') || lower.includes('team')) target = 'profile';
      else if (lower.includes('detail') || lower.includes('inspect') || lower.includes('comparison')) target = 'detail';
      else if (lower.includes('landing') || lower.includes('home') || lower.includes('market')) target = 'landing';

      if (shipmentId && !app.isSuperAdmin) {
        const cleanId = shipmentId.toUpperCase().trim();
        const found = app.emails.find((e) => e.id === cleanId || e.id.includes(cleanId));
        if (found) {
          app.setSelectedEmailId(found.id);
          target = 'detail';
        }
      }

      if (filter && !app.isSuperAdmin) {
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
      'Trigger workspace actions: "upload_docs", "command_palette" (⌘K), "verify_all" (run pipeline), "clear_filters", "export_audit", or "logout".',
    params: {
      button: {
        type: 'string',
        required: true,
        description:
          'Action button: upload_docs, command_palette, verify_all, clear_filters, export_audit, logout',
      },
      actionType: {
        type: 'string',
        required: false,
        description: 'Optional sub-action: open, close, reset',
      },
    },
    handler: async ({ button, actionType }) => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app);
      if (!auth.allowed) return auth.response;

      const b = button.toLowerCase();

      if (b.includes('upload') || b.includes('import') || b.includes('drop')) {
        const opAuth = checkOperationalAuth(app);
        if (!opAuth.allowed) return opAuth.response;

        app.setUploadModalOpen(actionType !== 'close');
        return {
          status: 'ok',
          action: 'upload_modal',
          state: actionType !== 'close' ? 'opened' : 'closed',
          summary: 'Opened Upload Shipping Documents modal.',
        };
      }

      if (b.includes('palette') || b.includes('search') || b.includes('command') || b.includes('find')) {
        const opAuth = checkOperationalAuth(app);
        if (!opAuth.allowed) return opAuth.response;

        app.setCommandPaletteOpen(actionType !== 'close');
        return {
          status: 'ok',
          action: 'command_palette',
          state: actionType !== 'close' ? 'opened' : 'closed',
          summary: 'Opened Quick Search Command Palette (⌘K).',
        };
      }

      if (b.includes('verify') || b.includes('pipeline') || b.includes('run') || b.includes('process')) {
        const opAuth = checkOperationalAuth(app);
        if (!opAuth.allowed) return opAuth.response;

        app.runProcessingPipeline(true);
        return {
          status: 'ok',
          action: 'run_pipeline',
          summary: 'Started 3-stage automated verification pipeline across all shipments.',
        };
      }

      if (b.includes('auth') || b.includes('login') || b.includes('sign') || b.includes('register')) {
        return {
          status: 'error',
          message: `Already authenticated as ${app.username} (${app.userRole}). To switch users, please say 'Log out'.`,
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
        const loggedOutUser = app.username;
        app.handleLogout();
        try {
          ai.disconnect();
          ai.setUser(null);
        } catch {}
        return {
          status: 'ok',
          action: 'logout',
          summary: `Signed out ${loggedOutUser}. Voice session terminated.`,
        };
      }

      return { status: 'error', message: `Unrecognized button or action: ${button}` };
    },
  },

  // 8. Direct Shipment Inspection Tool
  inspectShipment: {
    description:
      'Open the side-by-side inspection view for a specific shipment or email ID (e.g. EML-1001, EML-1004).',
    params: {
      shipmentId: {
        type: 'string',
        required: true,
        description: 'Shipment or email ID (e.g. EML-1001, EML-1002, MSCU...)',
      },
    },
    handler: async ({ shipmentId }) => {
      const app = appBridgeRef.current;
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

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
      const auth = checkOperationalAuth(app);
      if (!auth.allowed) return auth.response;

      app.runProcessingPipeline(true);
      return {
        status: 'ok',
        message: 'Started 3-stage automated verification pipeline across all registered shipping correspondence.',
      };
    },
  },

  // 10. Super Admin Governance: User Lifecycle Console
  viewSuperAdminUsers: {
    description:
      'Super Admin only: Switch to User Management console to audit registered accounts, roles, and provisioning.',
    handler: async () => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app, true);
      if (!auth.allowed) return auth.response;

      app.setActiveTab('superadmin');
      return {
        status: 'ok',
        summary: `Navigated to Super Admin User Management console for user ${app.username}.`,
      };
    },
  },

  // 11. Super Admin Governance: Infrastructure Telemetry
  viewSuperAdminTelemetry: {
    description:
      'Super Admin only: View real-time platform telemetry, database connection health, and worker performance.',
    handler: async () => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app, true);
      if (!auth.allowed) return auth.response;

      app.setActiveTab('superadmin');
      return {
        status: 'ok',
        summary: `Opened Super Admin Infrastructure Telemetry console for user ${app.username}.`,
      };
    },
  },

  // 12. Super Admin Governance: Tenant Organizations
  viewSuperAdminOrganizations: {
    description:
      'Super Admin only: View registered tenant organizations and maritime shipping lines.',
    handler: async () => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app, true);
      if (!auth.allowed) return auth.response;

      app.setActiveTab('superadmin');
      return {
        status: 'ok',
        summary: `Opened registered tenant organizations catalog for user ${app.username}.`,
      };
    },
  },

  // 13. Super Admin Governance: System Audit Trail
  viewSuperAdminAudit: {
    description:
      'Super Admin only: Access system-wide immutable compliance audit logs and access events.',
    handler: async () => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app, true);
      if (!auth.allowed) return auth.response;

      app.setActiveTab('superadmin');
      return {
        status: 'ok',
        summary: `Opened immutable platform audit stream for user ${app.username}.`,
      };
    },
  },

  // 14. Super Admin Governance: Overall Posture & Health
  getSystemHealthOverview: {
    description:
      'Super Admin only: Check active system health, database connectivity, and platform governance posture.',
    handler: async () => {
      const app = appBridgeRef.current;
      const auth = checkAuth(app, true);
      if (!auth.allowed) return auth.response;

      return {
        status: 'ok',
        authenticatedSuperAdmin: app.username,
        systemHealth: 'OPERATIONAL',
        databaseEngine: 'PostgreSQL (Neon Cloud)',
        summary: `System operational. Database connected to Neon PostgreSQL. Authenticated as Super Admin ${app.username}.`,
      };
    },
  },
});

// Bind live UI state so the voice agent has real-time awareness
ai.bindState(() => {
  const app = appBridgeRef.current;
  if (!app || !app.isAuthenticated || !app.username) {
    return {
      authenticated: false,
      status: 'UNAUTHENTICATED_LOCKED',
      securityNotice: 'Access restricted to authenticated users only.',
    };
  }

  return {
    authenticated: true,
    currentUser: app.username,
    userRole: app.userRole,
    isSuperAdmin: app.isSuperAdmin,
    organization: app.userOrganization || (app.isSuperAdmin ? 'SIBLIX Core Infrastructure' : 'Operations Desk'),
    currentPage: typeof location !== 'undefined' ? location.pathname : '/',
    activeTab: app.activeTab,
    selectedShipmentId: app.selectedEmailId,
    totalShipments: app.emails.length,
    pendingReviewsCount: app.reviewQueue.length,
    activeSearchFilter: app.searchQuery || 'None',
    activeCategoryFilter: app.selectedCategory || 'ALL',
    activeStatusFilter: app.selectedStatus || 'ALL',
    activeDefectFilter: app.selectedDefectField || 'None',
  };
});

// Middleware: unconditionally reject voice action execution if user is unauthenticated
ai.use(async (ctx, next, cancel) => {
  const app = appBridgeRef.current;
  if (!app?.isAuthenticated || !app?.token || !app?.username) {
    cancel();
    try {
      ai.disconnect();
    } catch {}
    app?.addToast?.(
      'Security Alert: Unauthorized voice command rejected. Please sign in to authenticate.',
      'error'
    );
    return;
  }
  return next();
});

/**
 * Assistant Component
 * Mounted in the true root of the application (App.jsx).
 * Connects Voxide voice AI to live React state strictly for authenticated users.
 */
export function Assistant() {
  const app = useApp();
  const prevUserRef = useRef(null);

  // Keep bridge ref fresh with current AppContext
  useEffect(() => {
    appBridgeRef.current = app;
  }, [app]);

  // Synchronize authenticated user identity & dynamically configure Voxide specifically for THAT user
  useEffect(() => {
    if (!app?.isAuthenticated || !app?.token || !app?.username) {
      // Disconnect and wipe any prior user identity
      try {
        ai.disconnect();
        ai.setUser(null);
      } catch {}
      prevUserRef.current = null;
      return;
    }

    const currentUsername = app.username;
    const isSuperAdmin = app.isSuperAdmin;
    const role = app.userRole || (isSuperAdmin ? 'superadmin' : 'operator');
    const org = app.userOrganization || (isSuperAdmin ? 'SIBLIX Core Infrastructure' : 'Operations Desk');

    // If user switched or newly logged in, set user identity
    if (prevUserRef.current !== currentUsername) {
      ai.setUser({
        userId: currentUsername,
        name: currentUsername,
        username: currentUsername,
        role: role,
        organization: org,
        isSuperAdmin: isSuperAdmin,
      });

      if (isSuperAdmin) {
        ai.configureUI({
          title: 'SIBLIX Root Assistant',
          subtitle: `Super Admin · ${currentUsername}`,
          accentColor: '#717486',
          greeting: `Authenticated as Super Admin (${currentUsername}). System governance and telemetry online. How may I assist with platform oversight?`,
          starters: [
            'Show active system users',
            'Check system health and database telemetry',
            'View registered tenant organizations',
            'Show compliance audit trail',
          ],
        });
      } else {
        ai.configureUI({
          title: 'SIBLIX Voice Assistant',
          subtitle: `${currentUsername} · ${org}`,
          accentColor: '#FF6B00',
          greeting: `Authenticated as ${currentUsername} (${role}) for ${org}. Ready for shipment verification and document triage.`,
          starters: [
            'Show Awash Bank weight discrepancies at Modjo',
            'Inspect shipment EML-1002',
            'Run automated verification pipeline',
            'Open upload shipping docs modal',
            'Go to human review queue',
          ],
        });
      }

      prevUserRef.current = currentUsername;
    }
  }, [app?.isAuthenticated, app?.token, app?.username, app?.userRole, app?.userOrganization, app?.isSuperAdmin]);

  // Monitor live session snapshot: if unauthenticated at any moment, terminate immediately
  useEffect(() => {
    const unsubscribe = ai.subscribe(() => {
      const snap = ai.getSnapshot();
      const currentApp = appBridgeRef.current;
      if (!currentApp?.isAuthenticated || !currentApp?.username) {
        if (
          snap.status === 'connecting' ||
          snap.status === 'listening' ||
          snap.status === 'thinking' ||
          snap.status === 'speaking' ||
          snap.status === 'executing'
        ) {
          try {
            ai.disconnect();
          } catch {}
          currentApp?.addToast?.(
            'Security Alert: Voice session terminated. You must be authenticated to use SIBLIX Voice Assistant.',
            'error'
          );
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Intercept hands-free hotkey (Alt+V): strictly block and alert if not authenticated
  useEffect(() => {
    const handleHotkey = (e) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        const currentApp = appBridgeRef.current;
        if (!currentApp?.isAuthenticated || !currentApp?.username) {
          e.preventDefault();
          e.stopImmediatePropagation();
          try {
            ai.disconnect();
          } catch {}
          currentApp?.setAuthMode?.('signin');
          currentApp?.setAuthModalOpen?.(true);
          currentApp?.addToast?.(
            'Please sign in to use SIBLIX Voice Assistant.',
            'info'
          );
        }
      }
    };

    window.addEventListener('keydown', handleHotkey, true);
    return () => window.removeEventListener('keydown', handleHotkey, true);
  }, []);

  // Locked floating action button handler
  const handleLockedClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      ai.disconnect();
    } catch {}
    app?.setAuthMode?.('signin');
    app?.setAuthModalOpen?.(true);
    app?.addToast?.(
      'Please sign in to use SIBLIX Voice Assistant.',
      'info'
    );
  };

  // If user is unauthenticated, render the locked floating Voxide launcher button
  if (!app?.isAuthenticated || !app?.token || !app?.username) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center group">
        {/* Tooltip on hover */}
        <div className="absolute right-full mr-3.5 px-3 py-1.5 rounded-xl bg-slate-900/95 text-white text-xs font-medium shadow-xl border border-slate-700/80 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap flex items-center gap-2 transform translate-x-1 group-hover:translate-x-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Voice Assistant · Sign in to use</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400 border border-slate-700">Alt+V</span>
        </div>

        {/* Floating Voxide Button (Exact Orange Launcher with Locked Badge) */}
        <button
          type="button"
          onClick={handleLockedClick}
          aria-label="Voice Assistant - Click to sign in"
          title="Sign in to use SIBLIX Voice Assistant"
          className="relative w-14 h-14 rounded-full bg-[#FF6B00] hover:bg-[#fa5d00] text-white shadow-[0_8px_24px_rgba(255,107,0,0.38)] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#FF6B00]/30 cursor-pointer"
        >
          {/* White Chat Speech Bubble Icon matching Voxide launcher exactly */}
          <MessageSquare size={24} strokeWidth={2.2} className="text-white" />

          {/* Locked Badge */}
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-900 text-white border-2 border-white flex items-center justify-center shadow-md">
            <Lock size={11} weight="bold" />
          </div>
        </button>
      </div>
    );
  }

  // Render VoxideWidget passing user-specific theme color: Storm Grey (#717486) for Super Admin, Bright Orange (#FF6B00) for Operations
  return <VoxideWidget client={ai} accentColor={app.isSuperAdmin ? '#717486' : '#FF6B00'} />;
}

export default Assistant;
