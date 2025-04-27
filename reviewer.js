/**
 * reviewer.js - Logique spécifique à l'interface Reviewer
 */

console.log("reviewer.js loaded");

// --- State ---
let currentAuditData = null;
let currentUser = { name: "", role: "Reviewer" };

document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Reviewer App");
    const userNameInput = document.getElementById('userName');
    if (userNameInput) {
        userNameInput.addEventListener('change', (e) => {
            currentUser.name = e.target.value.trim();
            console.log("User name set to:", currentUser.name);
            updateButtonStates();
        });
    }
    setupEventListeners();
    updateUI();
});

function setupEventListeners() {
    const exportBtn = document.getElementById('exportCommentsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                await handlePackageExportWithComments();
            } catch (error) {
                console.error("Erreur lors de l'exportation du package:", error);
                displayError(`Erreur lors de l'exportation : ${error.message}`, "messageArea");
            }
        });
    }

    const loadBtn = document.getElementById('loadPackageBtn');
    const packageInput = document.getElementById('packageFileInput');
    if (loadBtn && packageInput) {
        loadBtn.addEventListener('click', () => packageInput.click());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const auditItemsTableBody = document.getElementById('auditItemsTableBody');
    if (auditItemsTableBody) {
        auditItemsTableBody.addEventListener('click', (event) => {
            const row = event.target.closest('tr');
            if (row && row.dataset.itemId) {
                openEditModal(row.dataset.itemId);
            }
        });
    }
});


function handlePackageLoadTrigger() {
    console.log("Package file selected");
    handlePackageLoad(document.getElementById('packageFileInput'));
}

// --- Package Load ---
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
            const base64String = e.target.result.trim();
            if (!base64String) throw new Error("Le fichier chargé est vide ou invalide.");

            const decompressedData = decompressJson(base64String);

            if (!decompressedData || !decompressedData.metadata || !decompressedData.auditItems) {
                throw new Error("Format de fichier package invalide.");
            }

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
            fileInput.value = '';
        }
    };
    reader.onerror = function() {
        console.error("File reading error:", reader.error);
        displayError("Erreur lors de la lecture du fichier.", "messageArea");
        fileInput.value = '';
    };
    reader.readAsText(file);
}

function updateButtonStates() {
    const exportBtn = document.getElementById('exportCommentsBtn');
    const userNameSet = !!currentUser.name;

    if (currentAuditData) {
        const isFinalized = currentAuditData.metadata.status === 'Finalized';
        if (exportBtn) exportBtn.disabled = !userNameSet || isFinalized;
    } else {
        if (exportBtn) exportBtn.disabled = true;
    }
}

// --- Export with comments ---
/**
 * Handles the package export process for the Reviewer interface, specifically for exporting comments.
 * Compresses the current audit data (including reviewer comments), updates metadata, adds a log entry, and triggers a file download.
 * @async
 */
async function handlePackageExportWithComments() {
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
    // Allow export even if the audit is finalized, as per user requirement.
    // The status will be updated to AuditorReview upon export.

    try {
        // State Management: Update metadata before exporting.
        // Correctness: Increment the internal version number.
        currentAuditData.metadata.internalVersion += 1;
        // Data Transformation: Record who saved the package and when.
        currentAuditData.metadata.lastSavedBy = { name: currentUser.name, role: currentUser.role };
        currentAuditData.metadata.lastSavedTimestamp = toISOString();
        // State Management: Update the status to indicate it's ready for Auditor review after reviewer comments.
        // Correctness: This transitions the workflow state.
        currentAuditData.metadata.status = 'AuditorReview';

        // File Formatting: Generate a filename based on metadata and current date/version.
        // Correctness: Consistent naming convention with Auditor export.
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
        downloadFile(compressedData, filename, 'text/plain;charset=utf-8');

        // User Experience: Display a success message.
        // Correctness: Inform the user the package is for the auditor.
        displayInfo(`Package avec commentaires exporté pour l'auditeur (Version ${currentAuditData.metadata.internalVersion}).`, "messageArea");
        // State Management: Update the UI to reflect the new state (e.g., version number).
        updateUI();

    } catch (error) {
        // Error Handling: Catch any errors during the export process.
        // Robustness: Log the full error details.
        console.error("Error exporting package:", error);
        // Robustness: Display a user-friendly error message.
        displayError(`Erreur lors de l'exportation : ${error.message}`, "messageArea");
        // Error Handling: Attempt to revert the status change if the export failed.
        // Correctness: Reverting the status prevents the workflow from getting stuck in 'AuditorReview' if the file wasn't successfully exported.
        currentAuditData.metadata.status = 'ReviewerReview'; // Revert to previous status
        // State Management: Update the UI to reflect the reverted status.
        updateUI();
        // Best Practice: Similar to Auditor export, consider a copy before modifying state.
    }
}

function closeModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.classList.add('hidden');
}

function closeLogModal() {
    const modal = document.getElementById('logModal');
    if (modal) modal.classList.add('hidden');
}

function updateUI() {
    updateButtonStates();

    const meta = currentAuditData?.metadata;
    const displayDiv = document.getElementById('metadataDisplay');
    if (!displayDiv) return;

    if (meta) {
        document.getElementById('metaCoid').textContent = meta.coid || 'N/A';
        document.getElementById('metaSiteName').textContent = meta.siteName || 'N/A';
        document.getElementById('metaAuditType').textContent = meta.auditType || 'N/A';
        document.getElementById('metaAuditDate').textContent = meta.auditDate || 'N/A';
        document.getElementById('metaStatus').textContent = meta.status || 'N/A';
        document.getElementById('metaInternalVersion').textContent = meta.internalVersion || 'N/A';
        const lastSaved = meta.lastSavedBy;
        document.getElementById('metaLastSaved').textContent = lastSaved ? `${lastSaved.name} (${lastSaved.role}) le ${formatDisplayDate(meta.lastSavedTimestamp)}` : 'N/A';
        document.getElementById('metaPackageSize').textContent = '~? MB';
        displayDiv.classList.remove('hidden');
    } else {
        displayDiv.classList.add('hidden');
    }

    renderAuditTable();
}

