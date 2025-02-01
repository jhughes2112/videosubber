const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const tmp = require("tmp");
const { execSync } = require('child_process');

function convertColor(hex) {
    hex = hex.replace('#', ''); // Remove # if present
    if (hex.length === 3) { // Convert shorthand hex (e.g., #F00 to #FF0000)
        hex = hex.split('').map(c => c + c).join('');
    }

    const r = hex.substring(0, 2);
    const g = hex.substring(2, 4);
    const b = hex.substring(4, 6);

    return `&H00${b}${g}${r}`.toUpperCase(); // Convert to BGR format with full opacity
}

function parseSrt(srtContent) {
    const lines = srtContent.split("\n");
    const subtitles = [];
    let start, end = "00:00:00.000";
	let text = "";

    for (let i = 0; i < lines.length; i++) {
        if (/^\d+$/.test(lines[i])) { // Skip index lines
            if (text) { 
                subtitles.push({ start, end, text: text.trim() });
                text = ''; // Reset
            }
            continue;
        }

        if (/-->/.test(lines[i])) { // Timecode line
            [start, end] = lines[i].split(" --> ").map(convertTime);
        } else if (lines[i].trim() === "") { // Empty line = end of subtitle block
            if (text) {
                subtitles.push({ start, end, text: text.trim() });
                text = ''; // Reset
            }
        } else {
            text += (text ? "\\N" : "") + lines[i].trim();
        }
    }

    // Add last subtitle if missed
    if (text) {
        subtitles.push({ start, end, text: text.trim() });
    }

    return subtitles;
}

function convertTime(time) {
    let [h, m, s] = time.split(':');
    let [sec, ms] = s.split(/[,.]/); // Handles both comma and period as separators

    if (!ms) ms = '000'; // Ensure milliseconds exist
    ms = ms.padEnd(3, '0').slice(0, 3); // Normalize to exactly 3 digits

    return `${parseInt(h)}:${m}:${sec}.${ms}`;
}

function timeToMilliseconds(time) {
    const [h, m, s] = time.split(":");
    const [seconds, ms] = s.split(".");
    return (parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(seconds)) * 1000 + parseInt(ms);
}

