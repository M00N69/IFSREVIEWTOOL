/**
 * auditeur.js - Logique spécifique à l'interface Auditeur
 */

console.log("auditeur.js loaded");

// --- State ---
let currentAuditData = null; // Holds the complete audit data object (from Excel import or .ifsaudit load)
let currentUser = { name: "", role: "Auditeur" };

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Auditor App");
    // Get user name (e.g., from input field)
    const userNameInput = document.getElementById('userName');
    if (userNameInput) {
        userNameInput.addEventListener('change', (e) => {
            currentUser.name = e.target.value.trim();
            console.log("User name set to:", currentUser.name);
            // Explicitly call updateButtonStates after name change
            updateButtonStates();
        });
    }

    // Setup event listeners for buttons (Import Excel, Load Package, Export, Finalize, etc.)
    setupEventListeners();

    // Initial UI setup (e.g., disable export/finalize buttons until data is loaded)
    updateUI();
});

// --- Event Listener Setup ---
function setupEventListeners() {
    const importExcelBtn = document.getElementById('importExcelBtn');
    const excelFileInput = document.getElementById('excelFileInput');
    const loadPackageBtn = document.getElementById('loadPackageBtn');
    const packageFileInput = document.getElementById('packageFileInput');
    const exportPackageBtn = document.getElementById('exportPackageBtn');
    const finalizeAuditBtn = document.getElementById('finalizeAuditBtn');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const auditItemsTableBody = document.getElementById('auditItemsTableBody');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSaveBtn = document.getElementById('modalSaveBtn');
    const logModalCloseBtn = document.getElementById('logModalCloseBtn');

    if (importExcelBtn && excelFileInput) {
        importExcelBtn.addEventListener('click', () => excelFileInput.click());
        // Note: The actual handling happens in handleExcelImportTrigger called by onchange in HTML
    }

    if (loadPackageBtn && packageFileInput) {
        loadPackageBtn.addEventListener('click', () => packageFileInput.click());
        // Note: The actual handling happens in handlePackageLoadTrigger called by onchange in HTML
    }

    if (exportPackageBtn) {
        exportPackageBtn.addEventListener('click', handlePackageExport);
    }

    if (finalizeAuditBtn) {
        finalizeAuditBtn.addEventListener('click', handleFinalizeAudit);
    }

    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', displayLogs); // Assuming displayLogs function exists/will be created
    }

    if (auditItemsTableBody) {
        // Use event delegation for table row clicks
        auditItemsTableBody.addEventListener('click', (event) => {
            const row = event.target.closest('tr');
            if (row && row.dataset.itemId) { // Check if it's a data row with an ID
                openEditModal(row.dataset.itemId);
            }
        });
    }

     // Modal Buttons
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', closeModal);
    }
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener('click', () => {
            const itemId = document.getElementById('modalItemId')?.textContent;
            if (itemId) {
                saveModalChanges(itemId);
            } else {
                console.error("Cannot save modal changes, item ID not found.");
            }
        });
    }

    // Log Modal Close Button
    if (logModalCloseBtn) {
        logModalCloseBtn.addEventListener('click', closeLogModal);
    }
}

// --- Trigger Functions (called from HTML onchange) ---
function handleExcelImportTrigger() {
    console.log("Excel file selected");
    handleExcelImport(document.getElementById('excelFileInput'));
}

function handlePackageLoadTrigger() {
    console.log("Package file selected");
    handlePackageLoad(document.getElementById('packageFileInput'));
}


// --- Core Logic ---

