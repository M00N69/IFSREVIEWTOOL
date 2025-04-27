/**
 * site.js - Logique spécifique à l'interface Site Audité
 */

console.log("site.js loaded");

// --- State ---
let currentAuditData = null; // Holds the complete audit data object (loaded from .ifsaudit)
let currentUser = { name: "", role: "Site" };

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Site App");
    // Get user name
    const userNameInput = document.getElementById('userName');
    if (userNameInput) {
        userNameInput.addEventListener('change', (e) => {
            currentUser.name = e.target.value.trim();
            console.log("User name set to:", currentUser.name);
            updateButtonStates(); // Force update buttons after name change
        });
    }

    // Setup event listeners (Load Package, Export Package)
    setupEventListeners();

    // Initial UI setup
    updateUI();
});

// --- Event Listener Setup ---
function setupEventListeners() {
    const loadPackageBtn = document.getElementById('loadPackageBtn');
    const packageFileInput = document.getElementById('packageFileInput');
    const exportPackageBtn = document.getElementById('exportPackageBtn');
    const auditItemsTableBody = document.getElementById('auditItemsTableBody');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSaveBtn = document.getElementById('modalSaveBtn');

    if (loadPackageBtn && packageFileInput) {
        loadPackageBtn.addEventListener('click', () => packageFileInput.click());
        // Note: Actual handling in handlePackageLoadTrigger called by onchange in HTML
    }

    if (exportPackageBtn) {
        exportPackageBtn.addEventListener('click', async () => {
            try {
                await handlePackageExport();
            } catch (error) {
                console.error("Erreur lors de l'exportation du package:", error);
                displayError(`Erreur lors de l'exportation : ${error.message}`, "messageArea");
            }
        });
    }

    if (auditItemsTableBody) {
        // Event delegation for table row clicks
        auditItemsTableBody.addEventListener('click', (event) => {
            const row = event.target.closest('tr');
            if (row && row.dataset.itemId) {
                openEditModal(row.dataset.itemId);
            }
        });
    }

    // Modal Buttons
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', closeModal); // Assuming closeModal exists/will be created
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
}

// --- Trigger Functions (called from HTML onchange) ---
function handlePackageLoadTrigger() {
    console.log("Package file selected");
    handlePackageLoad(document.getElementById('packageFileInput'));
}

// --- Core Logic ---

