// --- 1. IMPORT SEMUA MODUL YANG DIBUTUHKAN ---
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --- 2. INISIALISASI APLIKASI DAN PENGATURAN DASAR ---
const app = express();
const PORT = 3000;

// --- 3. KONFIGURASI UNTUK UPLOAD FILE (MULTER) ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const safeFilename = file.originalname.replace(/\s/g, '_');
        cb(null, Date.now() + '-' + safeFilename);
    }
});
const upload = multer({ storage: storage });

// --- 4. MIDDLEWARE ---
const corsOptions = {
    origin: 'https://streamflow-frontend.vercel.app'
};
app.use(cors(corsOptions));
// Naikkan limit upload agar bisa menerima file besar
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb', extended: true }));

// --- 5. HAPUS PENYIMPANAN STATE DI MEMORI ---
// Variabel runningStreams tidak lagi dibutuhkan karena PM2 yang akan melacak proses.
// const runningStreams = {}; // <-- HAPUS ATAU BERI KOMENTAR PADA BARIS INI

// --- 6. DEFINISI API ENDPOINTS (YANG SUDAH DIMODIFIKASI) ---

app.post('/api/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }
    res.status(201).json({ serverPath: req.file.path });
});

// MODIFIKASI ENDPOINT START
app.post('/api/stream/start', (req, res) => {
    const { videoPath, youtubeKey, facebookKey } = req.body;
    if (!videoPath || !youtubeKey) {
        return res.status(400).json({ message: "Server video path and YouTube key are required." });
    }
    
    const streamId = `stream_${Date.now()}`;
    const streamName = `ffmpeg-${streamId}`; // Buat nama unik untuk proses PM2
    
    // Siapkan argumen untuk FFmpeg
    let ffmpegArgs = `-stream_loop -1 -re -i "${videoPath}" -c:v copy -c:a copy -f flv "rtmp://a.rtmp.youtube.com/live2/${youtubeKey}"`;
    if (facebookKey) {
        ffmpegArgs += ` -f flv "rtmp://live-api-s.facebook.com:443/rtmp/${facebookKey}"`;
    }
    
    // Perintahkan PM2 untuk menjalankan ffmpeg. Tanda '--' penting untuk memisahkan argumen PM2 dan argumen FFmpeg
    const command = `pm2 start ffmpeg --name "${streamName}" -- ${ffmpegArgs}`;

    console.log(`[${streamId}] Executing PM2 command: ${command}`);
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ message: "Failed to start stream via PM2." });
        }
        res.status(202).json({
            message: "Streaming process initiated via PM2!",
            streamId: streamId
        });
    });
});

// MODIFIKASI ENDPOINT STOP
app.post('/api/stream/stop/:streamId', (req, res) => {
    const { streamId } = req.params;
    const streamName = `ffmpeg-${streamId}`; // Bentuk kembali nama proses PM2

    // Perintahkan PM2 untuk menghentikan dan menghapus proses
    const command = `pm2 stop ${streamName} && pm2 delete ${streamName}`;

    console.log(`Executing PM2 stop/delete command for ${streamName}`);
    exec(command, (error, stdout, stderr) => {
        // Abaikan error "process not found", karena mungkin sudah berhenti.
        // Yang penting kita kirim pesan sukses ke frontend.
        console.log(`PM2 stop stdout: ${stdout}`);
        console.error(`PM2 stop stderr: ${stderr}`);
        res.json({ message: `Stream ${streamId} stopped.` });
    });
});

// MODIFIKASI ENDPOINT GET STREAMS
app.get('/api/streams', (req, res) => {
    // Gunakan 'pm2 jlist' untuk mendapatkan daftar proses dalam format JSON
    exec('pm2 jlist', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).json({ activeStreams: [] });
        }
        try {
            const processes = JSON.parse(stdout);
            // Saring hanya proses yang dimulai dengan 'ffmpeg-stream_'
            const ffmpegProcesses = processes
                .filter(p => p.name.startsWith('ffmpeg-stream_'))
                .map(p => p.name.replace('ffmpeg-', '')); // Ambil streamId aslinya
            res.json({ activeStreams: ffmpegProcesses });
        } catch (e) {
            console.error(`Error parsing PM2 jlist: ${e}`);
            res.status(500).json({ activeStreams: [] });
        }
    });
});

// --- 7. JALANKAN SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 StreamFlow Backend is live on http://localhost:${PORT}`);
    console.log(`🎥 Uploaded videos will be saved to: ${uploadsDir}`);
});