function handleExcelImport(fileInput) {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        displayError("Aucun fichier sélectionné.", "messageArea");
        return;
    }
    const file = fileInput.files[0];
    if (!file.name.endsWith('.xlsx')) {
        displayError("Veuillez sélectionner un fichier Excel (.xlsx).", "messageArea");
        return;
    }

    clearContainer("messageArea");
    displayInfo("Traitement du fichier Excel...", "messageArea");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Assume the first sheet is the relevant one
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // --- Extract Metadata ---
            // Helper to get cell value safely
            const getCellValue = (cellRef) => {
                const cell = worksheet[cellRef];
                return cell ? cell.v : undefined;
            };

            const siteName = getCellValue('C4');
            const coid = getCellValue('C5');
            // const ifsStandard = getCellValue('C7'); // Not used based on decision
            const auditType = getCellValue('C8');
            const auditDate = getCellValue('C9'); // Might need date formatting/parsing if not text

            if (!coid || !siteName || !auditType || !auditDate) {
                throw new Error("Métadonnées manquantes ou invalides dans les cellules C4, C5, C8, C9.");
            }

            // --- Find Header Row and Map Columns ---
            // Convert sheet to JSON array of objects, assuming headers are in row 12 (index 11)
            // SheetJS uses 0-based indexing for rows in utils.sheet_to_json
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Get array of arrays

            // Find the header row index (assuming "requirementNo" is a unique header)
            let headerRowIndex = -1;
            for(let i = 0; i < jsonData.length; i++) {
                if (jsonData[i].includes("requirementNo")) {
                    headerRowIndex = i;
                    break;
                }
            }

            if (headerRowIndex === -1) {
                throw new Error("Impossible de trouver la ligne d'en-tête contenant 'requirementNo'. Vérifiez la ligne 12.");
            }

            const headers = jsonData[headerRowIndex];
            const requiredHeaders = ['requirementNo', 'requirementText', 'requirementExplanation', 'requirementScore'];
            const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
            if (missingHeaders.length > 0) {
                throw new Error(`En-têtes manquants dans le fichier Excel : ${missingHeaders.join(', ')}`);
            }

            // Map header names to their column index
            const colMap = {};
            headers.forEach((header, index) => {
                if (header) { // Handle potential empty header cells
                   colMap[header] = index;
                }
            });

            // --- Extract Audit Items ---
            const auditItems = [];
            // Data starts from the row after the header row
            for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                // Check if the row seems valid (e.g., has a requirementNo)
                const reqNo = row[colMap['requirementNo']];
                if (reqNo === undefined || reqNo === null || String(reqNo).trim() === '') {
                    // Skip empty or invalid rows
                    continue;
                }

                const newItem = {
                    id: String(reqNo), // Ensure ID is a string
                    requirementText: String(row[colMap['requirementText']] || ''),
                    auditorEvaluation: String(row[colMap['requirementExplanation']] || ''),
                    statusNC: String(row[colMap['requirementScore']] || ''), // Initial status from Excel score
                    // Initialize Site fields
                    siteCorrection: { text: "", lastEditBy: "", timestamp: "" },
                    siteCorrectiveAction: { text: "", lastEditBy: "", timestamp: "" },
                    sitePlannedDate: "",
                    siteActualDate: "",
                    siteResponsible: "",
                    // Initialize Auditor fields
                    auditorEffectivenessCheck: { text: "", lastEditBy: "", timestamp: "" },
                    actionStatus: "Ouvert", // Default status for new items
                    auditorValidationDate: "",
                    auditorValidator: ""
                };
                auditItems.push(newItem);
            }

            if (auditItems.length === 0) {
                 throw new Error("Aucun item d'audit trouvé dans le fichier Excel après la ligne d'en-tête.");
            }

            // --- Create Initial Audit Data Object ---
            currentAuditData = {
                metadata: {
                    schemaVersion: 1,
                    coid: String(coid),
                    siteName: String(siteName),
                    auditType: String(auditType),
                    auditDate: String(auditDate), // Keep as string from Excel for now
                    internalVersion: 1,
                    status: "Initial", // Initial status after import
                    lastSavedBy: { name: currentUser.name, role: currentUser.role },
                    lastSavedTimestamp: toISOString()
                },
                auditItems: auditItems,
                comments: [],
                proofs: [],
                logs: []
            };

            // Add initial log entry
            addLogEntry(currentAuditData.logs, currentUser, "ExcelImported", null, { filename: file.name });

            displayInfo(`Importation réussie. ${auditItems.length} items chargés.`, "messageArea");
            updateUI(); // Update the UI with the loaded data

        } catch (error) {
            console.error("Error processing Excel file:", error);
            displayError(`Erreur lors du traitement du fichier Excel : ${error.message}`, "messageArea");
            currentAuditData = null; // Reset state on error
            updateUI();
        } finally {
             // Reset file input to allow re-uploading the same file if needed
             fileInput.value = '';
        }
    };

    reader.onerror = function(event) {
        console.error("File reading error:", reader.error);
        displayError("Erreur lors de la lecture du fichier.", "messageArea");
         fileInput.value = ''; // Reset file input
    };

    reader.readAsArrayBuffer(file); // Read as ArrayBuffer for SheetJS

    // 3. Validate sheet structure (headers, required columns based on plan) - DONE above
    // 4. Extract metadata (C4, C5, C8, C9) - DONE above
    // 5. Extract audit items (map columns: requirementNo, requirementText, requirementExplanation, requirementScore) - DONE above
    // 6. Create the initial `currentAuditData` JSON object according to the defined structure - DONE above
    // 7. Initialize fields not present in Excel (site fields, auditor fields, comments, proofs, logs) - DONE above
    // 8. Set initial metadata (schemaVersion, internalVersion=1, status='Initial', lastSavedBy) - DONE above
    // 9. Add initial log entry for import - DONE above
    // 10. Update UI (display table, enable buttons) - Called via updateUI()
    /* Example structure creation:
     currentAuditData = {
        metadata: { ... },
        auditItems: [ ... ],
        comments: [],
        proofs: [], // Initialized above
        logs: [] // Initialized above
    };
    */
}