function handlePackageLoad(fileInput) {
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

            console.log("[Load Debug - Site] Base64 (first 100 chars):", base64String.substring(0, 100));
            console.log("[Load Debug - Site] Base64 (last 100 chars):", base64String.substring(base64String.length - 100));
            console.log("[Load Debug - Site] Base64 length:", base64String.length);

            const decompressedData = decompressJson(base64String);

            // Validation
            if (!decompressedData || !decompressedData.metadata || !decompressedData.auditItems) {
                 throw new Error("Format de fichier package invalide.");
            }
            // Site specific validation: Check status
            const allowedStatus = ['Initial', 'SiteInputRequired']; // Status where Site can load/edit
            if (!allowedStatus.includes(decompressedData.metadata.status)) {
                 throw new Error(`Le statut actuel de l'audit (${decompressedData.metadata.status}) ne permet pas l'édition par le site. Contactez l'auditeur.`);
            }
             if (decompressedData.metadata.status === 'Finalized') {
                 throw new Error("Cet audit est finalisé et ne peut plus être modifié.");
            }


            currentAuditData = decompressedData;

            // Use a temporary user object for the log until the user enters their name
            const logUser = { name: currentUser.name || "Utilisateur Site (non identifié)", role: currentUser.role };
            addLogEntry(currentAuditData.logs, logUser, "PackageLoaded", null, { filename: file.name });

            displayInfo(`Package chargé avec succès (Version ${currentAuditData.metadata.internalVersion}). Entrez votre nom et modifiez les items.`, "messageArea");
            updateUI();
            updateButtonStates(); // Force update buttons after package load

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
 * Handles the package export process for the Site interface.
 * Compresses the current audit data (including site inputs, comments, and proofs), updates metadata, adds a log entry, and triggers a file download.
 * @async
 */
async function handlePackageExport() {
    // Validation: Check if there is data to export.
    if (!currentAuditData) {
        displayError("Aucune donnée à exporter. Chargez un package d'abord.", "messageArea");
        return;
    }
    // Validation: Ensure the user's name is entered before exporting.
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant d'exporter.");
        // User Experience: Focus the username input field.
        document.getElementById('userName')?.focus();
        return;
    }
    // Validation: Prevent export if the audit is already finalized.
    // Correctness: Site users should not modify/export finalized audits.
     if (currentAuditData.metadata.status === 'Finalized') {
        displayError("Impossible d'exporter un audit finalisé.", "messageArea");
        return;
    }

    // Optional: Add validation here - e.g., check if all required site fields have been touched?
    // Robustness: Consider adding checks to ensure essential fields (like corrections for non-conformities) have been filled before allowing export. This prevents incomplete data from being sent back.

    try {
        // State Management: Update metadata before exporting.
        // Correctness: Increment the internal version number.
        currentAuditData.metadata.internalVersion += 1;
        // Data Transformation: Record who saved the package and when.
        currentAuditData.metadata.lastSavedBy = { name: currentUser.name, role: currentUser.role };
        currentAuditData.metadata.lastSavedTimestamp = toISOString();
        // State Management: Set the status to indicate it's ready for Auditor review after site input.
        // Correctness: This transitions the workflow state.
        currentAuditData.metadata.status = 'AuditorReview';

        // File Formatting: Generate a filename based on metadata and current date/version.
        // Correctness: Consistent naming convention with other roles.
        const filename = `${currentAuditData.metadata.coid}_IFS_ActionPlan_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_v${currentAuditData.metadata.internalVersion}.ifsaudit`;

        // State Management: Add a log entry for the export action.
        // Correctness: Records the user, event, and filename.
        addLogEntry(currentAuditData.logs, currentUser, "PackageExported", null, { filename: filename });

        // Data Transformation: Compress the current audit data.
        // Correctness: Await the asynchronous compressJson function from common.js.
        const compressedData = await compressJson(currentAuditData);

        // File Handling: Trigger the file download.
        // Correctness: Use the downloadFile utility from common.js.
        // File Formatting: Specify the MIME type.
        // Note: Using 'text/plain' here might be intentional to ensure it's treated as a text file for easier handling, but 'application/octet-stream' is generally more appropriate for binary data like compressed content. The decompressJson function handles trimming, which helps with potential text file issues.
        downloadFile(compressedData, filename, 'text/plain;charset=utf-8');

        // User Experience: Display a success message.
        // Correctness: Inform the user the package is for auditor review.
        displayInfo(`Package exporté avec succès pour revue auditeur (Version ${currentAuditData.metadata.internalVersion}).`, "messageArea");
        // State Management: Update the UI to reflect the new state (e.g., version number).
        // Robustness: Consider disabling further edits or prompting the user to reload after export if the workflow dictates that site input is complete for this version.
        updateUI();

    } catch (error) {
         // Error Handling: Catch any errors during the export process.
         // Robustness: Log the full error details.
         console.error("Error exporting package:", error);
         // Robustness: Display a user-friendly error message.
         displayError(`Erreur lors de l'exportation : ${error.message}`, "messageArea");
         // Error Handling: Attempt to revert the status change if the export failed.
         // Correctness: Reverting the status prevents the workflow from getting stuck in 'AuditorReview' if the file wasn't successfully exported.
         currentAuditData.metadata.status = 'SiteInputRequired'; // Revert to previous status
         // State Management: Update the UI to reflect the reverted status.
         updateUI();
         // Best Practice: Similar to other exports, consider a copy before modifying state for better error recovery.
    }
}

