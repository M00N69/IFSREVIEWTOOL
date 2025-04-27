/**
 * common.js - Fonctions utilitaires partagées pour l'application IFS Audit
 */

// --- Configuration ---
const APP_VERSION = "1.0.0";
const MAX_PROOF_SIZE_MB = 2;
const MAX_PACKAGE_SIZE_MB = 50;
const INDEXED_DB_NAME = "IFSAuditDB";
const INDEXED_DB_VERSION = 1;
const READ_STATUS_STORE_NAME = "readStatus";

// --- i18n (Internationalization) ---
const translations = {
    fr: {
        // Add French translations here
        appNameAuditor: "IFS Audit - Interface Auditeur",
        appNameSite: "IFS Audit - Interface Site",
        appNameReviewer: "IFS Audit - Interface Reviewer",
        yourNameLabel: "Votre Nom:",
        loadPackageButton: "Charger un fichier (.ifsaudit)",
        importExcelButton: "Importer un fichier Excel (.xlsx)",
        exportPackageButton: "Exporter le Package (.ifsaudit)",
        finalizeAuditButton: "Finaliser l'Audit",
        viewLogsButton: "Voir l'Historique",
        // ... other labels
    },
    en: {
        // Add English translations here
        appNameAuditor: "IFS Audit - Auditor Interface",
        appNameSite: "IFS Audit - Site Interface",
        appNameReviewer: "IFS Audit - Reviewer Interface",
        yourNameLabel: "Your Name:",
        loadPackageButton: "Load File (.ifsaudit)",
        importExcelButton: "Import Excel File (.xlsx)",
        exportPackageButton: "Export Package (.ifsaudit)",
        finalizeAuditButton: "Finalize Audit",
        viewLogsButton: "View History",
        // ... other labels
    }
};

let currentLang = 'fr'; // Default language

function setLanguage(lang) {
    currentLang = translations[lang] ? lang : 'fr';
    // TODO: Implement function to update UI texts based on currentLang
    console.log(`Language set to: ${currentLang}`);
}

function t(key) {
    return translations[currentLang][key] || `Missing translation: ${key}`;
}

// --- Compression (Pako.js) ---
// Assumes Pako.js is loaded globally via CDN or local file

// Make async to use FileReader for robust Base64 encoding
/**
 * This is used for creating the .ifsaudit package file content.
 * @param {object} jsonData - The JavaScript object to compress.
 * @returns {Promise<string>} A promise that resolves with the Base64 encoded compressed string.
 * @throws {Error} If Pako is not loaded or compression/encoding fails.
 */
async function compressJson(jsonData) {
    console.log("[Compress Debug] Attempting compression...");
    // Correctness: Check if Pako library is available globally.
    if (typeof pako === 'undefined') {
        console.error("[Compress Debug] Pako library is not loaded!");
        // Error Handling: Throw a specific error if the dependency is missing.
        throw new Error("La librairie de compression (Pako.js) n'est pas chargée.");
    }
    try {
        // Data Transformation: Convert JSON object to a string.
        console.log("[Compress Debug] Stringifying JSON data...");
        const jsonString = JSON.stringify(jsonData);
        console.log("[Compress Debug] JSON stringified. Length:", jsonString.length);

        // Compression: Use Pako's deflate to compress the string.
        console.log("[Compress Debug] Calling pako.deflate...");
        // Compress to Uint8Array (binary)
        const compressedBinary = pako.deflate(jsonString);
        console.log("[Compress Debug] Compression successful. Binary length:", compressedBinary.length);

        // Encoding: Encode the binary data to a Base64 string.
        // Robustness: Using Blob and FileReader is a reliable way to handle binary-to-Base64 encoding in browsers.
        console.log("[Compress Debug] Encoding binary data to Base64 via Blob/FileReader...");
        // Convert Uint8Array to Blob
        const blob = new Blob([compressedBinary], { type: 'application/octet-stream' });

        // Use FileReader to read Blob as Data URL (which includes Base64)
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // result is like "data:application/octet-stream;base64,..."
                const base64Url = reader.result;
                // Extract only the Base64 part
                const base64String = base64Url.split(',')[1];
                // Error Handling: Check if Base64 extraction was successful.
                if (!base64String) {
                     console.error("[Compress Debug] Failed to extract Base64 string from Data URL.");
                     reject(new Error("Échec de l'encodage Base64."));
                     return;
                }
                console.log("[Compress Debug] Base64 encoding successful. String length:", base64String.length);
                // Correctness: Resolve the promise with the Base64 string.
                resolve(base64String);
            };
            // Error Handling: Handle errors during file reading.
            reader.onerror = (error) => {
                 console.error("[Compress Debug] FileReader error during Base64 encoding:", error);
                 reject(new Error(`Échec de l'encodage Base64 via FileReader: ${error.message || 'Erreur inconnue'}`));
            };
            reader.readAsDataURL(blob);
        });

    } catch (error) {
        // Error Handling: Catch and re-throw errors during stringification or deflation.
        console.error("[Compress Debug] Error during compression/encoding setup:", error);
        throw new Error(`Échec de la compression : ${error.message || 'Erreur inconnue'}`);
    }
}