function handlePackageLoad(fileInput) {
    // 1. Use handleFileUpload from common.js to read the file (as text)
    // 2. Use decompressJson from common.js
    // 3. Validate the structure and metadata.status (check if compatible with Auditor role)
    // 4. Store the loaded data in `currentAuditData` - TODO
    // 5. Add log entry for package load - Implemented below
    // 6. Update UI - Implemented below
     if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        displayError("Aucun fichier sélectionné.", "messageArea");
        return;
    }
    const file = fileInput.files[0];
    if (!file.name.endsWith('.ifsaudit')) {
        displayError("Veuillez sélectionner un fichier package (.ifsaudit).", "messageArea");
        return;
    }

    clearContainer("messageArea");
    displayInfo("Chargement du package...", "messageArea");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const base64String = e.target.result.trim(); // Use raw content as Base64
            if (!base64String) {
                throw new Error("Le fichier chargé est vide ou invalide.");
            }

            const decompressedData = decompressJson(base64String);

            // Validation
            if (!decompressedData || !decompressedData.metadata || !decompressedData.auditItems) {
                 throw new Error("Format de fichier package invalide.");
            }

            // TODO: Check metadata.status for compatibility if needed

            currentAuditData = decompressedData;

            addLogEntry(currentAuditData.logs, currentUser, "PackageLoaded", null, { filename: file.name });

            displayInfo(`Package chargé avec succès (Version ${currentAuditData.metadata.internalVersion}).`, "messageArea");
            updateUI();

        } catch (error) {
            console.error("Error processing package file:", error);
            displayError(`Erreur lors du chargement du package : ${error.message}`, "messageArea");
            currentAuditData = null;
            updateUI();
        } finally {
            fileInput.value = ''; // Reset file input
        }
    };
     reader.onerror = function(event) {
        console.error("File reading error:", reader.error);
        displayError("Erreur lors de la lecture du fichier.", "messageArea");
        fileInput.value = ''; // Reset file input
    };
    reader.readAsText(file); // Read as text for decompression
}

// Make the function async to await compressJson
/**
 * Handles the package export process for the Auditor interface.
 * Compresses the current audit data, updates metadata, adds a log entry, and triggers a file download.
 * @async
 */
async function handlePackageExport() {
    // Validation: Check if there is data to export.
    if (!currentAuditData) {
        displayError("Aucune donnée à exporter. Importez un fichier Excel ou chargez un package d'abord.", "messageArea");
        return;
    }
    // Validation: Ensure the user's name is entered before exporting.
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant d'exporter.");
        // User Experience: Focus the username input field to guide the user.
        document.getElementById('userName')?.focus();
        return;
    }

    try {
        console.log("[Export Debug] Starting export process...");
        // State Management: Update metadata before exporting.
        // Correctness: Increment the internal version number for each export.
        currentAuditData.metadata.internalVersion += 1;
        // Data Transformation: Record who saved the package and when.
        currentAuditData.metadata.lastSavedBy = { name: currentUser.name, role: currentUser.role };
        currentAuditData.metadata.lastSavedTimestamp = toISOString();
        console.log("[Export Debug] Metadata updated. New version:", currentAuditData.metadata.internalVersion);
        // TODO: Potentially update metadata.status based on workflow rules
        // Best Practice: Consider updating the status here if the export signifies a transition in the workflow (e.g., from 'Initial' to 'SiteInputRequired').

        // File Formatting: Generate a filename based on metadata and current date/version.
        // Correctness: Includes COID, date, and internal version for clarity.
        const filename = `${currentAuditData.metadata.coid}_IFS_ActionPlan_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_v${currentAuditData.metadata.internalVersion}.ifsaudit`;
        console.log("[Export Debug] Generated filename:", filename);

        // State Management: Add a log entry for the export action.
        // Correctness: Records the user, event, and filename.
        addLogEntry(currentAuditData.logs, currentUser, "PackageExported", null, { filename: filename });
        console.log("[Export Debug] Log entry added.");

        // Data Transformation: Compress the current audit data.
        console.log("[Export Debug] Compressing data...");
        // Correctness: Await the asynchronous compressJson function from common.js.
        const compressedData = await compressJson(currentAuditData);
        console.log("[Export Debug] Compression successful. Base64 data length:", compressedData.length);

        // File Handling: Trigger the file download.
        console.log("[Export Debug] Triggering download...");
        // Correctness: Use the downloadFile utility from common.js.
        // File Formatting: Specify the MIME type for the .ifsaudit file.
        downloadFile(compressedData, filename, 'application/octet-stream'); // Use function from common.js
        console.log("[Export Debug] Download function called.");

        // User Experience: Display a success message.
        displayInfo(`Package exporté avec succès sous le nom : ${filename}`, "messageArea");
        // State Management: Update the UI to reflect the new state (e.g., version number).
        updateUI();
        console.log("[Export Debug] Export process completed successfully.");

    } catch (error) {
         // Error Handling: Catch any errors during the export process.
         // Robustness: Log the full error details for debugging.
         console.error("[Export Debug] Error during package export:", error);
         // Robustness: Display a user-friendly error message.
         displayError(`Erreur lors de l'exportation : ${error.message || 'Erreur inconnue'}`, "messageArea");
         // Error Handling: Consider how to handle state if the export fails after metadata update.
         // Attempt to revert metadata changes if possible (optional, can be complex)
         // currentAuditData.metadata.internalVersion -= 1; // Revert version increment? Risky if log was added.
         // updateUI(); // Update UI to reflect potential revert
         // Best Practice: A more robust approach might involve creating a copy of the data before modifying metadata and only updating the main state on successful download.
    }
    // Summary of steps (already covered by inline comments):
    // 1. Ensure `currentAuditData` exists and user name is set
    // 2. Update metadata: increment internalVersion, set lastSavedBy, lastSavedTimestamp, potentially update status
    // 3. Add log entry for export
    // 4. Use compressJson from common.js
    // 5. Generate filename (COID_IFS_ActionPlan_YYYYMMDD_v<internalVersion>.ifsaudit)
    // 6. Use downloadFile from common.js
}

