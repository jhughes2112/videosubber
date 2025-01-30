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

function measureFontHeight(fontFamily, fontSize) {
    const canvas = document.getElementById("fontCanvas");
    const ctx = canvas.getContext("2d");

    ctx.font = `${fontSize}px '${fontFamily}'`;
    const text = "H";
    const metrics = ctx.measureText(text);
	const fontHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
	console.log(`Measured ${fontFamily} at size ${fontSize} to be ${fontHeight}`);

    return fontHeight;
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
	if (input.value == activeValue) {
		button.classList.add("active");
	}

    button.addEventListener("click", () => {
        const isActive = input.value == activeValue;
        input.value = isActive ? inactiveValue : activeValue;
        button.classList.toggle("active", !isActive);
		updatePreview();
    });
}

async function updatePreviewOp() {
    const text = encodeURIComponent("it's about learning to dance in the rain");
    const fontFamily = encodeURIComponent(document.getElementById("fontFamily").value);
    const fontSize = document.getElementById("fontSizeRange").value;
    const fontColor = document.getElementById("fontColor").value.replace("#", ""); // Remove #
    const outlineSize = document.getElementById("outlineRange").value;
    const outlineColor = document.getElementById("outlineColor").value.replace("#", ""); // Remove #
    const shadowSize = document.getElementById("shadowRange").value;
    const shadowColor = document.getElementById("backgroundColor").value.replace("#", ""); // Remove #
    const position = document.getElementById("position").value;
    const spacing = document.getElementById("spacingRange").value;
    const angle = document.getElementById("angleRange").value;
    const bold = document.getElementById("bold").value;
    const italic = document.getElementById("italic").value;
    const marginL = document.getElementById("marginL").value;
    const marginR = document.getElementById("marginR").value;
    const marginV = document.getElementById("marginV").value;
 	const borderStyle = document.getElementById("borderStyle").value;
	const secondaryColor = document.getElementById("secondaryColor").value.replace("#", ""); // Remove #
	const backgroundColor = document.getElementById("backgroundColor").value.replace("#", ""); // Remove #
    const highlight = document.getElementById("highlightEnabled").value;
    const fade = document.getElementById("fadeEnabled").value;

	// Determine the scaling required to make the fonts all appear the same size for the same numerical value on the slider (relative to Arial).
	const referenceFont = "Arial"; // Use Arial as the base size comparison
	const referenceHeight = measureFontHeight(referenceFont, fontSize);
	const currentHeight = measureFontHeight(fontFamily, fontSize);

	// Scale the font size based on its actual height
	const scaleFactor = referenceHeight / currentHeight;
	const normalizedFontSize = Math.round(fontSize * scaleFactor);

    // Send the request to the server
    const response = await fetch(`/preview?text=${text}&font=${fontFamily}&size=${normalizedFontSize}&color=${fontColor}&outline=${outlineSize}&outlineColor=${outlineColor}&shadow=${shadowSize}&shadowColor=${shadowColor}&position=${position}&spacing=${spacing}&angle=${angle}&bold=${bold}&italic=${italic}&marginL=${marginL}&marginR=${marginR}&marginV=${marginV}&secondaryColor=${secondaryColor}&backgroundColor=${backgroundColor}&borderStyle=${borderStyle}&fade=${fade}&highlight=${highlight}`);

    if (response.ok) {
        document.getElementById("subtitlePreview").src = URL.createObjectURL(await response.blob());
    }
}

// This gets called anytime a control is modified.
let previewTimer;
function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { updatePreviewOp();}, 150);
}

// After the page loads, do many things
window.addEventListener("DOMContentLoaded", () => {
	loadFonts();

	// Sync sliders and inputs
	syncSliderWithInput("fontSizeRange", "fontSize");
	syncSliderWithInput("outlineRange", "outline");
	syncSliderWithInput("shadowRange", "shadow");
	syncSliderWithInput("spacingRange", "spacing");
	syncSliderWithInput("angleRange", "angle");

	// Initialize toggle buttons
	toggleButton("boldButton", "bold", "-1", "0");
	toggleButton("italicButton", "italic", "1", "0");
	toggleButton("highlightButton", "highlightEnabled", "1", "0");
	toggleButton("fadeButton", "fadeEnabled", "100", "0");

    // Set default colors
    document.getElementById("fontColor").value = "#FFFFFF"; // White text
    document.getElementById("outlineColor").value = "#000000"; // Black outline
    document.getElementById("backgroundColor").value = "#555555"; // Gray drop shadow
    document.getElementById("secondaryColor").value = "#C6E62C"; // Yellow-green highlight

    // Set default numeric values
    document.getElementById("fontSize").value = 120;
    document.getElementById("fontSizeRange").value = 120;
    document.getElementById("outline").value = 6;
    document.getElementById("outlineRange").value = 6;
    document.getElementById("shadow").value = 0;
    document.getElementById("shadowRange").value = 0;
    document.getElementById("spacing").value = 0;
    document.getElementById("spacingRange").value = 0;
    document.getElementById("angle").value = 0;
    document.getElementById("angleRange").value = 0;
    document.getElementById("marginL").value = 0;
    document.getElementById("marginR").value = 0;
    document.getElementById("marginV").value = 0;

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

	// Attach event listeners for live updates
	document.querySelectorAll("input, select").forEach(el => {
		el.addEventListener("input", updatePreview);
	});

	// Initial preview update
	updatePreview();

	document.getElementById("uploadForm").addEventListener("submit", async (e) => {
		e.preventDefault();
		const file = document.getElementById("srtFile").files[0];
		if (!file) return alert("Please select an SRT file!");

		const formData = new FormData();
		formData.append("srt", file);
		formData.append("fontFamily", document.getElementById("fontFamily").value);
		formData.append("fontSize", document.getElementById("fontSize").value);
		formData.append("fontColor", document.getElementById("fontColor").value);
		formData.append("bold", document.getElementById("bold").value);
		formData.append("italic", document.getElementById("italic").value);
		formData.append("outline", document.getElementById("outline").value);
		formData.append("outlineColor", document.getElementById("outlineColor").value);
		formData.append("shadow", document.getElementById("shadow").value);
		formData.append("spacing", document.getElementById("spacing").value);
		formData.append("borderStyle", document.getElementById("borderStyle").value);
		formData.append("secondaryColor", document.getElementById("secondaryColor").value);
		formData.append("backgroundColor", document.getElementById("backgroundColor").value);
		formData.append("angle", document.getElementById("angle").value);
		formData.append("position", document.getElementById("position").value);
		formData.append("marginL", document.getElementById("marginL").value);
		formData.append("marginR", document.getElementById("marginR").value);
		formData.append("marginV", document.getElementById("marginV").value);
		formData.append("highlight", document.getElementById("highlightEnabled").value);
		formData.append("fade", document.getElementById("fadeEnabled").value);
	
		try {
			document.getElementById("status").textContent = "Processing...";

			const response = await fetch("/upload", {
				method: "POST",
				body: formData,
			});

			if (response.ok) {
				// Extract filename from response headers
				const disposition = response.headers.get("Content-Disposition");
				let filename = "subtitles.mov"; // Default fallback filename
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