function openEditModal(itemId) {
    // 1. Find item, comments, proofs
    // 2. Populate modal
    // 3. Apply permissions:
    //    - Enable editing for: siteCorrection, siteCorrectiveAction, sitePlannedDate, siteActualDate, siteResponsible - TODO
    //    - Disable editing for all other fields (auditor fields, requirement text etc.) - TODO
    //    - Allow adding/removing proofs associated with the Site user - TODO
    //    - Allow adding comments for Auditor - TODO
    //    - Hide Reviewer comments and Logs section entirely - TODO
    // 4. Setup listeners within the modal (Save, Cancel, Add Comment, Add/Remove Proof) - TODO
    // 5. Mark item as read using setItemReadStatus - TODO
    // 6. Update table row UI - TODO
    console.log(`Open edit modal for item ${itemId} - logic to be implemented.`);
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

     // Check if editing is allowed based on status
     const isFinalized = currentAuditData.metadata.status === 'Finalized';
     const isEditable = !isFinalized && ['Initial', 'SiteInputRequired'].includes(currentAuditData.metadata.status);


    modalItemIdSpan.textContent = itemId;
    modalContent.innerHTML = ''; // Clear previous

    // --- Populate Modal Content (Site View) ---
     modalContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">ID Exigence</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.id || ''}</p>
            </div>
             <div>
                <label class="block text-sm font-medium text-gray-700">Statut Action (Auditeur)</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.actionStatus || ''}</p>
            </div>
            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700">Exigence</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.requirementText || ''}</p>
            </div>
            <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700">Constat Auditeur</label>
                <p class="mt-1 text-sm text-gray-900 bg-gray-50 p-2 rounded">${item.auditorEvaluation || ''}</p>
            </div>

            <hr class="md:col-span-2 my-2"/>

            <h4 class="md:col-span-2 text-md font-semibold text-gray-800">Partie Site (Modifiable)</h4>
            <div class="md:col-span-2">
                <label for="modalSiteCorrection" class="block text-sm font-medium text-gray-700">Correction</label>
                <textarea id="modalSiteCorrection" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2" ${!isEditable ? 'disabled' : ''}>${item.siteCorrection?.text || ''}</textarea>
            </div>
             <div class="md:col-span-2">
                <label for="modalSiteCorrectiveAction" class="block text-sm font-medium text-gray-700">Action Corrective</label>
                <textarea id="modalSiteCorrectiveAction" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2" ${!isEditable ? 'disabled' : ''}>${item.siteCorrectiveAction?.text || ''}</textarea>
            </div>
             <div>
                <label for="modalSiteResponsible" class="block text-sm font-medium text-gray-700">Responsable</label>
                <input type="text" id="modalSiteResponsible" value="${item.siteResponsible || ''}" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2" ${!isEditable ? 'disabled' : ''}>
            </div>
            <div class="grid grid-cols-2 gap-4">
                 <div>
                    <label for="modalSitePlannedDate" class="block text-sm font-medium text-gray-700">Date Prévue</label>
                    <input type="text" id="modalSitePlannedDate" value="${item.sitePlannedDate || ''}" placeholder="jj.mm.aaaa" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2" ${!isEditable ? 'disabled' : ''}>
                </div>
                 <div>
                    <label for="modalSiteActualDate" class="block text-sm font-medium text-gray-700">Date Réelle</label>
                    <input type="text" id="modalSiteActualDate" value="${item.siteActualDate || ''}" placeholder="jj.mm.aaaa" class="mt-1 focus:ring-indigo-500 focus:border-indigo-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md p-2" ${!isEditable ? 'disabled' : ''}>
                </div>
            </div>
        </div>

        <hr class="my-4"/>

        <!-- Comments Section (Site sees Auditor comments, adds for Auditor) -->
        <div class="mt-4">
             <h4 class="text-md font-semibold text-gray-800 mb-2">Commentaires</h4>
             <div id="modalCommentsList" class="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 mb-2 space-y-2">
                 <!-- Comments filtered for Site view -->
             </div>
             <div class="flex space-x-2">
                 <textarea id="modalNewCommentText" rows="2" placeholder="Ajouter un commentaire pour l'Auditeur..." class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2 flex-grow" ${!isEditable ? 'disabled' : ''}></textarea>
                 <button id="modalAddCommentBtnInternal" class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-sm" ${!isEditable ? 'disabled' : ''}>Ajouter</button>
             </div>
        </div>

         <hr class="my-4"/>

         <!-- Proofs Section (Site can add/remove their proofs) -->
         <div class="mt-4">
             <h4 class="text-md font-semibold text-gray-800 mb-2">Preuves</h4>
             <div id="modalProofsList" class="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 mb-2 space-y-2">
                 <!-- Proofs list -->
             </div>
             <div class="${!isEditable ? 'hidden' : ''}"> <!-- Hide upload if not editable -->
                 <label for="modalProofInput" class="block text-sm font-medium text-gray-700">Ajouter une preuve (max ${MAX_PROOF_SIZE_MB} Mo):</label>
                 <input type="file" id="modalProofInput" multiple class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"/>
                 <p id="proofSizeWarning" class="text-xs text-red-600 hidden">Attention: Un ou plusieurs fichiers dépassent la taille maximale de ${MAX_PROOF_SIZE_MB} Mo.</p>
             </div>
         </div>
    `;

     // --- Load Comments & Proofs (filtered) ---
    loadModalComments_Site(itemId);
    loadModalProofs_Site(itemId);

     // --- Add Internal Listeners ---
     const addCommentBtnInternal = document.getElementById('modalAddCommentBtnInternal');
     if (addCommentBtnInternal) {
         addCommentBtnInternal.addEventListener('click', () => addCommentHandler_Site(itemId));
     }
     const proofInput = document.getElementById('modalProofInput');
     if (proofInput) {
         proofInput.addEventListener('change', (event) => handleAddProof_Site(itemId, event.target));
     }

     // --- Disable Save Button if not editable ---
     document.getElementById('modalSaveBtn').disabled = !isEditable;

     // --- Show Modal ---
    modal.classList.remove('hidden');

     // --- Mark as Read ---
     if (isEditable) { // Only mark as read if the site could potentially interact
        setItemReadStatus(currentAuditData.metadata.internalVersion, itemId)
            .then(() => {
                const row = document.querySelector(`#auditItemsTableBody tr[data-item-id="${itemId}"]`);
                row?.classList.remove('font-semibold');
            })
            .catch(err => console.error("Failed to set read status:", err));
     }
}