function handleFinalizeAudit() {
    if (!currentAuditData) {
        displayError("Impossible de finaliser : aucune donnée chargée.", "messageArea");
        return;
    }
     if (currentAuditData.metadata.status === 'Finalized') {
        displayInfo("Cet audit est déjà finalisé.", "messageArea");
        return;
    }
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant de finaliser.");
        document.getElementById('userName')?.focus();
        return;
    }

    // Optional: Check if all items are 'Clôturé'
    const openItems = currentAuditData.auditItems.filter(item => item.actionStatus !== 'Clôturé');
    if (openItems.length > 0) {
        if (!confirm(`Attention : ${openItems.length} action(s) ne sont pas clôturées. Voulez-vous vraiment finaliser l'audit ?`)) {
            return;
        }
    } else {
         if (!confirm("Êtes-vous sûr de vouloir finaliser cet audit ? Cette action est irréversible.")) {
             return;
         }
    }

    try {
        currentAuditData.metadata.status = 'Finalized';
        // Perform a final export
        handlePackageExport(); // This will increment version, add log, save timestamp etc.
        // Update UI to reflect finalized state (disable buttons etc.)
        updateUI();
        displayInfo("Audit finalisé avec succès.", "messageArea");
    } catch (error) {
        // handlePackageExport should display its own errors
        console.error("Error during finalization export:", error);
        // Revert status? Maybe not necessary if export failed.
        currentAuditData.metadata.status = 'AuditorReview'; // Or previous status? Needs thought.
        updateUI();
    }
    // 1. Check if all actions are 'Clôturé' or appropriately handled
    // 2. Confirm with the user
    // 3. Set metadata.status to 'Finalized'
    // 4. Perform a final export (call handlePackageExport)
}