function renderAuditTable() {
    const tableBody = document.getElementById('auditItemsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!currentAuditData || !currentAuditData.auditItems || currentAuditData.auditItems.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-gray-500">Veuillez charger un package (.ifsaudit).</td></tr>`;
        return;
    }

    currentAuditData.auditItems.forEach(item => {
        const row = document.createElement('tr');
        row.dataset.itemId = item.id;

        row.innerHTML = `
            <td class="px-6 py-4 text-sm">${item.id}</td>
            <td class="px-6 py-4 text-sm">${item.requirementText.substring(0, 50)}...</td>
            <td class="px-6 py-4 text-sm">${item.auditorEvaluation.substring(0, 50)}...</td>
            <td class="px-6 py-4 text-sm">${item.siteCorrection?.text?.substring(0, 50) || ''}...</td>
            <td class="px-6 py-4 text-sm">${item.siteCorrectiveAction?.text?.substring(0, 50) || ''}...</td>
            <td class="px-6 py-4 text-sm">${item.auditorEffectivenessCheck?.text?.substring(0, 50) || ''}...</td>
            <td class="px-6 py-4 text-sm">${item.actionStatus}</td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Opens the edit modal for a specific audit item in the Reviewer interface.
 * Populates the modal with item details and reviewer comments.
 * @param {string} itemId - The ID of the audit item to display.
 */
function openEditModal(itemId) {
    if (!currentAuditData || !currentAuditData.auditItems) {
        console.error("No audit data loaded.");
        return;
    }

    const item = currentAuditData.auditItems.find(item => item.id === itemId);
    if (!item) {
        console.error(`Item with ID ${itemId} not found.`);
        return;
    }

    const modal = document.getElementById('editModal');
    const modalContent = document.getElementById('modalContent');
    const modalItemIdSpan = document.getElementById('modalItemId');
    const modalAddCommentBtn = document.getElementById('modalAddCommentBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn'); // Get the cancel button

    if (!modal || !modalContent || !modalItemIdSpan || !modalAddCommentBtn || !modalCancelBtn) {
        console.error("Modal elements not found.");
        return;
    }

    modalItemIdSpan.textContent = itemId;

    // Build modal content - Read-only fields + Reviewer Comments section
    let contentHtml = `
        <div class="space-y-3 text-sm text-gray-700">
            <p><strong>Exigence:</strong> ${item.requirementText}</p>
            <p><strong>Constat Auditeur:</strong> ${item.auditorEvaluation}</p>
            <p><strong>Correction Site:</strong> ${item.siteCorrection?.text || 'N/A'}</p>
            <p><strong>Action Corrective Site:</strong> ${item.siteCorrectiveAction?.text || 'N/A'}</p>
            <p><strong>Vérif. Efficacité Auditeur:</strong> ${item.auditorEffectivenessCheck?.text || 'N/A'}</p>
            <p><strong>Statut Action:</strong> ${item.actionStatus}</p>
        </div>
        <div class="mt-4">
            <h4 class="text-md font-semibold mb-2">Commentaires Reviewer</h4>
            <div id="reviewerCommentsList" class="space-y-2">
                ${renderReviewerComments(item.reviewerComments)}
            </div>
            <div class="mt-4">
                <textarea id="modalCommentInput" class="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-purple-600" rows="3" placeholder="Ajouter un commentaire..."></textarea>
            </div>
        </div>
    `;

    modalContent.innerHTML = contentHtml;

    // Add event listener for the "Ajouter Commentaire" button
    modalAddCommentBtn.onclick = () => addCommentHandler_Reviewer(itemId);

    // Add event listener for the "Fermer" button
    modalCancelBtn.onclick = () => closeModal();


    // Show the modal
    modal.classList.remove('hidden');
}

/**
 * Renders the list of reviewer comments for an item.
 * @param {Array<object>} comments - Array of comment objects.
 * @returns {string} HTML string for the comments list.
 */
function renderReviewerComments(comments) {
    if (!comments || comments.length === 0) {
        return '<p class="text-gray-500">Aucun commentaire reviewer pour cet item.</p>';
    }
    return comments.map(comment => `
        <div class="border p-2 rounded bg-gray-50 text-sm">
            <p class="font-semibold">${comment.user.name} (${comment.user.role}) le ${formatDisplayDate(comment.timestamp)}:</p>
            <p>${comment.text}</p>
        </div>
    `).join('');
}

/**
 * Handles adding a new reviewer comment to an audit item.
 * @param {string} itemId - The ID of the audit item to add the comment to.
 */
function addCommentHandler_Reviewer(itemId) {
    if (!currentUser.name) {
        alert("Veuillez entrer votre nom avant d'ajouter un commentaire.");
        document.getElementById('userName')?.focus();
        return;
    }

    const commentInput = document.getElementById('modalCommentInput');
    const commentText = commentInput?.value.trim();

    if (!commentInput || !commentText) {
        alert("Veuillez entrer un commentaire.");
        commentInput?.focus();
        return;
    }

    const item = currentAuditData.auditItems.find(item => item.id === itemId);
    if (!item) {
        console.error(`Item with ID ${itemId} not found for adding comment.`);
        return;
    }

    // Initialize reviewerComments array if it doesn't exist
    if (!item.reviewerComments) {
        item.reviewerComments = [];
    }

    const newComment = {
        commentId: generateUUID(), // Assuming generateUUID is in common.js
        timestamp: toISOString(), // Assuming toISOString is in common.js
        user: { ...currentUser }, // Clone user object
        text: commentText
    };

    item.reviewerComments.push(newComment);

    // Add log entry for adding a comment
    addLogEntry(currentAuditData.logs, currentUser, "CommentAdded", itemId, { commentText: commentText.substring(0, 50) + '...' }); // Assuming addLogEntry is in common.js

    // Clear the input and re-render comments
    commentInput.value = '';
    const commentsListDiv = document.getElementById('reviewerCommentsList');
    if (commentsListDiv) {
        commentsListDiv.innerHTML = renderReviewerComments(item.reviewerComments);
    }

    console.log(`Comment added to item ${itemId}`);
    // No need to close modal or update main table UI immediately,
    // the user might want to add more comments.
    // The changes will be saved when the package is exported.
}