function millisecondsToCentiseconds(ms) {
    const h = Math.floor(ms / 3600000); // Hours
    const m = Math.floor((ms % 3600000) / 60000); // Minutes
    const s = Math.floor((ms % 60000) / 1000); // Seconds
    const cs = Math.round((ms % 1000) / 10); // Convert milliseconds to centiseconds

    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function convertToAss(subtitles, fadeMS, highlight, normalColor, highlightColor) {
    let assEvents = "";
	let prevEndTimeMS = 0;  // this is the UNADJUSTED milliseconds.  We only use this to know if we should be fading in subtitles or not.
	let layerIndex = 0;

    subtitles.forEach(({ start, end, text }, index) => {
        const startTimeMS = timeToMilliseconds(start);
        const endTimeMS = timeToMilliseconds(end);

        // Calculate fade-in time based on previous line
        const actualFadeIn = Math.round(Math.min(fadeMS, startTimeMS - prevEndTimeMS));

        // Calculate fade-out time based on next line
        const nextStartTimeMS = index < subtitles.length - 1 ? timeToMilliseconds(subtitles[index + 1].start) : Infinity;
        const actualFadeOut = Math.round(Math.min(fadeMS, nextStartTimeMS - timeToMilliseconds(end)));

        // Construct the fade tag dynamically
        const fadeTag = `{\\fad(${actualFadeIn},${actualFadeOut})}`;

        if (highlight === "1") {
			const words = text.split(/\s+/);
			if (words.length === 0) return;

			const totalDuration = endTimeMS - startTimeMS;
			const highlightDuration = totalDuration / words.length; // Time per word

			let formattedText = words.map((word, wordIndex) => {
				const wordStart = Math.max(1, Math.round(wordIndex * highlightDuration)); // Ensure at least 1ms delay
				const wordEnd = Math.round(wordStart + highlightDuration);

				return `{\\r}{\\1c${convertColor(normalColor)}}{\\t(${wordStart},${wordStart},\\1c${convertColor(highlightColor)})}` + 
					   `{\\t(${wordEnd},${wordEnd},\\1c${convertColor(normalColor)})}` + 
					   word;
			}).join(" ");

			assEvents += `Dialogue: 0,${millisecondsToCentiseconds(startTimeMS)},${millisecondsToCentiseconds(endTimeMS)},Default,,0,0,0,,${fadeTag}${formattedText}\n`;
        } else {
            assEvents += `Dialogue: 0,${millisecondsToCentiseconds(startTimeMS)},${millisecondsToCentiseconds(endTimeMS)},Default,,0,0,0,,${fadeTag}${text}\n`;
        }
		prevEndTimeMS = endTimeMS;
    });

    return assEvents;
}

const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp/' });

// Tell fluent-ffmpeg where to find the FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// Serve all files in the /public folder
app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload', upload.fields([{ name: 'video' }, { name: 'subtitles' }]), (req, res) => {
    const videoPath = req.files['video'][0].path;
    const srtPath = req.files['subtitles'][0].path;

	if (!req.files['video'] || !req.files['subtitles']) {
		return res.status(400).send('Both video and subtitle files are required.');
	}

    const {
        fontFamily, fontSize, fontColor,
        bold, italic, outline, outlineColor, shadow, spacing, borderStyle, 
		secondaryColor, backgroundColor, angle, position, marginL, marginR, marginV,
		fade, highlight
    } = req.body;
	
	const assPath = path.join(path.dirname(srtPath), path.basename(srtPath, path.extname(srtPath)) + '.ass');

    // Generate output filename using the same random name as the uploaded file
	const originalExt = path.extname(req.files['video'][0].originalname);
	const clientDownloadName = path.basename(req.files['video'][0].originalname, originalExt) + '-subs' + originalExt;  // inject -subs into the filename
    const outputPath = path.join('/tmp', path.basename(srtPath) + originalExt);  // retain the original file extension, so we don't change the video format
    
    // Build ASS Style
const assStyle = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${convertColor(fontColor)},${convertColor(secondaryColor)},${convertColor(outlineColor)},${convertColor(backgroundColor)},${bold},${italic},0,0,100,100,${spacing},${angle},${borderStyle},${outline},${shadow},${position},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Convert SRT to ASS and get the last subtitle's end time
    console.log(`Converting ${clientDownloadName} from SRT ${srtPath} -> ASS ${assPath}`);
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
	const parsedEvents = parseSrt(srtContent);
	const assEvents = convertToAss(parsedEvents, fade, highlight, fontColor, secondaryColor);
	const lastEndTime = parsedEvents.length > 0 ? parsedEvents[parsedEvents.length - 1].end : "00:00:00.00";
	fs.writeFileSync(assPath, assStyle + assEvents, 'utf-8');

    console.log(`Generating subtitle video: ${clientDownloadName} -> ${outputPath}`);

    // Generate Video
	ffmpeg()
		.input(videoPath)
		.output(outputPath)
		.videoFilters(`ass=${assPath}`)
		.outputOptions([
			'-c:a copy'  // Keep original audio
		])
		.on('start', (command) => console.log(`FFmpeg command: ${command}`))
		.on('stderr', (stderr) => console.log(`FFmpeg log: ${stderr}`))
		.on('end', () => {
			console.log(`Finished. Automatically downloading now: ${clientDownloadName} from ${outputPath}`);
            // Set correct headers for direct file download
            res.setHeader('Content-Type', `video/${originalExt}`);
            res.setHeader('Content-Disposition', `attachment; filename="${clientDownloadName}"`);
            
            // Stream the file directly in response
            const fileStream = fs.createReadStream(outputPath);
            fileStream.pipe(res);

            fileStream.on('close', () => {
                fs.unlinkSync(videoPath);
                fs.unlinkSync(srtPath);
                fs.unlinkSync(assPath);
                fs.unlinkSync(outputPath);
            });
		})
        .on("error", (err) => { 
				console.log("Error generating preview: " + err.message);
				res.status(500).send("Error generating preview: " + err.message); 
			})
		.run();
});

