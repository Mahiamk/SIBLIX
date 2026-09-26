export const PRODUCT = {
  name: 'SIBLIX',
  suffix: '.AI',
  tagline: 'AI Document Verification for Smarter Shipping',
  sub: 'Intelligent Shipping Document Verification',
  engine: 'SIBLIX Engine v2.5',
};

export const CATEGORIES = {
  BL_COMPARISON: {
    key: 'BL_COMPARISON',
    label: 'BL Comparison',
    color: '#171B24', // Thunderhead Pitch (Violent Storm)
    bg: '#F0F4F8',    // Ozone Glare
    border: '#CBD7E5', // Cold Lightning Halo
    icon: 'GitDiff',
    description: 'SI vs draft BL cross-document verification'
  },
  SI_REQUEST: {
    key: 'SI_REQUEST',
    label: 'SI Request',
    color: '#0D9488', // Muted Teal
    bg: '#F0FDFA',
    border: '#99F6E4',
    icon: 'FileText',
    description: 'New Shipping Instruction submission'
  },
  INVOICE_QUERY: {
    key: 'INVOICE_QUERY',
    label: 'Invoice',
    color: '#7C3AED', // Muted Violet
    bg: '#F5F3FF',
    border: '#DDD6FE',
    icon: 'Receipt',
    description: 'Demurrage/detention or freight charges query'
  },
  GENERAL: {
    key: 'GENERAL',
    label: 'General',
    color: '#16A34A', // Muted Emerald
    bg: '#F0FDF4',
    border: '#BBF7D0',
    icon: 'EnvelopeSimple',
    description: 'Port congestion & operations advisories'
  },
  SPAM: {
    key: 'SPAM',
    label: 'Spam / Phishing',
    color: '#D97706', // Muted Amber
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: 'WarningCircle',
    description: 'Unrelated solicitation or fraudulent notice'
  },
};

export const STATUS = {
  OK: {
    key: 'OK',
    label: 'Clean Match',
    color: '#059669', // Muted Emerald
    bg: '#ECFDF5',
    border: '#A7F3D0',
    icon: 'CheckCircle',
    description: 'All 7 key shipment fields matched perfectly'
  },
  MISMATCH: {
    key: 'MISMATCH',
    label: 'Discrepancy',
    color: '#E11D48', // Muted Coral / Rose
    bg: '#FFF1F2',
    border: '#FECDD3',
    icon: 'XCircle',
    description: 'One or more fields differ between SI and BL'
  },
  NEEDS_REVIEW: {
    key: 'NEEDS_REVIEW',
    label: 'Needs Review',
    color: '#D97706', // Muted Amber
    bg: '#FFFBEB',
    border: '#FDE68A',
    icon: 'Question',
    description: 'Low extraction confidence, missing doc, or unreadable scan'
  },
  REVIEWED: {
    key: 'REVIEWED',
    label: 'Human Reviewed',
    color: '#0F766E', // Muted Teal
    bg: '#F0FDFA',
    border: '#99F6E4',
    icon: 'UserCheck',
    description: 'Reviewed and approved by operations officer'
  },
  REJECTED: {
    key: 'REJECTED',
    label: 'Rejected',
    color: '#475569', // Muted Slate
    bg: '#F1F5F9',
    border: '#CBD5E1',
    icon: 'Prohibit',
    description: 'Rejected by operator'
  },
  PROCESSED: {
    key: 'PROCESSED',
    label: 'Processed',
    color: '#475569',
    bg: '#F1F5F9',
    border: '#E2E8F0',
    icon: 'Check',
    description: 'Email classified and archived'
  },
  PROCESSING: {
    key: 'PROCESSING',
    label: 'Processing',
    color: '#4F46E5',
    bg: '#EEF2FF',
    border: '#C7D2FE',
    icon: 'SpinnerGap',
    description: 'AI document pipeline currently running'
  },
};

export const FIELDS = [
  { key: 'shipper', label: 'Shipper', icon: 'Buildings', description: 'Exporter / sending party entity' },
  { key: 'consignee', label: 'Consignee', icon: 'User', description: 'Receiving cargo party' },
  { key: 'notify_party', label: 'Notify Party', icon: 'Flag', description: 'Party notified upon vessel arrival' },
  { key: 'port_of_loading', label: 'Port of Loading (POL)', icon: 'Anchor', description: 'Origin maritime terminal' },
  { key: 'port_of_discharge', label: 'Port of Discharge (POD)', icon: 'MapPin', description: 'Destination maritime terminal' },
  { key: 'container_count', label: 'Container Count', icon: 'Package', description: 'Total units booked/loaded' },
  { key: 'gross_weight_kg', label: 'Gross Weight (kg)', icon: 'Scales', description: 'Cargo gross weight declared' },
];

export const REASONS = {
  unreadable: { label: 'Unreadable / Faded Scan', icon: 'Scan', color: '#E11D48', bg: '#FFF1F2' },
  missing_attachment: { label: 'Missing Attachment', icon: 'Paperclip', color: '#D97706', bg: '#FFFBEB' },
  wrong_doc_type: { label: 'Wrong Document Type', icon: 'Files', color: '#7C3AED', bg: '#F5F3FF' },
  missing_value: { label: 'Missing Critical Field', icon: 'Question', color: '#4F46E5', bg: '#EEF2FF' },
  manual: { label: 'Escalated by AI Rule', icon: 'UserCheck', color: '#4F46E5', bg: '#EEF2FF' },
};

export const DB_FIELD_MAP = {
  port_of_loading: 'port_loading',
  port_of_discharge: 'port_discharge',
  gross_weight_kg: 'gross_weight'
};

export const dbKey = (f) => DB_FIELD_MAP[f] || f;