function openEditModal(itemId) {
    if (!currentAuditData) return;
    const item = currentAuditData.auditItems.find(i => i.id === itemId);
    if (!item) {
        console.error(`Item with ID ${itemId} not found.`);
        return;
    }

    const modal = document.getElementById('editModal');
    const modalContent = document.getElementById('modalContent');
    const modalItemIdSpan = document.getElementById('modalItemId');

    if (!modal || !modalContent || !modalItemIdSpan) {
        console.error("Modal elements not found.");
        return;
    }

    modalItemIdSpan.textContent = itemId;

    // --- Populate Modal Content ---
    // Clear previous content
    modalContent.innerHTML = '';

    // Display fields (Auditor can see and edit everything)
    // Using Tailwind classes for basic layout
    modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">Exigence</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.requirementText || ''}</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Constat Auditeur</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.auditorEvaluation || ''}</p>
            </div>
             <div>
                <label class="block text-sm font-medium text-gray-700">Notation Initiale</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.statusNC || ''}</p>
            </div>
             <div>
                <label for="modalActionStatus" class="block text-sm font-medium text-gray-700">Statut Action</label>
                <select id="modalActionStatus" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                    <option value="Ouvert" ${item.actionStatus === 'Ouvert' ? 'selected' : ''}>Ouvert</option>
                    <option value="En cours" ${item.actionStatus === 'En cours' ? 'selected' : ''}>En cours</option>
                    <option value="Clôturé" ${item.actionStatus === 'Clôturé' ? 'selected' : ''}>Clôturé</option>
                    <option value="En attente Reviewer" ${item.actionStatus === 'En attente Reviewer' ? 'selected' : ''}>En attente Reviewer</option>
                </select>
            </div>

            <hr class="md:col-span-2 my-2"/>

            <h4 class="md:col-span-2 text-md font-semibold text-gray-800">Partie Site</h4>
            <div>
                <label for="modalSiteCorrection" class="block text-sm font-medium text-gray-700">Correction</label>
                <textarea id="modalSiteCorrection" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2">${item.siteCorrection?.text || ''}</textarea>
                <p class="text-xs text-gray-500">Dernière modif: ${item.siteCorrection?.lastEditBy || 'N/A'} le ${formatDisplayDate(item.siteCorrection?.timestamp)}</p>
            </div>
             <div>
                <label for="modalSiteCorrectiveAction" class="block text-sm font-medium text-gray-700">Action Corrective</label>
                <textarea id="modalSiteCorrectiveAction" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2">${item.siteCorrectiveAction?.text || ''}</textarea>
                 <p class="text-xs text-gray-500">Dernière modif: ${item.siteCorrectiveAction?.lastEditBy || 'N/A'} le ${formatDisplayDate(item.siteCorrectiveAction?.timestamp)}</p>
            </div>
             <div>
                <label for="modalSiteResponsible" class="block text-sm font-medium text-gray-700">Responsable Site</label>
                <input type="text" id="modalSiteResponsible" value="${item.siteResponsible || ''}" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2">
            </div>
            <div class="grid grid-cols-2 gap-4">
                 <div>
                    <label for="modalSitePlannedDate" class="block text-sm font-medium text-gray-700">Date Prévue Site</label>
                    <input type="text" id="modalSitePlannedDate" value="${item.sitePlannedDate || ''}" placeholder="jj.mm.aaaa" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2">
                </div>
                 <div>
                    <label for="modalSiteActualDate" class="block text-sm font-medium text-gray-700">Date Réelle Site</label>
                    <input type="text" id="modalSiteActualDate" value="${item.siteActualDate || ''}" placeholder="jj.mm.aaaa" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2">
                </div>
            </div>

            <hr class="md:col-span-2 my-2"/>

             <h4 class="md:col-span-2 text-md font-semibold text-gray-800">Partie Auditeur</h4>
             <div>
                <label for="modalAuditorEffectivenessCheck" class="block text-sm font-medium text-gray-700">Vérification Efficacité</label>
                <textarea id="modalAuditorEffectivenessCheck" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2">${item.auditorEffectivenessCheck?.text || ''}</textarea>
                 <p class="text-xs text-gray-500">Dernière modif: ${item.auditorEffectivenessCheck?.lastEditBy || 'N/A'} le ${formatDisplayDate(item.auditorEffectivenessCheck?.timestamp)}</p>
            </div>
             <div class="grid grid-cols-2 gap-4">
                 <div>
                    <label for="modalAuditorValidator" class="block text-sm font-medium text-gray-700">Validé par</label>
                    <input type="text" id="modalAuditorValidator" value="${item.auditorValidator || ''}" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2">
                </div>
                 <div>
                    <label for="modalAuditorValidationDate" class="block text-sm font-medium text-gray-700">Date Validation</label>
                    <input type="text" id="modalAuditorValidationDate" value="${item.auditorValidationDate || ''}" placeholder="jj.mm.aaaa" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2">
                </div>
            </div>
        </div>

        <hr class="my-4"/>

        <!-- Comments Section -->
        <div class="mt-4">
             <h4 class="text-md font-semibold text-gray-800 mb-2">Commentaires</h4>
             <div id="modalCommentsList" class="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 mb-2 space-y-2">
                <!-- Comments will be loaded here -->
                <p class="text-gray-500 text-sm">Aucun commentaire.</p>
             </div>
             <div class="flex space-x-2">
                 <textarea id="modalNewCommentText" rows="2" placeholder="Ajouter un commentaire..." class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2 flex-grow"></textarea>
                 <select id="modalCommentRecipient" class="mt-1 block py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                     <option value="Site">Pour Site</option>
                     <option value="Reviewer">Pour Reviewer</option>
                 </select>
                 <button id="modalAddCommentBtnInternal" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm">Ajouter</button>
             </div>
        </div>

         <hr class="my-4"/>

         <!-- Proofs Section -->
         <div class="mt-4">
             <h4 class="text-md font-semibold text-gray-800 mb-2">Preuves</h4>
             <div id="modalProofsList" class="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 mb-2 space-y-2">
                 <!-- Proofs will be loaded here -->
                 <p class="text-gray-500 text-sm">Aucune preuve.</p>
             </div>
             <!-- Proof upload only for Site, Auditor only views -->
         </div>
    `;

    // --- Load Comments & Proofs ---
    loadModalComments(itemId);
    loadModalProofs(itemId);

    // --- Add Internal Listeners ---
     const addCommentBtnInternal = document.getElementById('modalAddCommentBtnInternal');
     if (addCommentBtnInternal) {
         addCommentBtnInternal.addEventListener('click', () => addCommentHandler(itemId));
     }

    // --- Disable fields if audit is finalized ---
    if (currentAuditData.metadata.status === 'Finalized') {
        modalContent.querySelectorAll('input, textarea, select').forEach(el => el.disabled = true);
        document.getElementById('modalSaveBtn').disabled = true;
        document.getElementById('modalAddCommentBtnInternal').disabled = true;
        document.getElementById('modalCommentRecipient').disabled = true;
    } else {
         document.getElementById('modalSaveBtn').disabled = false;
    }


    // --- Show Modal ---
    modal.classList.remove('hidden');

    // --- Mark as Read ---
    setItemReadStatus(currentAuditData.metadata.internalVersion, itemId)
        .then(() => {
            // Update table row styling immediately (remove bold)
            const row = document.querySelector(`#auditItemsTableBody tr[data-item-id="${itemId}"]`);
            row?.classList.remove('font-semibold'); // Assuming bold was applied via font-semibold
        })
        .catch(err => console.error("Failed to set read status:", err));

}

function closeModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function closeLogModal() {
     const modal = document.getElementById('logModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}


function saveModalChanges(itemId) {
    if (!currentAuditData) return;
    const itemIndex = currentAuditData.auditItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
        console.error(`Item with ID ${itemId} not found for saving.`);
        return;
    }
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom.");
        return;
    }

    const item = currentAuditData.auditItems[itemIndex];
    const changes = []; // To track changes for logging

    // Helper to update field and log change
    const updateField = (fieldName, newValue, oldValue, isObject = false, subField = 'text') => {
        let changed = false;
        if (isObject) {
            if (!item[fieldName]) item[fieldName] = {}; // Ensure object exists
            if (item[fieldName][subField] !== newValue) {
                changes.push({ field: `${fieldName}.${subField}`, oldValue: item[fieldName][subField], newValue: newValue });
                item[fieldName][subField] = newValue;
                item[fieldName].lastEditBy = currentUser.name; // Assume auditor edits everything for now
                item[fieldName].timestamp = toISOString();
                changed = true;
            }
        } else {
            if (item[fieldName] !== newValue) {
                changes.push({ field: fieldName, oldValue: item[fieldName], newValue: newValue });
                item[fieldName] = newValue;
                changed = true;
            }
        }
        return changed;
    };

    // Get values from modal
    const siteCorrection = document.getElementById('modalSiteCorrection')?.value;
    const siteCorrectiveAction = document.getElementById('modalSiteCorrectiveAction')?.value;
    const siteResponsible = document.getElementById('modalSiteResponsible')?.value;
    const sitePlannedDate = document.getElementById('modalSitePlannedDate')?.value;
    const siteActualDate = document.getElementById('modalSiteActualDate')?.value;
    const auditorEffectivenessCheck = document.getElementById('modalAuditorEffectivenessCheck')?.value;
    const auditorValidator = document.getElementById('modalAuditorValidator')?.value;
    const auditorValidationDate = document.getElementById('modalAuditorValidationDate')?.value;
    const actionStatus = document.getElementById('modalActionStatus')?.value;

    // Update fields and log changes
    updateField('siteCorrection', siteCorrection, item.siteCorrection?.text, true);
    updateField('siteCorrectiveAction', siteCorrectiveAction, item.siteCorrectiveAction?.text, true);
    updateField('siteResponsible', siteResponsible, item.siteResponsible);
    updateField('sitePlannedDate', sitePlannedDate, item.sitePlannedDate);
    updateField('siteActualDate', siteActualDate, item.siteActualDate);
    updateField('auditorEffectivenessCheck', auditorEffectivenessCheck, item.auditorEffectivenessCheck?.text, true);
    updateField('auditorValidator', auditorValidator, item.auditorValidator);
    updateField('auditorValidationDate', auditorValidationDate, item.auditorValidationDate);
    updateField('actionStatus', actionStatus, item.actionStatus);

    // Add log entries for all detected changes
    changes.forEach(change => {
        addLogEntry(currentAuditData.logs, currentUser, "FieldUpdated", itemId, change);
    });

    if (changes.length > 0) {
         displayInfo(`Modifications enregistrées pour l'item ${itemId}. N'oubliez pas d'exporter le package.`, "messageArea");
    }

    closeModal();
    renderAuditTable(); // Re-render the specific row or the whole table
}

