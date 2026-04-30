const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Set up storage for uploaded videos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ 
    storage, 
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const ML_SCRIPT_PATH = path.join(__dirname, '..', 'ml-service', 'process_video.py');
const PYTHON_EXEC = path.join(__dirname, '..', 'ml-service', 'venv', 'Scripts', 'python.exe');

async function askGemma(videoEmotion, vConf, audioEmotion, aConf) {
    const prompt = `You are an expert psychologist analyzing emotional data from a video. 
Visual analysis detected: ${videoEmotion} (confidence: ${vConf}). 
Audio analysis detected: ${audioEmotion} (confidence: ${aConf}).
Please determine the 'final_emotion' (such as happy, sad, mixed, frustrated, etc.) and write a one-sentence 'insight' explaining the relationship or difference between the modalities.
Respond ONLY with a valid JSON block containing 'final_emotion' and 'insight' keys.`;

    try {
        // Automatically discover what Model the user has so we never get a 404
        const tagsRes = await fetch('http://127.0.0.1:11434/api/tags');
        if (!tagsRes.ok) throw new Error("Could not reach Ollama");
        const tagsData = await tagsRes.json();
        if (!tagsData.models || tagsData.models.length === 0) {
            throw new Error("No models are downloaded in Ollama!");
        }
        const activeModel = tagsData.models[0].name;
        
        console.log("Using Ollama Model:", activeModel);
        console.log("Sending prompt to Ollama, please wait...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout

        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: activeModel,
                prompt: prompt,
                stream: false,
                format: 'json'
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Ollama raw response:", data.response);
        
        try {
            const jsonResponse = JSON.parse(data.response);
            return jsonResponse;
        } catch (parseError) {
            console.error("Failed to parse Ollama JSON:", parseError);
            return {
                final_emotion: "Unknown",
                insight: data.response
            };
        }
    } catch (err) {
        console.error("AI connection error:", err.message);
        return { 
            final_emotion: "Unknown", 
            insight: "Could not reach local AI model or request timed out."
        };
    }
}

app.post('/analyze-video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const videoPath = req.file.path;
    console.log(`Starting processing for ${videoPath}`);

    // Call Python script
    const pyProcess = spawn(PYTHON_EXEC, [ML_SCRIPT_PATH, videoPath]);
    
    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
        const out = data.toString();
        stderrData += out;
        process.stdout.write(out); // Print progress to the terminal live
    });

    pyProcess.on('close', async (code) => {
        console.log(`Python process closed with code ${code}`);
        
        // Clean up file
        fs.unlink(videoPath, err => {
            if (err) console.error("Error deleting file:", err);
        });

        if (code !== 0) {
            console.error("Python Error Data:", stderrData);
            return res.status(500).json({ error: 'Video processing failed', details: stderrData });
        }

        try {
            // Find the JSON substring in stdout in case of unexpected prints
            const match = stdoutData.match(/\{.*\}/s);
            if (!match) throw new Error("No JSON found in Python output");
            
            const mlResult = JSON.parse(match[0]);
            
            if (mlResult.error) {
                return res.status(500).json(mlResult);
            }

            // Now run Gemma inference
            const gemmaResult = await askGemma(
                mlResult.video_emotion, 
                mlResult.video_confidence, 
                mlResult.audio_emotion, 
                mlResult.audio_confidence
            );

            res.json({
                ...mlResult,
                ...gemmaResult
            });

        } catch (err) {
            console.error("Parse error:", err, "Stdout was:", stdoutData);
            res.status(500).json({ error: 'Failed to parse ML results' });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
});
