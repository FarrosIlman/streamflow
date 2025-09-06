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
// Tentukan lokasi folder untuk menyimpan file yang di-upload
const uploadsDir = path.join(__dirname, 'uploads');

// Buat folder 'uploads' jika belum ada
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Atur bagaimana file akan disimpan
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir); // Simpan file di dalam folder 'uploads'
    },
    filename: (req, file, cb) => {
        // Buat nama file yang unik untuk menghindari konflik nama yang sama
        const safeFilename = file.originalname.replace(/\s/g, '_');
        cb(null, Date.now() + '-' + safeFilename);
    }
});
const upload = multer({ storage: storage });

// --- 4. MIDDLEWARE ---
// Mengizinkan request dari frontend (yang berjalan di port berbeda)
app.use(cors());
// Memungkinkan server untuk membaca data JSON dari body request
app.use(express.json());

// --- 5. PENYIMPANAN STATE APLIKASI ---
// Objek untuk melacak semua proses FFmpeg yang sedang berjalan.
// Key: streamId, Value: proses child_process
const runningStreams = {};

// --- 6. DEFINISI API ENDPOINTS ---

/**
 * @route   POST /api/upload
 * @desc    Menerima upload satu file video dari frontend
 * @access  Public
 */
app.post('/api/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }
    // Jika berhasil, kirim kembali path absolut dari file yang tersimpan di server
    res.status(201).json({ serverPath: req.file.path });
});

/**
 * @route   POST /api/stream/start
 * @desc    Memulai proses streaming FFmpeg
 * @access  Public
 */
app.post('/api/stream/start', (req, res) => {
    const { videoPath, youtubeKey, facebookKey } = req.body;

    if (!videoPath || !youtubeKey) {
        return res.status(400).json({ message: "Server video path and YouTube key are required." });
    }

    const streamId = `stream_${Date.now()}`;

    // Perintah FFmpeg dengan opsi looping (-stream_loop -1)
    let command = `ffmpeg -stream_loop -1 -re -i "${videoPath}" -c:v copy -c:a copy -f flv "rtmp://a.rtmp.youtube.com/live2/${youtubeKey}"`;

    // Tambahkan tujuan Facebook jika stream key-nya ada
    if (facebookKey) {
        command += ` -f flv "rtmp://live-api-s.facebook.com:443/rtmp/${facebookKey}"`;
    }

    console.log(`[${streamId}] Executing FFmpeg command:`);
    console.log(command);

    // Jalankan perintah FFmpeg sebagai proses turunan
    const ffmpegProcess = exec(command);
    runningStreams[streamId] = ffmpegProcess;

    // Monitor output error dari FFmpeg untuk debugging
    ffmpegProcess.stderr.on('data', (data) => {
        console.error(`[${streamId}] FFMPEG STDERR: ${data}`);
    });

    // Hapus proses dari daftar saat streaming selesai atau gagal
    ffmpegProcess.on('close', (code) => {
        console.log(`[${streamId}] FFMPEG process exited with code ${code}`);
        delete runningStreams[streamId];
    });

    res.status(202).json({
        message: "Streaming process started successfully!",
        streamId: streamId
    });
});

/**
 * @route   POST /api/stream/stop/:streamId
 * @desc    Menghentikan proses streaming FFmpeg berdasarkan ID
 * @access  Public
 */
app.post('/api/stream/stop/:streamId', (req, res) => {
    const { streamId } = req.params;
    const process = runningStreams[streamId];

    if (process) {
        process.kill('SIGKILL'); // Hentikan proses secara paksa
        // Proses penghapusan dari `runningStreams` akan ditangani oleh event 'close'
        console.log(`[${streamId}] Stop request received. Killing process.`);
        res.json({ message: `Stream ${streamId} stopped successfully.` });
    } else {
        res.status(404).json({ message: "Stream not found or already stopped." });
    }
});

/**
 * @route   GET /api/streams
 * @desc    Mendapatkan daftar semua stream ID yang sedang aktif
 * @access  Public
 */
app.get('/api/streams', (req, res) => {
    res.json({ activeStreams: Object.keys(runningStreams) });
});

// --- 7. JALANKAN SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 StreamFlow Backend is live on http://localhost:${PORT}`);
    console.log(`🎥 Uploaded videos will be saved to: ${uploadsDir}`);
});