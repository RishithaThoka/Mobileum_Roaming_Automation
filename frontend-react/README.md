# Mobileum – Intelligent Roaming Workflow Automation Platform

> **Enterprise-Grade Telecom SaaS Solution for Mobile Network Operators (Airtel, Mobily, Vodafone, AT&T, Orange, STC, Jio, Ooredoo, MTN, Dialog)**

[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)](#)

---

## 🚀 Product Overview

The **Mobileum Intelligent Roaming Workflow Automation Platform** automates end-to-end global roaming management for Tier-1 mobile network operators. It replaces manual, error-prone spreadsheet tracking and legacy PDF processing with a **guided 11-step flow-based automation engine**, real-time difference detection, AI-powered OCR table extraction, 6-stage role-gated governance sign-off, Digital Twin dry-run simulations, and 1-click emergency rollback restoration.

---

## ⚡ Key Highlights & Capabilities

- 🔄 **Guided 11-Step Flow-Based Navigation**: Persistent step tracker bar (`Repository` ➔ `AI Extraction` ➔ `Version Comparison` ➔ `Difference Analysis` ➔ `Risk Assessment` ➔ `Approval Workflow` ➔ `Staging Queue` ➔ `Production Deployment` ➔ `Reconciliation` ➔ `Rollback Safety` ➔ `Audit & Reports`).
- 🎨 **Enterprise Light Theme UI/UX**: Ultra-clean white/slate cards (`bg-white border-2 border-slate-200 shadow-md`), 2px high-contrast borders, gradient top accent bars, and elevated shadows.
- ⚡ **Live File Upload & Ingestion**: Real system file picker input (`<input type="file" />`) and drag-and-drop support. Ingesting an IR.21 XML or RAEX OpData file creates live parameter deltas, stages a version snapshot, triggers Outlook email notifications, and auto-navigates via a 3-second countdown modal.
- 🤖 **3-Tier Productization Model**:
  - **Tier 1 (Entry)**: Read-Only Detection, Discrepancy Dashboard, Notifications & Compliance Auditing.
  - **Tier 2 (Mid)**: AI OCR, GSMA Table 14.2 Auto-Parsing, Version Comparison, and Baseline Ingestion.
  - **Tier 3 (Advanced)**: Closed-Loop Multi-System Provisioning, Digital Twin Dry-Run, Risk Engine & 1-Click Rollback.
- 🛡️ **6-Stage Role Governance Chain**: Stage-gated authorization pipeline across `Analyst` ➔ `Network Ops` ➔ `Security` ➔ `Finance` ➔ `CMO` ➔ `CTO`.
- 🔀 **Interactive React Flow Diagram**: Flowchart representing end-to-end IR.21/RAEX ingestion with clickable node detail modals for raw JSON telemetry payload inspection.
- 📬 **Outlook-Style Email Center**: Built-in email ingestion pane with 1-click attachment parsing directly into the Difference Engine.

---

## 📁 Repository Structure

```text
roaming-project/
├── .gitignore                      # Git exclusion rules for node_modules, dist, etc.
├── index.html                      # Root HTML shell with Google Fonts Inter & Outfit
├── package.json                    # Project dependencies & script definitions
├── postcss.config.js               # PostCSS & Tailwind processing rules
├── README.md                       # Comprehensive enterprise documentation
├── tailwind.config.js              # Tailwind custom colors, glassmorphism & shadows
├── tsconfig.json                   # TypeScript compiler options & alias paths
├── vite.config.ts                  # Vite build bundler configuration
└── src/
    ├── App.tsx                     # Core SaaS shell, route routing & workflow provider
    ├── main.tsx                    # React DOM entry point
    ├── index.css                   # Global Tailwind utilities & custom scrollbar styles
    ├── types/                      # TypeScript domain model definitions
    │   └── index.ts                # RoamingDocument, ParameterDelta, ConfigurableApprovalChain, etc.
    ├── data/                       # Mock telecom datasets & workflow definitions
    │   ├── mockData.ts             # Operators, baselines, deltas, emails, audit logs
    │   └── workflowStepsData.ts    # 11-Step Guided Workflow sequence specification
    ├── store/                      # Global State Management (Zustand)
    │   └── useStore.ts             # State actions, live upload handler, 3s countdown modal
    ├── components/
    │   ├── common/                 # Reusable UI primitives
    │   │   ├── HelpTooltip.tsx     # Contextual tooltip explanation helper
    │   │   ├── OnboardingTour.tsx   # Interactive step-by-step product walkthrough
    │   │   ├── RoleBadge.tsx       # User role tag badge component
    │   │   └── StatusBadge.tsx     # Status pill tag renderer
    │   ├── layout/                 # Main Shell layout components
    │   │   ├── Sidebar.tsx         # Left navigation sidebar with step badges
    │   │   └── Topbar.tsx          # Enterprise topbar, search, role selector & notifications
    │   ├── workflow/               # Flow-Based Navigation System
    │   │   ├── GlobalWorkflowTracker.tsx # Persistent 11-step top progress tracker bar
    │   │   ├── WorkflowHeaderBar.tsx     # Breadcrumbs, version, operator & role header
    │   │   ├── WorkflowStatusPanel.tsx   # Current step, owner, next step & status card
    │   │   └── WorkflowFooter.tsx        # Sticky bottom footer with Previous/Save/Continue
    │   ├── modals/                 # Dialogs & Drawers
    │   │   ├── ApprovalModal.tsx       # Stage sign-off modal with close button
    │   │   ├── AutoRedirectModal.tsx   # 3-second auto-redirect countdown modal
    │   │   ├── DocumentDetailModal.tsx # Full document viewer modal
    │   │   ├── NodeDetailModal.tsx     # React Flow node JSON payload viewer modal
    │   │   └── QuickUploadModal.tsx    # Live drag-and-drop & file picker upload modal
    │   └── views/                  # 18 Modular Product Views
    │       ├── ExecutiveDashboardView.tsx # C-level revenue protection & SLA dashboard
    │       ├── Dashboard.tsx            # Main telecom operations command center
    │       ├── ThreeTierModelView.tsx   # Tier 1 / Tier 2 / Tier 3 productization model
    │       ├── AIRoadmapView.tsx        # Interactive AI capability cards & spec drawer
    │       ├── ManagedServicesView.tsx  # Service package tiers & ROI calculator
    │       ├── IntegrationMatrixView.tsx# Core switch, steering & billing integration matrix
    │       ├── GovernancePipelineView.tsx# Closed-loop 9-stage deployment pipeline
    │       ├── DigitalTwinView.tsx      # Side-by-side production vs twin simulation mode
    │       ├── DifferenceChecker.tsx    # Parameter discrepancy comparison engine
    │       ├── ApprovalWorkflow.tsx     # 6-stage configurable approval chain console
    │       ├── MasterRepositoryView.tsx # Golden baseline database
    │       ├── VersionControlView.tsx   # Git-like version history & commit tree
    │       ├── RollbackCenter.tsx       # 1-click snapshot restoration engine
    │       ├── EmailCenter.tsx          # Outlook email ingestion center
    │       ├── AuditLogsView.tsx        # Immutable GSMA regulatory audit ledger
    │       ├── WorkflowVisualization.tsx# Interactive React Flow automation diagram
    │       ├── OperatorsView.tsx        # Connected mobile operators grid
    │       ├── GlobalMapView.tsx        # Global network interconnect map
    │       ├── PartnersView.tsx         # Bilateral SLA contracts directory
    │       ├── AnalyticsView.tsx        # SLA performance charts
    │       ├── AIAssistant.tsx          # Mobileum AI Roaming Copilot chat
    │       └── SettingsView.tsx         # Platform settings
```

---

## 🛠️ Tech Stack & Dependencies

- **Frontend Core**: React 18, TypeScript 5.5, Vite 6.1
- **Styling & Icons**: TailwindCSS 3.4, Lucide React (Enterprise Icon System)
- **State Management**: Zustand 4.5
- **Diagramming & Flow**: `@xyflow/react` (React Flow v12)
- **Data Visualization**: Recharts 2.12
- **Delight Effects**: `canvas-confetti`

---

## 💻 Getting Started & Local Installation

### Prerequisites

Ensure you have **Node.js** (v18+ recommended) and **npm** installed on your workstation.

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/mobileum/roaming-automation-platform.git
   cd roaming-automation-platform
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Start Local Development Server**:
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:3000/`.

4. **Production Build**:
   ```bash
   npm run build
   ```
   Generates optimized static bundle in `dist/` with 0 TypeScript compilation errors.

---

## 🔒 Enterprise Compliance & Standards

- **GSMA Standards**: Complies with GSMA Official Document **IR.21 Table 14.2**, **RAEX OpData 3.1**, **RAEX IOT**, and **TAP3.12 / BEE** clearinghouse specifications.
- **Protocols Supported**: NETCONF, RESTCONF, Diameter S6a/S6d, SS7 MAP, GTP-C v2, SEPP mTLS (5G SA).
- **Audit & Governance**: Built-in cryptographic audit seals, 7-year regulatory logging, and multi-role sign-off requirements (CMO, CTO, Security, Finance, NOC).

---

## 📄 License

Proprietary Software — Copyright © 2026 **Mobileum Inc.**. All Rights Reserved.
