# Comprehensive System Documentation: SIBLIX.AI

**SIBLIX.AI** is an enterprise-grade automated, AI-assisted shipping document verification and reconciliation platform engineered for global maritime logistics, container carriers, and freight forwarders. 

This document covers:
1. **What the system does** (its business purpose, end-to-end workflow, and decision logic).
2. **What is being used in the system to function** (the full technology stack, libraries, architecture, and cloud infrastructure).

---

## Part 1: What the System Does

### 1. The Core Problem It Solves
In global container shipping and maritime logistics, liner carriers and freight forwarders process thousands of operational emails daily. Shippers email **Shipping Instructions (SI)** detailing what cargo they are booking, and carriers generate a **draft Bill of Lading (BL)**. 

Historically, human operators manually cross-referenced these two documents line-by-line. This manual process causes:
- **Severe Bottlenecks**: Operations staff spend 15–30 minutes per file manually verifying legal names, weights, and seal numbers.
- **Costly Port Demurrage**: A single transposed digit in a container number (`MSKU9281745` vs `MSKU9281754`) or mismatched weight halts cargo release at customs, triggering port storage and container detention fees of **$5,000 to $25,000 per day**.
- **Missed Sailings (Rollovers)**: Discrepancies not caught prior to the carrier's documentation cut-off cause containers to miss their scheduled vessel.

**SIBLIX.AI automates this entire verification lifecycle in sub-second execution**, transforming an error-prone manual task into a deterministic, auditable, and human-supervised automated pipeline.

---

### 2. End-to-End Operational Workflow

The system executes a **5-stage deterministic and AI verification pipeline**:

```
[ Inbound Shipping Email ]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 1: Email Intent Classification                  │
│ • Rules & keyword scoring categorizes incoming email: │
│   BL_COMPARISON, SI_REQUEST, INVOICE, GENERAL, SPAM   │
└────────────────────────────────────────────────────────┘
          │ (Only BL_COMPARISON proceeds to document comparison)
          ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 2: Multimodal Document Parsing & Text Extraction │
│ • Discovers & pairs SI and draft BL attachments        │
│ • Handles .pdf, .docx, .xlsx, .txt                    │
│ • Scanned PDF faxes automatically routed via OCR       │
└────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 3: Canonical Entity Extraction & Normalization   │
│ • Extracts 7 maritime entities from both documents    │
│ • Standardizes names, UN/LOCODEs, and units (MT -> KG)│
└────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 4: Multi-Tier Cross-Document Field Comparison   │
│ • Field-by-field reconciliation (SI vs Draft BL)       │
│ • Token containment for legal names; exact for numbers│
└────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 5: Confidence & Decision Engine                 │
│ • Verdict: OK (Clean Match)                            │
│ • Verdict: MISMATCH (Flagged discrepancy)              │
│ • Verdict: NEEDS_REVIEW (Escalate to Human Queue)      │
└────────────────────────────────────────────────────────┘
          │
    ┌─────┴────────────────────────┐
    ▼                              ▼
[ Release for Customs / BL ]   [ Human-in-the-Loop Review Queue ]
```

---

### 3. Detailed Stage Breakdown

#### Stage 1: Email Classification (`classifier.py`)
- Analyzes the email's `Subject` and `Body` using weighted keyword rules and intent analysis.
- Categorizes correspondence into one of 5 maritime taxonomy buckets:
  1. **`BL_COMPARISON`**: Emails providing draft documents requesting confirmation/comparison.
  2. **`SI_REQUEST`**: Inbound booking instructions or Shipping Instructions submissions.
  3. **`INVOICE_QUERY`**: Inquiries regarding freight charges, demurrage, or detention fees.
  4. **`GENERAL`**: Port congestion notices, terminal advisories, weather delays.
  5. **`SPAM`**: Unsolicited marketing, phishing attempts, or non-shipping correspondence.
- If classification confidence is low and an optional OpenAI API key is supplied, an LLM fallback verifies the category; otherwise, deterministic heuristics govern.

#### Stage 2: Multimodal Document Parsing (`extractor.py`)
- Pairs the **Shipping Instruction (SI)** and draft **Bill of Lading (BL)** by filename sniffing and structural analysis.
- Extracts text content across all common shipping formats:
  - **Native Digital PDFs**: Extracted using coordinate-aware bounding boxes to prevent column text interleaving.
  - **Scanned / Degraded PDFs**: Extracted using **Tesseract OCR** via image rasterization.
  - **Word Documents (`.docx`)**: Traverses paragraphs, headers, and internal XML tables.
  - **Excel Sheets (`.xlsx`)**: Extracts two-column and tabular key-value matrices.
  - **Plain Text (`.txt`)**: Parses delimiter-separated and label-aligned blocks.

