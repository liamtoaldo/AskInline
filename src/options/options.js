// Fetch available models from Gemini API
async function fetchModels(apiKey) {
    const modelSelect = document.querySelector("#model");
    const modelStatus = document.querySelector("#model-status");
    const currentModel = modelSelect.value;

    if (!apiKey) {
        modelStatus.textContent = "Please enter an API Key first.";
        modelStatus.className = "help-text error";
        return;
    }

    modelStatus.textContent = "Fetching models...";
    modelStatus.className = "help-text";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || "Invalid API Key or network error.");
        }

        if (data.models && data.models.length > 0) {
            // Filter models that support generateContent
            const supportedModels = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));

            modelSelect.innerHTML = "";
            supportedModels.forEach(m => {
                const modelName = m.name.replace("models/", "");
                const option = document.createElement("option");
                option.value = modelName;
                option.textContent = modelName + (m.displayName ? ` (${m.displayName})` : "");
                modelSelect.appendChild(option);
            });

            // Restore previously selected model if it still exists
            if (Array.from(modelSelect.options).some(opt => opt.value === currentModel)) {
                modelSelect.value = currentModel;
            } else if (supportedModels.length > 0) {
                modelSelect.value = supportedModels[0].name.replace("models/", ""); // fallback
            }

            modelStatus.textContent = `Found ${supportedModels.length} models.`;
            setTimeout(() => modelStatus.textContent = "", 3000);
        } else {
            throw new Error("No models found.");
        }
    } catch (error) {
        modelStatus.textContent = "Error: " + error.message;
        modelStatus.className = "help-text error";
    }
}

// Save options to browser.storage
function saveOptions(e) {
    e.preventDefault();
    browser.storage.sync.set({
        apiKey: document.querySelector("#apiKey").value,
        model: document.querySelector("#model").value,
        defaultLanguage: document.querySelector("#defaultLanguage").value
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
        document.querySelector("#defaultLanguage").value = result.defaultLanguage || "";

        // Populate standard options initially so it's not empty, we might overwrite later 
        const modelSelect = document.querySelector("#model");
        const initVal = result.model || "gemini-2.5-flash-lite";
        if (Array.from(modelSelect.options).every(opt => opt.value !== initVal)) {
            const tempOpt = document.createElement("option");
            tempOpt.value = initVal;
            tempOpt.textContent = initVal;
            modelSelect.appendChild(tempOpt);
        }
        modelSelect.value = initVal;

        if (result.apiKey) {
            fetchModels(result.apiKey);
        }
    }

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    let getting = browser.storage.sync.get(["apiKey", "model", "defaultLanguage"]);
    getting.then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);

// Refresh models manually
document.querySelector("#refresh-models").addEventListener("click", () => {
    const apiKey = document.querySelector("#apiKey").value;
    fetchModels(apiKey);
});

// Auto-refresh when api key input loses focus (changed)
document.querySelector("#apiKey").addEventListener("change", (e) => {
    if (e.target.value) {
        fetchModels(e.target.value);
    }
});