function addCommentHandler(itemId) {
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant d'ajouter un commentaire.");
        return;
    }
    const commentTextElement = document.getElementById('modalNewCommentText');
    const recipientElement = document.getElementById('modalCommentRecipient');
    const text = commentTextElement?.value.trim();
    const recipientRole = recipientElement?.value;

    if (!text || !recipientRole) {
        alert("Veuillez écrire un commentaire et sélectionner un destinataire.");
        return;
    }

    const newComment = {
        commentId: generateUUID(),
        itemId: itemId,
        author: { name: currentUser.name, role: currentUser.role },
        recipientRole: recipientRole,
        text: text,
        timestamp: toISOString()
    };

    currentAuditData.comments.push(newComment);
    addLogEntry(currentAuditData.logs, currentUser, "CommentAdded", itemId, { recipient: recipientRole });

    // Clear input and refresh comments list in modal
    commentTextElement.value = '';
    loadModalComments(itemId);
     displayInfo(`Commentaire ajouté pour l'item ${itemId}. N'oubliez pas d'exporter le package.`, "messageArea");
}

function loadModalComments(itemId) {
    const commentsList = document.getElementById('modalCommentsList');
    if (!commentsList || !currentAuditData) return;

    const itemComments = currentAuditData.comments.filter(c => c.itemId === itemId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (itemComments.length === 0) {
        commentsList.innerHTML = '<p class="text-gray-500 text-sm">Aucun commentaire.</p>';
        return;
    }

    commentsList.innerHTML = itemComments.map(comment => `
        <div class="bg-gray-100 p-2 rounded text-sm">
            <p class="font-semibold">${comment.author.name} (${comment.author.role}) ${comment.recipientRole !== currentUser.role ? `(Pour ${comment.recipientRole})` : ''}:</p>
            <p class="whitespace-pre-wrap">${comment.text}</p>
            <p class="text-xs text-gray-500 text-right">${formatDisplayDate(comment.timestamp)}</p>
        </div>
    `).join('');
}

function loadModalProofs(itemId) {
     const proofsList = document.getElementById('modalProofsList');
    if (!proofsList || !currentAuditData) return;

     const itemProofs = currentAuditData.proofs.filter(p => p.itemId === itemId);

     if (itemProofs.length === 0) {
        proofsList.innerHTML = '<p class="text-gray-500 text-sm">Aucune preuve.</p>';
        return;
    }

     proofsList.innerHTML = itemProofs.map(proof => `
        <div class="bg-gray-100 p-2 rounded text-sm flex justify-between items-center">
            <div>
                <span class="font-semibold">${proof.filename}</span>
                <span class="text-xs text-gray-500"> (ajouté par ${proof.addedBy.name} le ${formatDisplayDate(proof.timestamp)})</span>
            </div>
            <button onclick="viewProof('${proof.proofId}')" class="text-blue-500 hover:underline text-xs">Voir</button>
            <!-- Auditor cannot remove proofs -->
        </div>
    `).join('');
}

function viewProof(proofId) {
    if (!currentAuditData) return;
    const proof = currentAuditData.proofs.find(p => p.proofId === proofId);
    if (!proof) {
        alert("Preuve non trouvée.");
        return;
    }

    try {
        const byteString = atob(proof.data);
        const mimeString = proof.mimeType;
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        // No revokeObjectURL needed immediately as the new window needs it
    } catch (error) {
        console.error("Error displaying proof:", error);
        alert("Erreur lors de l'affichage de la preuve. Les données sont peut-être corrompues.");
    }
}

function displayLogs() {
     const logModal = document.getElementById('logModal');
     const logTableBody = document.getElementById('logTableBody');

     if (!logModal || !logTableBody) {
         console.error("Log modal elements not found.");
         return;
     }
     if (!currentAuditData || !currentAuditData.logs || currentAuditData.logs.length === 0) {
         logTableBody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">Aucun historique disponible.</td></tr>';
         logModal.classList.remove('hidden');
         return;
     }

     // Sort logs chronologically (newest first)
     const sortedLogs = [...currentAuditData.logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

     logTableBody.innerHTML = sortedLogs.map(log => `
        <tr>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${formatDisplayDate(log.timestamp)}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${log.user.name || 'N/A'}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${log.user.role || 'N/A'}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${log.event}</td>
            <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-700">${log.itemId || '-'}</td>
            <td class="px-4 py-2 text-sm text-gray-700">
                <pre class="whitespace-pre-wrap text-xs">${JSON.stringify(log.details, null, 2)}</pre>
            </td>
        </tr>
     `).join('');

     logModal.classList.remove('hidden');
}


// --- UI Update Functions ---

function updateUI() {
    renderAuditTable();
    updateButtonStates();
    displayMetadata();
}

function renderAuditTable() {
    const tableBody = document.getElementById('auditItemsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear previous content

    if (!currentAuditData || !currentAuditData.auditItems || currentAuditData.auditItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-gray-500">Veuillez importer un fichier Excel ou charger un package.</td></tr>`;
        return;
    }

    currentAuditData.auditItems.forEach(async item => { // Make async to use await for getItemReadStatus
        const row = document.createElement('tr');
        row.dataset.itemId = item.id; // Add data attribute for click listener
        row.className = "hover:bg-gray-50 cursor-pointer";

        // Check read status
        const isRead = await getItemReadStatus(currentAuditData.metadata.internalVersion, item.id);
        const idCellStyle = isRead ? "px-6 py-4 whitespace-nowrap text-sm text-gray-900" : "px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900"; // Bold if not read

        // Status indicator
        let statusIndicator = '';
        switch (item.actionStatus) {
            case 'Ouvert': statusIndicator = '<span class="inline-block h-3 w-3 rounded-full bg-gray-400" title="Ouvert"></span>'; break;
            case 'En cours': statusIndicator = '<span class="inline-block h-3 w-3 rounded-full bg-orange-400" title="En cours"></span>'; break;
            case 'Clôturé': statusIndicator = '<span class="inline-block h-3 w-3 rounded-full bg-green-500" title="Clôturé"></span>'; break;
            case 'En attente Reviewer': statusIndicator = '<span class="inline-block h-3 w-3 rounded-full bg-black" title="En attente Reviewer"></span>'; break;
            default: statusIndicator = '<span class="inline-block h-3 w-3 rounded-full bg-gray-200" title="Inconnu"></span>';
        }

        row.innerHTML = `
            <td class="${idCellStyle}">${item.id}</td>
            <td class="px-6 py-4 text-sm text-gray-700">${item.requirementText.substring(0, 100)}...</td>
            <td class="px-6 py-4 text-sm text-gray-700">${item.auditorEvaluation.substring(0, 100)}...</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 flex items-center space-x-2">
                ${statusIndicator}
                <span>${item.actionStatus}</span>
            </td>
            <!-- Add other cells as needed -->
        `;
        tableBody.appendChild(row);
    });
}

function updateButtonStates() {
    const exportBtn = document.getElementById('exportPackageBtn');
    const finalizeBtn = document.getElementById('finalizeAuditBtn');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const userNameSet = !!currentUser.name;

    if (currentAuditData) {
        const isFinalized = currentAuditData.metadata.status === 'Finalized';
        exportBtn.disabled = !userNameSet || isFinalized;
        finalizeBtn.disabled = !userNameSet || isFinalized;
        viewLogsBtn.disabled = false; // Can always view logs if data is loaded
    } else {
        exportBtn.disabled = true;
        finalizeBtn.disabled = true;
        viewLogsBtn.disabled = true;
    }
}

function displayMetadata() {
    const displayDiv = document.getElementById('metadataDisplay');
    if (!displayDiv) return;

    if (currentAuditData) {
        document.getElementById('metaCoid').textContent = currentAuditData.metadata.coid || 'N/A';
        document.getElementById('metaSiteName').textContent = currentAuditData.metadata.siteName || 'N/A';
        document.getElementById('metaAuditType').textContent = currentAuditData.metadata.auditType || 'N/A';
        document.getElementById('metaAuditDate').textContent = currentAuditData.metadata.auditDate || 'N/A';
        document.getElementById('metaStatus').textContent = currentAuditData.metadata.status || 'N/A';
        document.getElementById('metaInternalVersion').textContent = currentAuditData.metadata.internalVersion || 'N/A';
        const lastSaved = currentAuditData.metadata.lastSavedBy;
        document.getElementById('metaLastSaved').textContent = lastSaved ? `${lastSaved.name} (${lastSaved.role}) le ${formatDisplayDate(currentAuditData.metadata.lastSavedTimestamp)}` : 'N/A';
        // TODO: Calculate estimated package size
        document.getElementById('metaPackageSize').textContent = '~? MB';

        displayDiv.classList.remove('hidden');
    } else {
        displayDiv.classList.add('hidden');
    }
}

// --- Utility ---
// Add any auditor-specific utility functions here
// Example: Calculate estimated size
function calculateEstimatedSize() {
    if (!currentAuditData) return 0;
    try {
        const jsonString = JSON.stringify(currentAuditData);
        // Rough estimate - actual compressed size will vary
        return (jsonString.length / (1024 * 1024)).toFixed(2); // Size in MB
    } catch {
        return 0;
    }
}
// Update metaPackageSize display when data changes (import, load, save modal)
// e.g., inside updateUI() or after modifications:
// document.getElementById('metaPackageSize').textContent = `~${calculateEstimatedSize()} MB`;
// Add warnings based on size thresholds.
