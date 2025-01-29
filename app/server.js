const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
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

function convertAlignment(position) {
    switch (position) {
        case 'top': return 8; // Top-center
        case 'center': return 5; // Middle-center
        case 'bottom': return 2; // Bottom-center
        default: return 2;
    }
}

function convertSrtToAssEvents(srtContent) {
    const lines = srtContent.split('\n');
    let events = '';
    let start, end, text = '';
    let lastEndTime = '00:00:00.000'; // Default in case no subtitles exist

    for (let i = 0; i < lines.length; i++) {
        if (/^\d+$/.test(lines[i])) { // Skip index lines
            if (text) { 
                events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text.trim()}\n`;
                text = ''; // Reset
            }
            continue;
        }

        if (/-->/.test(lines[i])) { // Timecode line
            [start, end] = lines[i].split(' --> ').map(convertTime);
            lastEndTime = end; // Update last subtitle end time
        } else if (lines[i].trim() === '') { // Empty line = end of subtitle block
            if (text) {
                events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text.trim()}\n`;
                text = ''; // Reset
            }
        } else { 
            text += (text ? '\\N' : '') + lines[i].trim();
        }
    }

    // Add last subtitle to events if missed
    if (text) {
        events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text.trim()}\n`;
    }

    return { events, lastEndTime };
}

function convertTime(time) {
    const [h, m, s] = time.split(':');
    const [seconds, ms] = s.split(',');
    return `${h}:${m}:${seconds}.${ms}`;
}

const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp/' });

// Tell fluent-ffmpeg where to find the FFmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic);

// Serve all files in the /public folder
app.use(express.static(path.join(__dirname, 'public')));

app.post('/upload', upload.single('srt'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');

    const {
        fontFamily, fontSize, fontColor,
        bold, italic, outline, outlineColor, shadow, spacing, borderStyle, 
		secondaryColor, backgroundColor, angle, position, marginL, marginR, marginV
    } = req.body;
	
    const srtPath = req.file.path;
	const assPath = path.join(path.dirname(srtPath), path.basename(srtPath, path.extname(srtPath)) + '.ass');

    // Generate output filename using the same random name as the uploaded file
	const clientDownloadName =  path.basename(req.file.originalname, path.extname(req.file.originalname)) + '-subs.mp4'; // Get user-provided filename without extension
    const outputPath = path.join('/tmp', path.basename(srtPath) + '.mp4');
    
    // Build ASS Style
const assStyle = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${convertColor(fontColor)},${convertColor(secondaryColor)},${convertColor(outlineColor)},${convertColor(backgroundColor)},${bold},${italic},0,0,100,100,${spacing},${angle},${borderStyle},${outline},${shadow},${convertAlignment(position)},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Convert SRT to ASS and get the last subtitle's end time
    console.log(`Converting ${req.file.originalname} from SRT ${srtPath} -> ASS ${assPath}`);
    const srtContent = fs.readFileSync(srtPath, 'utf-8');
    const { events, lastEndTime } = convertSrtToAssEvents(srtContent);
	fs.writeFileSync(assPath, assStyle + events, 'utf-8');

    // Calculate video duration (last subtitle end time + 5 seconds)
    const [h, m, s] = lastEndTime.split(':');
    const durationSeconds = (parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s)) + 5;
    const duration = new Date(durationSeconds * 1000).toISOString().substr(11, 8);

    console.log(`Generating subtitle video: ${clientDownloadName} with duration ${duration} -> ${outputPath}`);

    // Generate Video
	ffmpeg()
		.input('color=black:s=1920x1080:r=30')
		.inputFormat('lavfi')
		.input(assPath)
		.output(outputPath)
        .duration(duration) // Set dynamic duration
		.videoFilters(`subtitles=${assPath}`)
		.outputOptions([
			'-preset ultrafast',  // Use the least compression for max speed
			'-b:v 3M',            // Allow a higher bitrate for better performance
			'-pix_fmt yuv420p',    // This format supports subtitle rendering, some don't.
			'-movflags faststart' // Optimize MP4 playback without rewriting the whole file
		])
		.on('start', (command) => console.log(`FFmpeg command: ${command}`))
		.on('stderr', (stderr) => console.log(`FFmpeg log: ${stderr}`))
		.on('end', () => {
			console.log(`Finished. Automatically downloading now: ${clientDownloadName} from ${outputPath}`);
            // Set correct headers for direct file download
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${clientDownloadName}"`);
            
            // Stream the file directly in response
            const fileStream = fs.createReadStream(outputPath);
            fileStream.pipe(res);

            fileStream.on('close', () => {
                fs.unlinkSync(srtPath);
                fs.unlinkSync(assPath);
                fs.unlinkSync(outputPath);
            });
		})
		.on('error', (err) => res.status(500).send('Error processing video: ' + err.message))
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