/**
 * Decompresses a Base64 encoded string using Pako (zlib inflate) and parses the result as JSON.
 * This is used for loading the .ifsaudit package file content.
 * @param {string} base64String - The Base64 encoded string to decompress and parse.
 * @returns {object} The decompressed and parsed JavaScript object.
 * @throws {Error} If Pako is not loaded or decompression/parsing fails.
 */
function decompressJson(base64String) {
     console.log("[Decompress Debug] Attempting decompression...");
     // Correctness: Check if Pako library is available globally.
     if (typeof pako === 'undefined') {
        console.error("[Decompress Debug] Pako library is not loaded!");
        // Error Handling: Throw a specific error if the dependency is missing.
        throw new Error("La librairie de décompression (Pako.js) n'est pas chargée.");
    }
    let binaryString, bytes, decompressed, jsonData; // Declare variables outside try for error reporting
    try {
        // Validation: Basic check for input string presence.
        console.log("[Decompress Debug] Original Base64 length:", base64String?.length);
        // Data Transformation: Trim whitespace from the input string.
        const trimmedBase64 = base64String.trim(); // Trim whitespace
        console.log("[Decompress Debug] Trimmed Base64 length:", trimmedBase64.length);

        // Decoding: Decode the Base64 string to a binary string.
        console.log("[Decompress Debug] Decoding Base64 string to binary string...");
        // Correctness: Use atob for Base64 decoding in browsers.
        binaryString = atob(trimmedBase64); // Use trimmed string // Step 1: Decode Base64
        console.log("[Decompress Debug] Base64 decoded. Binary string length:", binaryString.length);

        // Data Transformation: Convert binary string to Uint8Array.
        console.log("[Decompress Debug] Converting binary string to Uint8Array...");
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        console.log("[Decompress Debug] Base64 decoded. Binary length:", bytes.length);

        // Decompression: Use Pako's inflate to decompress the binary data.
        console.log("[Decompress Debug] Calling pako.inflate with binary data...");
        // Correctness: Inflate to a string.
        const decompressed = pako.inflate(bytes, { to: 'string' });
        console.log("[Decompress Debug] Decompression successful. Decompressed length:", decompressed.length);

        // Parsing: Parse the decompressed string as JSON.
        console.log("[Decompress Debug] Parsing JSON...");
        // Correctness: Use JSON.parse to convert the string back to an object.
        const jsonData = JSON.parse(decompressed);
        console.log("[Decompress Debug] JSON parsed successfully.");
        // Correctness: Return the parsed JSON object.
        return jsonData;
    } catch (error) {
        // Error Handling: Catch and re-throw errors during decoding, inflation, or parsing.
        // Robustness: Provide a user-friendly error message in case of format issues.
        console.error("[Decompress Debug] Error during decompression/parsing:", error);
        throw new Error(`Échec de la décompression/lecture du fichier : ${error.message || 'Format invalide ou corrompu?'}`);
    }
}

// --- File Handling ---