#### Stage 3: Canonical 7 Maritime Fields Extraction (`normalizer.py`)
Extracts and normalizes seven essential shipment attributes:
1. **Shipper**: Company name and legal address dispatching the goods.
2. **Consignee**: Destination receiver/importer legally entitled to take delivery.
3. **Notify Party**: Logistics agent or forwarder alerted upon vessel arrival.
4. **Cargo Description**: Commercial commodity description, carton counts, and packaging.
5. **Container Number**: ISO 6346 4-letter prefix + 7-digit identification (e.g., `MSKU9281745`).
6. **Seal Number**: Security bolt or mechanical seal tag (e.g., `ML-SG94821`).
7. **Gross Weight**: Cargo mass converted to a uniform float representation in **Kilograms (KG)** (e.g., converts `18.4 MT` $\rightarrow 18,400\text{ KG}$, `40,565 LBS` $\rightarrow 18,400\text{ KG}$).

#### Stage 4: Multi-Tier Field Comparator (`comparator.py`)
- **Strict Numeric Matching**: Container numbers, seal numbers, and gross weights are **never** fuzzy matched. A single digit variance is flagged as a defect.
- **Port Normalization**: UN/LOCODE suffixes (such as `SINGAPORE (SGSIN)`) are stripped so equivalent port declarations do not trigger false alarms.
- **Legal Entity Token Containment**: Absorbs corporate abbreviations (`PTE LTD`, `LTD`, `INC`, `CORP`) and punctuation while strictly preventing different business entities from matching.

#### Stage 5: Decision & Human-in-the-Loop (HITL) Engine (`confidence.py`)
Assigns the final verification verdict:
- **`OK`**: Zero discrepancies; all fields match within tolerance. Document released.
- **`MISMATCH`**: Discrepancy detected (e.g., seal numbers differ or cargo weights diverge).
- **`NEEDS_REVIEW`**: System halts automated processing and alerts the operator when:
  1. `missing_attachment`: The email requested comparison, but one or both documents were omitted.
  2. `unreadable`: The document had no digital text layer and required OCR (safety policy).
  3. `wrong_doc_type`: Attached files were invoices, packing lists, or certificates of origin instead of an SI/BL pair.
  4. `missing_value`: Required fields were left blank or contained placeholder text.

#### Stage 6: Human Review & Evaluation Suite (`reviews.py`, `evaluation.py`)
- Provides an operator desk to inspect side-by-side extracted evidence, approve valid edge cases, correct fields, or reject bad filings.
- Generates standardized `submission.json` evaluation benchmarks for organizers' scoring engines.

---

## Part 2: What is Being Used to Function

The system is built as a production-grade, cloud-connected stack using modern languages, frameworks, libraries, and cloud infrastructure:

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT WORKSPACE                     │
│  React 18 + Vite SPA  •  Tailwind CSS  •  D3.js Charts │
│  Phosphor Duotone Icons  •  Lexend + JetBrains Fonts   │
└───────────────────────────┬────────────────────────────┘
                            │ REST / JSON (HTTP/2)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   BACKEND GATEWAY                      │
│  FastAPI 0.115  •  Uvicorn ASGI  •  SQLModel (Pydantic)│
│  JWT Authentication  •  PBKDF2 SHA-256 Security       │
└──────────────┬───────────────────────────┬─────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────────┐ ┌───────────────────────┐
│     DOCUMENT & AI ENGINE     │ │    DATA & STORAGE     │
│ • pdfplumber (PDF extraction)│ │ • Neon PostgreSQL     │
│ • pytesseract / Pillow (OCR) │ │   (Singapore Cloud)   │
│ • python-docx (.docx parser) │ │ • PgBouncer Pooling   │
│ • openpyxl (.xlsx parser)    │ │ • File System Volume  │
│ • OpenAI GPT-4o-mini (Opt.)  │ │ • SQLite (Local dev)  │
└──────────────────────────────┘ └───────────────────────┘
```

### 1. Backend Core & API Framework
- **Python (v3.11–v3.13)**: Core programming language.
- **FastAPI (`v0.115.0`)**: High-performance asynchronous web framework providing:
  - Automatic OpenAPI / Swagger interactive documentation (`/docs`).
  - Strict input/output validation via Pydantic schemas.
  - Background asynchronous task queuing (`BackgroundTasks`).
- **Uvicorn (`v0.30.6`)**: Lightning-fast ASGI web server hosting the FastAPI application.
- **SQLModel (`v0.0.22`)**: Unified database library designed by the creator of FastAPI; combines **SQLAlchemy** ORM power with **Pydantic** validation models into a single definition.

### 2. Document Parsing & Multimodal Extraction Stack
- **`pdfplumber` (`v0.11.4`)**: Precise PDF parsing library. Unlike basic PDF text dumpers, it performs layout analysis, extracts table cell coordinates, and avoids character interleaving in multi-column shipping bills.
- **`pytesseract` (`v0.3.13`) & `Tesseract-OCR`**: Optical Character Recognition engine used as a fallback to extract text from scanned paper bills, faxes, and images.
- **`pdf2image` (`v1.17.0`) & `Pillow` (`v10.4.0`)**: Converts PDF pages into high-resolution bitmap raster images to feed the Tesseract OCR engine.
- **`python-docx` (`v1.1.2`)**: Extracts text, headers, and key-value tables from Microsoft Word documents.
- **`openpyxl` (`v3.1.5`)**: Parses Microsoft Excel spreadsheets and manifests.
- **`openai` (`v1.51.0`) & `httpx` (`v0.27.2`)**: *(Optional)* Fallback client for edge-case unstructured email classification via `gpt-4o-mini` when rules-based scoring requires disambiguation.

### 3. Database & Cloud Persistence Infrastructure
- **Neon Cloud Serverless PostgreSQL**:
  - **Region**: **AWS Asia Pacific - Singapore (`aws-ap-southeast-1`)**, co-located with Southeast Asian maritime logistics networks.
  - **Connection Pooling**: Integrated **PgBouncer** pooling endpoint (`ep-wispy-bread-azccltn9-pooler`) handling burst traffic and multi-threaded worker connections.
  - **Security**: Enforces TLS 1.3 encrypted connections (`sslmode=require`).
- **`psycopg2-binary` (`v2.9.10`)**: High-performance PostgreSQL database adapter for Python.
- **Local SQLite Engine**: Fast local development option (`sqlite:///./storage/app.db`) enabling zero-dependency local runs.