function closeModal() { // Shared function, maybe move to common.js later?
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}


function saveModalChanges(itemId) {
    // 1. Get data from editable modal fields (site fields)
    // 2. Compare with original data in `currentAuditData`
    // 3. For each changed site field:
    //    - Update `currentAuditData` (including lastEditBy and timestamp for text fields) - TODO
    //    - Add log entry (FieldUpdated) - TODO
    // 4. Handle added/removed proofs (update `currentAuditData.proofs`, add logs) - Done via separate handlers
    // 5. Handle added comments (update `currentAuditData.comments`, add logs) - Done via separate handler
    // 6. Close modal - TODO
    // 7. Update main table display - TODO
    console.log(`Save changes for item ${itemId} - logic to be implemented.`);
     if (!currentAuditData) return;
    const itemIndex = currentAuditData.auditItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom.");
        return;
    }

     const item = currentAuditData.auditItems[itemIndex];
     const changes = [];

     // Helper to update field and log change (Site specific)
    const updateSiteField = (fieldName, newValue, oldValue, isObject = false, subField = 'text') => {
        let changed = false;
        if (isObject) {
            if (!item[fieldName]) item[fieldName] = {};
            if (item[fieldName][subField] !== newValue) {
                changes.push({ field: `${fieldName}.${subField}`, oldValue: item[fieldName][subField], newValue: newValue });
                item[fieldName][subField] = newValue;
                item[fieldName].lastEditBy = currentUser.name; // Site user
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

     // Get values from modal (only site fields)
    const siteCorrection = document.getElementById('modalSiteCorrection')?.value;
    const siteCorrectiveAction = document.getElementById('modalSiteCorrectiveAction')?.value;
    const siteResponsible = document.getElementById('modalSiteResponsible')?.value;
    const sitePlannedDate = document.getElementById('modalSitePlannedDate')?.value;
    const siteActualDate = document.getElementById('modalSiteActualDate')?.value;

     // Update fields and log changes
    updateSiteField('siteCorrection', siteCorrection, item.siteCorrection?.text, true);
    updateSiteField('siteCorrectiveAction', siteCorrectiveAction, item.siteCorrectiveAction?.text, true);
    updateSiteField('siteResponsible', siteResponsible, item.siteResponsible);
    updateSiteField('sitePlannedDate', sitePlannedDate, item.sitePlannedDate);
    updateSiteField('siteActualDate', siteActualDate, item.siteActualDate);

     // Add log entries
    changes.forEach(change => {
        addLogEntry(currentAuditData.logs, currentUser, "FieldUpdated", itemId, change);
    });

     if (changes.length > 0) {
         displayInfo(`Modifications enregistrées pour l'item ${itemId}. N'oubliez pas d'exporter le package.`, "messageArea");
         // Update estimated size?
         updateEstimatedSizeDisplay();
    }

     closeModal();
     renderAuditTable(); // Re-render table
}

function addCommentHandler_Site(itemId) {
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant d'ajouter un commentaire.");
        return;
    }
    const commentTextElement = document.getElementById('modalNewCommentText');
    const text = commentTextElement?.value.trim();

    if (!text) {
        alert("Veuillez écrire un commentaire.");
        return;
    }

    const newComment = {
        commentId: generateUUID(),
        itemId: itemId,
        author: { name: currentUser.name, role: currentUser.role },
        recipientRole: 'Auditeur', // Site always comments for Auditor
        text: text,
        timestamp: toISOString()
    };

    currentAuditData.comments.push(newComment);
    addLogEntry(currentAuditData.logs, currentUser, "CommentAdded", itemId, { recipient: 'Auditeur' });

    commentTextElement.value = '';
    loadModalComments_Site(itemId); // Refresh comment list in modal
    displayInfo(`Commentaire ajouté pour l'item ${itemId}. N'oubliez pas d'exporter le package.`, "messageArea");
    updateEstimatedSizeDisplay();
}

function loadModalComments_Site(itemId) {
    const commentsList = document.getElementById('modalCommentsList');
    if (!commentsList || !currentAuditData) return;

    // Site sees comments from Auditor and their own comments
    const itemComments = currentAuditData.comments.filter(c =>
        c.itemId === itemId && (c.author.role === 'Auditeur' || c.author.role === 'Site')
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (itemComments.length === 0) {
        commentsList.innerHTML = '<p class="text-gray-500 text-sm">Aucun commentaire visible.</p>';
        return;
    }

    commentsList.innerHTML = itemComments.map(comment => `
        <div class="bg-gray-100 p-2 rounded text-sm">
            <p class="font-semibold">${comment.author.name} (${comment.author.role}):</p>
            <p class="whitespace-pre-wrap">${comment.text}</p>
            <p class="text-xs text-gray-500 text-right">${formatDisplayDate(comment.timestamp)}</p>
        </div>
    `).join('');
}

function loadModalProofs_Site(itemId) {
     const proofsList = document.getElementById('modalProofsList');
    if (!proofsList || !currentAuditData) return;

     const itemProofs = currentAuditData.proofs.filter(p => p.itemId === itemId);
     const isEditable = !currentAuditData.metadata.status === 'Finalized' && ['Initial', 'SiteInputRequired'].includes(currentAuditData.metadata.status);


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
            <div>
                 <button onclick="viewProof_Site('${proof.proofId}')" class="text-blue-500 hover:underline text-xs mr-2">Voir</button>
                 ${isEditable && proof.addedBy.role === 'Site' ?
                     `<button onclick="handleRemoveProof_Site('${proof.proofId}', '${itemId}')" class="text-red-500 hover:underline text-xs">Supprimer</button>` :
                     ''
                 }
            </div>
        </div>
    `).join('');
}

// Need separate viewProof for site as it might be called from site.js context
function viewProof_Site(proofId) {
     if (!currentAuditData) return;
    const proof = currentAuditData.proofs.find(p => p.proofId === proofId);
    if (!proof) {
        alert("Preuve non trouvée.");
        return;
    }
     try {
        const byteString = atob(proof.data); // Assuming base64 data
        const mimeString = proof.mimeType;
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    } catch (error) {
        console.error("Error displaying proof:", error);
        alert("Erreur lors de l'affichage de la preuve.");
    }
}


// --- UI Update Functions ---

function updateUI() {
    renderAuditTable();
    updateButtonStates();
    displayMetadata();
    // Hide elements not relevant to Site (e.g., finalize button, log view button)
    hideIrrelevantElements();
    updateEstimatedSizeDisplay();
}

function renderAuditTable() {
    const tableBody = document.getElementById('auditItemsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear previous content

    if (!currentAuditData || !currentAuditData.auditItems || currentAuditData.auditItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-gray-500">Veuillez charger un package (.ifsaudit).</td></tr>`;
        return;
    }

     currentAuditData.auditItems.forEach(async item => {
        const row = document.createElement('tr');
        row.dataset.itemId = item.id;
        const isEditable = !currentAuditData.metadata.status === 'Finalized' && ['Initial', 'SiteInputRequired'].includes(currentAuditData.metadata.status);
        row.className = isEditable ? "hover:bg-gray-50 cursor-pointer" : "bg-gray-100"; // Indicate non-editable rows

        const isRead = await getItemReadStatus(currentAuditData.metadata.internalVersion, item.id);
        const idCellStyle = isRead || !isEditable ? "px-6 py-4 whitespace-nowrap text-sm text-gray-900" : "px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900";

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
            <td class="px-6 py-4 text-sm text-gray-700">${item.requirementText.substring(0, 70)}...</td>
            <td class="px-6 py-4 text-sm text-gray-700">${item.siteCorrection?.text?.substring(0, 70) || ''}...</td>
            <td class="px-6 py-4 text-sm text-gray-700">${item.siteCorrectiveAction?.text?.substring(0, 70) || ''}...</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${item.siteResponsible || ''}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${item.sitePlannedDate || ''}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 flex items-center space-x-2">
                ${statusIndicator}
                <span>${item.actionStatus}</span>
            </td>
        `;
        tableBody.appendChild(row);
    });
    // 1. Get table body
    // 2. Clear previous content
    // 3. If no data, display message ("Load Package")
    // 4. Loop through `currentAuditData.auditItems`
    // 5. Create row (<tr>)
    // 6. Populate cells (<td>) - Show relevant columns for Site (ID, Requirement, Site fields, Status)
    // 7. Add status indicators
    // 8. Check read status and apply bold styling
    // 9. Add click listener -> openEditModal
    // 10. Append row
}

function updateButtonStates() {
    const loadBtn = document.getElementById('loadPackageBtn');
    const exportBtn = document.getElementById('exportPackageBtn');
    const userNameSet = !!currentUser.name;

    loadBtn.disabled = false; // Always allow loading

    if (currentAuditData) {
        const isFinalized = currentAuditData.metadata.status === 'Finalized';
        const isEditable = !isFinalized && ['Initial', 'SiteInputRequired'].includes(currentAuditData.metadata.status);
        exportBtn.disabled = !userNameSet || !isEditable;
    } else {
        exportBtn.disabled = true;
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
        updateEstimatedSizeDisplay(); // Update size display

        displayDiv.classList.remove('hidden');
    } else {
        displayDiv.classList.add('hidden');
    }
}

function hideIrrelevantElements() {
    // Site doesn't have Import Excel, Finalize, View Logs buttons in the base HTML structure
    // So no need to hide them explicitly here unless they were added dynamically.
}

function updateEstimatedSizeDisplay() {
     const sizeSpan = document.getElementById('metaPackageSize');
     if (sizeSpan && currentAuditData) {
         const estimatedMB = calculateEstimatedSize_Site();
         sizeSpan.textContent = `~${estimatedMB} MB`;
         if (estimatedMB > MAX_PACKAGE_SIZE_MB) {
             sizeSpan.classList.add('text-red-500', 'font-bold');
             displayError(`Attention : La taille estimée du package (${estimatedMB} Mo) dépasse la limite recommandée de ${MAX_PACKAGE_SIZE_MB} Mo.`, "messageArea");
         } else {
              sizeSpan.classList.remove('text-red-500', 'font-bold');
         }
     } else if (sizeSpan) {
         sizeSpan.textContent = '~0 MB';
         sizeSpan.classList.remove('text-red-500', 'font-bold');
     }
}


// --- Proof Handling ---
function handleAddProof_Site(itemId, fileInput) {
     if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant d'ajouter une preuve.");
        return;
    }
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        return; // No files selected
    }

    const files = Array.from(fileInput.files);
    let sizeWarning = false;
    const proofPromises = files.map(file => {
        return new Promise((resolve, reject) => {
            if ((file.size / (1024 * 1024)) > MAX_PROOF_SIZE_MB) {
                sizeWarning = true;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result.split(',')[1]; // Get base64 part
                const newProof = {
                    proofId: generateUUID(),
                    itemId: itemId,
                    filename: file.name,
                    mimeType: file.type,
                    data: base64Data,
                    addedBy: { name: currentUser.name, role: currentUser.role },
                    timestamp: toISOString()
                };
                currentAuditData.proofs.push(newProof);
                addLogEntry(currentAuditData.logs, currentUser, "ProofAdded", itemId, { filename: file.name });
                resolve();
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file); // Read as Base64 Data URL
        });
    });

    Promise.all(proofPromises)
        .then(() => {
            loadModalProofs_Site(itemId); // Refresh proof list in modal
            updateEstimatedSizeDisplay(); // Update estimated size
            displayInfo(`${files.length} preuve(s) ajoutée(s) pour l'item ${itemId}. N'oubliez pas d'exporter.`, "messageArea");
            const warningElement = document.getElementById('proofSizeWarning');
            if (warningElement) {
                warningElement.classList.toggle('hidden', !sizeWarning);
            }
        })
        .catch(error => {
            console.error("Error adding proof(s):", error);
            displayError("Erreur lors de l'ajout d'une ou plusieurs preuves.", "messageArea");
        })
        .finally(() => {
            fileInput.value = ''; // Reset file input
        });
    // 1. Check file size (warn if > MAX_PROOF_SIZE_MB)
    // 2. Read file as Base64
    // 3. Create proof object (proofId, itemId, filename, mimeType, data, addedBy, timestamp)
    // 4. Add to `currentAuditData.proofs`
    // 5. Add log entry (ProofAdded)
    // 6. Update estimated package size display
    // 7. Update modal UI to show the added proof
}

function handleRemoveProof_Site(proofId, itemId) {
     if (!currentAuditData || !currentUser.name) return;

     const proofIndex = currentAuditData.proofs.findIndex(p => p.proofId === proofId);
     if (proofIndex === -1) return;

     const proof = currentAuditData.proofs[proofIndex];
     // Ensure only the user who added it can remove it (or maybe auditor should be able to?)
     // For now, only site user removes their own proofs.
     if (proof.addedBy.role !== 'Site' || proof.addedBy.name !== currentUser.name) {
         alert("Vous ne pouvez supprimer que les preuves que vous avez ajoutées.");
         return;
     }

     if (confirm(`Êtes-vous sûr de vouloir supprimer la preuve "${proof.filename}" ?`)) {
         currentAuditData.proofs.splice(proofIndex, 1); // Remove from array
         addLogEntry(currentAuditData.logs, currentUser, "ProofRemoved", itemId, { filename: proof.filename });
         loadModalProofs_Site(itemId); // Refresh list
         updateEstimatedSizeDisplay(); // Update size
         displayInfo(`Preuve "${proof.filename}" supprimée. N'oubliez pas d'exporter.`, "messageArea");
     }
    // 1. Find proof in `currentAuditData.proofs` by proofId
    // 2. Check if addedBy matches currentUser
    // 3. Remove from `currentAuditData.proofs`
    // 4. Add log entry (ProofRemoved)
    // 5. Update estimated package size display
    // 6. Update modal UI
}

// --- Utility ---
function calculateEstimatedSize_Site() {
    if (!currentAuditData) return 0;
    try {
        // Simple estimation based on JSON string length - doesn't account for compression ratio
        const jsonString = JSON.stringify(currentAuditData);
        return (jsonString.length / (1024 * 1024)).toFixed(2); // Size in MB
    } catch {
        return 0;
    }
}
