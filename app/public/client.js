// Load the list of font families from the server
async function loadFonts() {
    try {
        const response = await fetch('/fonts');
        const fonts = await response.json();

        const fontDropdown = document.getElementById("fontFamily");
        fontDropdown.innerHTML = ""; // Clear previous options

        fonts.forEach(font => {
            const option = document.createElement("option");
            option.value = font;
            option.textContent = font;
            fontDropdown.appendChild(option);
        });
    } catch (error) {
        console.error("Failed to load fonts:", error);
    }
}

async function loadFont(fontFamily) {
    try {
        // Create a @font-face rule dynamically
        const fontUrl = `/font?family=${encodeURIComponent(fontFamily)}`;
        const fontFace = new FontFace(fontFamily, `url(${fontUrl})`);

        await fontFace.load(); // Wait for the font to load
        document.fonts.add(fontFace); // Add it to the browser's font list

        // Apply the font to the preview text
        document.getElementById("previewText").style.fontFamily = fontFamily;
    } catch (error) {
        console.error("Failed to load font:", error);
    }
}

function syncSliderWithInput(sliderId, inputId) {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);

    slider.addEventListener("input", () => {
        input.value = slider.value;
    });

    input.addEventListener("input", () => {
        slider.value = input.value;
    });
}

function toggleButton(buttonId, inputId, activeValue, inactiveValue) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);

    button.addEventListener("click", () => {
        const isActive = input.value == activeValue;
        input.value = isActive ? inactiveValue : activeValue;
        button.classList.toggle("active", !isActive);
    });
}

// Load fonts when the page loads
window.addEventListener("DOMContentLoaded", () => {
	loadFonts();

	// Sync sliders and inputs
	syncSliderWithInput("fontSizeRange", "fontSize");
	syncSliderWithInput("outlineRange", "outline");
	syncSliderWithInput("shadowRange", "shadow");

	// Initialize toggle buttons
	toggleButton("boldButton", "bold", "-1", "0");
	toggleButton("italicButton", "italic", "1", "0");

    // Set default colors
    document.getElementById("fontColor").value = "#FFFFFF"; // White text
    document.getElementById("outlineColor").value = "#000000"; // Black outline
    document.getElementById("backgroundColor").value = "#555555"; // Gray drop shadow
    document.getElementById("secondaryColor").value = "#C6E62C"; // Yellow-green highlight

    // Set default numeric values
    document.getElementById("fontSize").value = 60;
    document.getElementById("fontSizeRange").value = 60;
    document.getElementById("outline").value = 2;
    document.getElementById("outlineRange").value = 2;
    document.getElementById("shadow").value = 0;
    document.getElementById("shadowRange").value = 0;
    document.getElementById("spacing").value = 0;
    document.getElementById("angle").value = 0;
    document.getElementById("marginL").value = 10;
    document.getElementById("marginR").value = 10;
    document.getElementById("marginV").value = 10;

	// Event listener for changing the font dynamically
	document.getElementById("fontFamily").addEventListener("change", (event) => {
		loadFont(event.target.value);
	});

	// Hook up the accordion toggle
	document.getElementById("advancedToggle").addEventListener("click", function () {
		const content = document.getElementById("advancedSettings");
		const isOpen = content.style.maxHeight;

		if (isOpen) {
			content.style.maxHeight = null; // Collapse
			this.textContent = "Advanced Settings ▼";
		} else {
			content.style.maxHeight = content.scrollHeight + "px"; // Expand
			this.textContent = "Advanced Settings ▲";
		}
	});

	document.getElementById("uploadForm").addEventListener("submit", async (e) => {
		e.preventDefault();
		const file = document.getElementById("srtFile").files[0];
		if (!file) return alert("Please select an SRT file!");

		const formData = new FormData();
		formData.append("srt", file);
		formData.append("fontFamily", document.getElementById("fontFamily").value || "Arial");
		formData.append("fontSize", document.getElementById("fontSize").value || 60);
		formData.append("fontColor", document.getElementById("fontColor").value || "#FFFFFF");
		formData.append("bold", document.getElementById("bold").value);
		formData.append("italic", document.getElementById("italic").value);
		formData.append("outline", document.getElementById("outline").value || 2);
		formData.append("outlineColor", document.getElementById("outlineColor").value || "#000000");
		formData.append("shadow", document.getElementById("shadow").value || 0);
		formData.append("spacing", document.getElementById("spacing").value || 0);
		formData.append("borderStyle", document.getElementById("borderStyle").value);
		formData.append("secondaryColor", document.getElementById("secondaryColor").value || "#FFFFFF");
		formData.append("backgroundColor", document.getElementById("backgroundColor").value || "#000000");
		formData.append("angle", document.getElementById("angle").value || 0);
		formData.append("position", document.getElementById("position").value || "bottom");
		formData.append("marginL", document.getElementById("marginL").value || 10);
		formData.append("marginR", document.getElementById("marginR").value || 10);
		formData.append("marginV", document.getElementById("marginV").value || 10);
	
		try {
			document.getElementById("status").textContent = "Processing...";

			const response = await fetch("/upload", {
				method: "POST",
				body: formData,
			});

			if (response.ok) {
				// Extract filename from response headers
				const disposition = response.headers.get("Content-Disposition");
				let filename = "subtitles.mp4"; // Default fallback filename
				if (disposition && disposition.includes("filename=")) {
					filename = disposition.split("filename=")[1].replace(/"/g, "");
				}

				document.getElementById("status").textContent = "Download starting...";
				const blob = await response.blob();
				const downloadUrl = URL.createObjectURL(blob);

				const link = document.createElement("a");
				link.href = downloadUrl;
				link.download = filename; // Set the correct filename dynamically
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(downloadUrl);
				document.getElementById("status").textContent = "Download complete!";
			} else {
				const errorText = await response.text();
				document.getElementById("status").textContent = "Error: " + errorText;
			}
		} catch (error) {
			document.getElementById("status").textContent = "Request failed: " + error.message;
		}
	});
});