/**
 * Handles file selection from an input element and calls a callback with the result.
 * This is a generic utility for file loading.
 * @param {string} fileInputId - The ID of the file input element.
 * @param {function(string|ArrayBuffer, string): void} callback - The callback function to call with file data and name.
 */
function handleFileUpload(fileInputId, callback) {
    const fileInput = document.getElementById(fileInputId);
    // Validation: Check if the file input element exists and a file is selected.
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Veuillez sélectionner un fichier.");
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();

    // Event Handling: Set up onload and onerror handlers for the FileReader.
    reader.onload = function(event) {
        // Correctness: Call the callback with the file result and name.
        callback(event.target.result, file.name);
    };

    reader.onerror = function(event) {
        // Error Handling: Log and alert on file reading errors.
        console.error("File reading error:", reader.error);
        alert("Erreur lors de la lecture du fichier.");
    };

    // Data Extraction: Read the file content based on its extension.
    // Correctness: Reads .xlsx as ArrayBuffer for SheetJS, .ifsaudit as Data URL for Base64 encoding.
    // Edge Cases: Handles unsupported file types.
    if (file.name.endsWith('.xlsx')) {
        reader.readAsArrayBuffer(file); // For SheetJS
    } else if (file.name.endsWith('.ifsaudit')) {
        // Read the package file as Data URL to reliably get Base64 content
        reader.readAsDataURL(file);
    } else {
        // Error Handling: Alert for unsupported file types.
        alert("Type de fichier non supporté.");
    }
}

/**
 * Triggers a file download in the browser.
 * This is used for exporting the .ifsaudit package file.
 * @param {string} content - The content to download (e.g., Base64 string).
 * @param {string} filename - The desired filename for the downloaded file.
 * @param {string} [mimeType='text/plain;charset=utf-8'] - The MIME type of the content.
 */
function downloadFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
    console.log(`[Download Debug] Preparing download for: ${filename}, Type: ${mimeType}, Content length: ${content.length}`);
    let blob;
    try {
        // Data Transformation: Create a Blob from the content.
        console.log("[Download Debug] Creating Blob...");
        // Correctness: Use the provided content and MIME type to create the Blob.
        blob = new Blob([content], { type: mimeType });
        console.log("[Download Debug] Blob created successfully. Size:", blob.size);
    } catch (error) {
        // Error Handling: Handle errors during Blob creation.
        console.error("[Download Debug] Error creating Blob:", error);
        // Robustness: Display an error message to the user.
        displayError(`Erreur lors de la préparation du fichier pour le téléchargement : ${error.message}`, "messageArea"); // Assuming messageArea exists
        return; // Stop if Blob creation fails
    }

    let url;
    try {
        // File Handling: Create an Object URL for the Blob.
        console.log("[Download Debug] Creating Object URL...");
        // Correctness: Use URL.createObjectURL to create a temporary URL for the Blob.
        url = URL.createObjectURL(blob);
        console.log("[Download Debug] Object URL created:", url);
    } catch (error) {
        // Error Handling: Handle errors during Object URL creation.
        console.error("[Download Debug] Error creating Object URL:", error);
        // Robustness: Display an error message to the user.
        displayError(`Erreur lors de la création du lien de téléchargement : ${error.message}`, "messageArea");
        return; // Stop if URL creation fails
    }

    // File Handling: Create a temporary anchor element to trigger the download.
    const a = document.createElement('a');
    // Correctness: Set the href to the Object URL and the download attribute to the desired filename.
    a.href = url;
    a.download = filename;
    // Correctness: Append the anchor to the body (necessary for Firefox).
    document.body.appendChild(a);
    console.log("[Download Debug] Download link created and appended to body.");

    try {
        // File Handling: Programmatically click the anchor to trigger the download.
        console.log("[Download Debug] Clicking download link...");
        a.click();
        console.log("[Download Debug] Download link clicked.");
    } catch (error) {
         // Error Handling: Handle potential errors during the click event.
         console.error("[Download Debug] Error clicking download link:", error);
         // Robustness: Display an error message to the user.
         displayError(`Erreur lors du déclenchement du téléchargement : ${error.message}`, "messageArea");
    } finally {
        // Resource Management: Clean up the temporary anchor and Object URL.
        console.log("[Download Debug] Cleaning up download link and URL...");
        // Correctness: Remove the anchor from the DOM.
        document.body.removeChild(a);
        // Correctness: Revoke the Object URL to release memory.
        URL.revokeObjectURL(url);
        console.log("[Download Debug] Cleanup complete.");
    }
}

