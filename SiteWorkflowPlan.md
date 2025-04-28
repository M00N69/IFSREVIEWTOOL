# Plan to Implement Site Package Submission Workflow

This plan outlines the necessary mechanisms to support a complex workflow for the site interface, including persistent editing, saving, exporting non-finalized versions, finalization, and the ability for the auditor to review and revert.

## 1. Enhance Data Model

Modify the structure of individual `auditItem` objects within `currentAuditData` to explicitly include fields for:

*   Site Correction Text (`siteCorrection.text`)
*   Site Corrective Action Text (`siteCorrectiveAction.text`)
*   Evidence (e.g., `evidence: [{ filename: string, data: string (base64) }]` - need to consider size limits for embedded files)
*   Reviewer Comments (`reviewerComments: [{ commentId: string, timestamp: string, user: { name: string, role: string }, text: string }]`)
*   Auditor Comments (`auditorComments: [{ commentId: string, timestamp: string, user: { name: string, role: string }, text: string }]`)

Ensure the package metadata (`currentAuditData.metadata`) includes a `status` field to track the workflow state.

## 2. Implement Local Persistence (Site Interface)

*   Utilize IndexedDB (already present in `common.js`) to save the `currentAuditData` object locally on the site's browser.
*   Implement a save function in `site.js` that triggers whenever the site makes changes (adds/edits/removes corrections, actions, or evidence). This function will write the `currentAuditData` to IndexedDB.
*   Implement a load function in `site.js` that reads the last saved `currentAuditData` from IndexedDB when the site interface is loaded, allowing users to resume their work.

## 3. Develop Site Editing Functionality

*   Create functions in `site.js` to handle adding, editing, and removing site corrections, corrective actions, and evidence within the `currentAuditData` structure. These functions will be triggered by UI interactions (e.g., buttons in a modal).
*   Implement UI elements in `site.html` (likely within a modal similar to the reviewer interface) for inputting and displaying site corrections, corrective actions, and evidence.

## 4. Manage Package Status and UI State

*   Define distinct statuses for the package workflow (e.g., `AuditorInitial`, `SiteInProgress`, `SiteSubmitted`, `AuditorReview`, `SiteReviewNeeded`, `Finalized`).
*   Modify the UI rendering logic in `site.js` to enable/disable or show/hide editing controls based on the `currentAuditData.metadata.status`. Site editing should only be allowed in statuses like `AuditorInitial` or `SiteReviewNeeded`.
*   Implement a "Finalize" action in the site interface (`site.html` and `site.js`) that updates the package status to `SiteSubmitted` (or similar), saves the data to IndexedDB, and disables site editing capabilities.

## 5. Adapt Export/Import

*   Ensure the existing `compressJson` and `decompressJson` functions in `common.js` can handle the extended data model.
*   Modify the export function in `site.js` (`handlePackageExport`) to use the current status from `currentAuditData.metadata`. The filename could also reflect the status (e.g., `_SiteInProgress` vs `_SiteSubmitted`).

## 6. Implement Auditor Review and Revert

*   In `auditeur.js`, modify the package loading logic to handle packages with the `SiteSubmitted` status.
*   Update the auditor's modal (`auditeur.html` and `auditeur.js`) to display the site's corrections, actions, and evidence.
*   Implement functionality for the auditor to add comments (`auditorComments`) to specific items.
*   Add a mechanism (e.g., a button) in the auditor interface to change the package status back to `SiteReviewNeeded`, allowing the site to make further edits. This action should also be logged.

## 7. Logging

*   Extend the logging mechanism (`addLogEntry` in `common.js`) to record significant events in the site and auditor workflows, such as:
    *   Package loaded (Site/Auditor)
    *   Site changes saved (Site)
    *   Evidence added/edited/removed (Site)
    *   Correction/Action added/edited (Site)
    *   Package finalized (Site)
    *   Package submitted (Site - via export)
    *   Auditor comment added (Auditor)
    *   Package status changed (Auditor - e.g., reverted to SiteReviewNeeded)

## Workflow Diagram

```mermaid
graph TD
    A[Auditor Creates Package] --> B{Site Loads Package};
    B --> C[Site In Progress];
    C --> D{Site Saves Progress};
    D --> C;
    C --> E[Site Finalizes Package];
    E --> F[Site Submits Package];
    F --> G{Auditor Loads Package};
    G --> H[Auditor Review];
    H --> I{Auditor Adds Comments};
    I --> H;
    H --> J{Auditor Decision};
    J --> K[Auditor Finalizes Audit];
    K --> L[Audit Complete];
    J --> M[Auditor Reverts to Site];
    M --> C;