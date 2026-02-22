// Save options to browser.storage
function saveOptions(e) {
    e.preventDefault();
    browser.storage.sync.set({
        apiKey: document.querySelector("#apiKey").value,
        model: document.querySelector("#model").value
    }).then(() => {
        const status = document.querySelector("#status");
        status.textContent = "Options saved.";
        status.className = "success";
        setTimeout(() => {
            status.textContent = "";
            status.className = "";
        }, 1500);
    }, (error) => {
        const status = document.querySelector("#status");
        status.textContent = "Error saving options: " + error;
        status.className = "error";
    });
}

// Restore select box and checkbox state from the preferences
// stored in browser.storage.
function restoreOptions() {
    function setCurrentChoice(result) {
        document.querySelector("#apiKey").value = result.apiKey || "";
        document.querySelector("#model").value = result.model || "gemini-2.5-flash-lite";
    }

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    let getting = browser.storage.sync.get(["apiKey", "model"]);
    getting.then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