// --- UUID Generation ---
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- Date Formatting ---
function toISOString(date = new Date()) {
    return date.toISOString();
}

function formatDisplayDate(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        // Adjust formatting as needed
        return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
        return isoString; // Return original if parsing fails
    }
}

// --- Logging ---
function addLogEntry(logArray, user, event, itemId = null, details = {}) {
    // Ensure logArray exists
    if (!logArray) {
        console.warn("Attempted to add log entry to a non-existent array. Initializing.");
        logArray = []; // This won't modify the original caller's array unless it's passed back. Be careful.
    }
     // Ensure user object is valid
    const logUser = {
        name: user?.name || "Inconnu",
        role: user?.role || "Inconnu"
    };

    const newLog = {
        logId: generateUUID(),
        timestamp: toISOString(),
        user: logUser,
        event: event,
        details: details
    };
    if (itemId) {
        newLog.itemId = itemId;
    }
    logArray.push(newLog);
    console.log("Log added:", newLog);
}


// --- IndexedDB ---
let db = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject("Database error: " + event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("Database opened successfully");
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            console.log("Upgrading database...");
            const tempDb = event.target.result;
            if (!tempDb.objectStoreNames.contains(READ_STATUS_STORE_NAME)) {
                // Key path: combination of package internalVersion and itemId
                tempDb.createObjectStore(READ_STATUS_STORE_NAME, { keyPath: "id" });
                console.log(`Object store '${READ_STATUS_STORE_NAME}' created.`);
            }
            // Add other stores if needed in future versions
        };
    });
}

async function setItemReadStatus(packageVersion, itemId) {
    try {
        const dbInstance = await openDB();
        const transaction = dbInstance.transaction([READ_STATUS_STORE_NAME], "readwrite");
        const store = transaction.objectStore(READ_STATUS_STORE_NAME);
        const readItemId = `v${packageVersion}-${itemId}`;
        store.put({ id: readItemId, readTimestamp: toISOString() });
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    } catch (error) {
        console.error("Error setting read status:", error);
    }
}

async function getItemReadStatus(packageVersion, itemId) {
    try {
        const dbInstance = await openDB();
        const transaction = dbInstance.transaction([READ_STATUS_STORE_NAME], "readonly");
        const store = transaction.objectStore(READ_STATUS_STORE_NAME);
        const readItemId = `v${packageVersion}-${itemId}`;
        const request = store.get(readItemId);
        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                resolve(!!event.target.result); // Return true if found, false otherwise
            };
            request.onerror = (event) => reject(event.target.error);
        });
    } catch (error) {
        console.error("Error getting read status:", error);
        return false; // Assume not read on error
    }
}


// --- DOM Utilities ---
function clearContainer(elementId) {
    const container = document.getElementById(elementId);
    if (container) {
        container.innerHTML = '';
    }
}

function displayError(message, containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="text-red-600 bg-red-100 border border-red-400 p-3 rounded">${message}</p>`;
    } else {
        alert(`Error: ${message}`); // Fallback
    }
}

function displayInfo(message, containerId) {
     const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<p class="text-blue-600 bg-blue-100 border border-blue-400 p-3 rounded">${message}</p>`;
    } else {
        console.log(`Info: ${message}`); // Fallback
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Set app version in footer
    const versionSpan = document.getElementById('appVersion');
    if (versionSpan) {
        versionSpan.textContent = APP_VERSION;
    }
    // Set default language (can be overridden by specific app later)
    setLanguage('fr');
    // Attempt to open DB on load
    openDB().catch(err => console.error("Failed to open DB on initial load:", err));
});

console.log("common.js loaded");