// Live preview of what the settings do to subtitles.
app.get("/preview", async (req, res) => {
    const { 
		text, font, size, color, secondaryColor, outline, outlineColor, backgroundColor, 
		shadow, shadowColor, position, borderStyle, spacing, angle, bold, italic, 
		marginL, marginR, marginV, fade, highlight
		} = req.query;

	// Fetch list of background images
	const BACKGROUND_DIR = path.join(__dirname, "images"); // Directory of images
	const images = fs.readdirSync(BACKGROUND_DIR).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
	if (images.length === 0) {
		console.log("No background images found in /app/images, cannot do live previews.");
		return res.status(500).send("No background images found.");
	}

	// Select background based on current second
	const selectedBackground = images[new Date().getSeconds() % images.length];
	const backgroundImage = path.join(BACKGROUND_DIR, selectedBackground);

	// Generate unique temporary filenames
	const assPath = tmp.tmpNameSync({ postfix: ".ass" });
	const outputPath = tmp.tmpNameSync({ postfix: ".png" });

    // Convert text formatting
    const fontWeight = bold === "-1" ? 700 : 400;
    const fontStyle = italic === "1" ? 1 : 0;
	let subtitleText = decodeURIComponent(text);
	if (highlight === "1")  // show an example of a highlighted word
	{
		let words = subtitleText.split(/\s+/); // Split by whitespace
		let middleIndex = Math.floor(words.length / 2); // Find the middle word index

		if (words.length > 0) {
			words[middleIndex] = `{\\c${convertColor(secondaryColor)}}${words[middleIndex]}{\\c${convertColor(color)}}`;  // highlight one word in, then turn font color back to normal
		}

		subtitleText = words.join(" "); // Reconstruct sentence		
	}

    // Generate ASS subtitle file
    const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${decodeURIComponent(font)},${size},${convertColor(color)},${convertColor(secondaryColor)},${convertColor(outlineColor)},${convertColor(backgroundColor)},${fontWeight},${fontStyle},0,0,100,100,${spacing},${angle},${borderStyle},${outline},${shadow},${position},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,${subtitleText}`;

    fs.writeFileSync(assPath, assContent);

    // Run FFmpeg to generate preview using the background image
    ffmpeg()
        .input(backgroundImage) // Use image instead of black frame
		.output(outputPath)
		.videoFilters(`ass=${assPath}`)
        .frames(1)
		.on('start', (command) => console.log(`FFmpeg command: ${command}`))
		.on('stderr', (stderr) => console.log(`FFmpeg log: ${stderr}`))
        .on("end", () => {
			console.log(`Sending back preview image.`);
            res.sendFile(outputPath, () => {
                fs.unlinkSync(assPath);
                fs.unlinkSync(outputPath);
            });
        })
        .on("error", (err) => { 
				console.log("Error generating preview: " + err.message);
				res.status(500).send("Error generating preview: " + err.message); 
			})
        .run();
});

// Fetch all installed font families from Fontconfig
app.get('/fonts', (req, res) => {
    try {
		const fontList = execSync("fc-list --format '%{fullname}\n' | sort | uniq")
			.toString()
			.trim()
			.split('\n')
			.map(name => name.split(',')[0].trim()) // Take only the first name before the comma
			.filter(name => name.length > 0); // Remove empty lines

        res.json(fontList);
    } catch (err) {
        console.error("Error retrieving fonts from Fontconfig:", err);
        res.status(500).json({ error: "Failed to retrieve fonts" });
    }
});

// Use a font file in the browser by its family name.  This way the client can visualize whatever fonts are offered by the server.
app.get('/font', (req, res) => {
    const fontFamily = req.query.family;
    if (!fontFamily) return res.status(400).send("Font family is required");

    try {
		console.log(`Font requested: ${fontFamily}`);

        // Get the actual font file path using fc-list
        const fontInfo = execSync(`fc-list --format "%{fullname},%{file}\n" | grep -i "${fontFamily}," | head -n 1`)
            .toString()
            .trim();

		const fontPath = fontInfo.split(',').pop().trim();  // take whatever is after the last comma.  Some font fullnames have many commas in them
        if (!fs.existsSync(fontPath)) {
            return res.status(404).send("Font not found");
        }

        // Determine MIME type based on file extension
        const ext = path.extname(fontPath).toLowerCase();
        let mimeType = "application/octet-stream"; // Default fallback
        if (ext === ".ttf") mimeType = "font/ttf";
        if (ext === ".otf") mimeType = "font/otf";

        res.setHeader("Content-Type", mimeType); // Set correct MIME type
        res.sendFile(fontPath);

    } catch (error) {
        console.error("Error retrieving font:", error);
        res.status(404).send("Font not found");
    }
});

app.listen(8080, () => console.log('Server running on port 8080'));