### 4. Authentication & Security
- **JWT (JSON Web Tokens)**: Signed session tokens providing stateless, secure client authentication.
- **PBKDF2-HMAC-SHA256**: Cryptographic password hashing protecting operator credentials.
- **Role-Based Access Control (RBAC)**: Distinguishes between `admin` (system configuration, full audit access) and `operator` (document review, verification actions).

### 5. Frontend Technologies & Design System
- **React 18**: Component-based user interface library with fast state re-rendering.
- **Vite 5**: Next-generation frontend build tool and dev server featuring Hot Module Replacement (HMR).
- **Tailwind CSS**: Utility-first CSS framework configured with a curated color palette:
  - *Muted Slate Canvas*: Minimizes eye strain for operations staff.
  - *Indigo & Emerald Brand Accents*: Highlights verification confidence and clean matches.
  - *Amber & Coral Status Badges*: Surfaces review escalations and critical defects.
- **Google Fonts**:
  - **Lexend**: Selected for legibility, modern SaaS aesthetic, and reading flow.
  - **JetBrains Mono**: Monospaced font for maritime identifiers, container IDs, seal numbers, and weights.
- **Phosphor Duotone Icons (`@phosphor-icons/react`)**: Modern, two-tone icon set optimized through an explicit tree-shaking registry (`PhosphorIcon.jsx`) to keep bundle sizes under 530 kB.
- **D3.js (`d3-shape`, `d3-scale`, `d3-array`)**: Data visualization library generating dynamic SVG sparklines and 24-hour verification velocity charts.

### 6. Containerization & Deployment Tooling
- **Docker & Docker Compose**: Multi-container setup isolating:
  - `frontend`: Containerized Vite + Nginx build.
  - `backend`: FastAPI Python container with system-level Tesseract OCR and Poppler utilities.
- **Nginx**: Production reverse proxy serving static React bundles and proxying API traffic to port 8000.

---

## Part 3: Summary Matrix

| Capability / Layer | Technology Used | Function in SIBLIX.AI |
|---|---|---|
| **API Framework** | FastAPI 0.115 + Uvicorn | High-speed REST endpoints, background worker jobs, OpenAPI docs |
| **ORM & Data Schema** | SQLModel (SQLAlchemy + Pydantic) | Typed database tables and payload validation |
| **Cloud Database** | Neon Serverless PostgreSQL (Singapore) | Persistent, low-latency, pooled storage for users, emails, and review decisions |
| **PDF Extraction** | `pdfplumber` | Layout-aware digital text and table cell extraction |
| **OCR Fallback** | `pytesseract` + `pdf2image` | Scans physical faxes/bills; triggers human safety reviews |
| **Office Doc Parsers** | `python-docx` + `openpyxl` | Ingests Word attachments and Excel manifests |
| **Client Interface** | React 18 + Vite | Interactive operator workspace, landing page, and audit inspector |
| **Styling & UX** | Tailwind CSS (Luma Aesthetic) | High-density operations desk with muted palettes and glassmorphism |
| **Typography & Icons** | Lexend, JetBrains Mono, Phosphor Duotone | Specialized maritime typography and tree-shaken SVG icon sets |
| **Data Visualization** | D3.js | Real-time verification velocity and field accuracy sparklines |
| **Security & Auth** | JWT + PBKDF2 SHA-256 | Encrypted session tokens, secure password hashing, and role checks |
| **Containerization** | Docker Compose + Nginx | Unified one-command deployment across development and production |
