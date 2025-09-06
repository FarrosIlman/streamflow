import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // State untuk form input
  const [selectedFile, setSelectedFile] = useState(null);
  const [youtubeKey, setYoutubeKey] = useState('');
  const [facebookKey, setFacebookKey] = useState('');
  
  // State untuk dasbor dan notifikasi
  const [activeStreams, setActiveStreams] = useState([]);
  const [message, setMessage] = useState('Welcome! Select a file and enter a stream key to begin.');
  const [isLoading, setIsLoading] = useState(false);

  // --- FUNGSI UTAMA ---

  // Fungsi untuk mengambil daftar stream aktif dari backend
  const fetchActiveStreams = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/streams');
      setActiveStreams(response.data.activeStreams);
    } catch (error) {
      console.error("Failed to fetch active streams", error);
      // Jangan tampilkan error ini ke pengguna agar tidak mengganggu
    }
  };

  // Gunakan useEffect untuk mengambil data stream secara berkala (polling)
  useEffect(() => {
    fetchActiveStreams(); // Ambil data saat komponen pertama kali dimuat
    const interval = setInterval(fetchActiveStreams, 5000); // Ulangi setiap 5 detik
    return () => clearInterval(interval); // Bersihkan interval saat komponen tidak lagi ditampilkan
  }, []);

  // Handler saat pengguna memilih file
  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  // Handler saat tombol "Start Streaming" diklik
  const handleStartStream = async () => {
    if (!selectedFile || !youtubeKey) {
      setMessage('⚠️ Error: Please select a video file and provide a YouTube Key.');
      return;
    }
    
    setIsLoading(true);
    setMessage('Step 1/2: Uploading video file...');

    try {
      // LANGKAH 1: UPLOAD FILE KE SERVER
      const formData = new FormData();
      formData.append('video', selectedFile);

      const uploadResponse = await axios.post('http://localhost:3000/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      const serverVideoPath = uploadResponse.data.serverPath;
      setMessage(`Step 2/2: Starting stream for ${selectedFile.name}...`);

      // LANGKAH 2: MULAI STREAM DENGAN PATH DARI SERVER
      const streamResponse = await axios.post('http://localhost:3000/api/stream/start', {
        videoPath: serverVideoPath,
        youtubeKey: youtubeKey,
        facebookKey: facebookKey,
      });

      setMessage(`✅ Success! Stream started with ID: ${streamResponse.data.streamId}`);
      await fetchActiveStreams(); // Langsung update daftar stream

    } catch (error) {
      const errorMessage = error.response ? error.response.data.message : error.message;
      setMessage(`❌ Error: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler saat tombol "Stop" pada dasbor diklik
  const handleStopStream = async (streamId) => {
    setMessage(`Stopping stream ${streamId}...`);
    try {
      await axios.post(`http://localhost:3000/api/stream/stop/${streamId}`);
      setMessage(`✅ Stream ${streamId} stopped.`);
      fetchActiveStreams(); // Langsung update daftar stream
    } catch (error) {
      setMessage(`❌ Error stopping stream: ${error.message}`);
    }
  };

  // --- RENDER KOMPONEN ---

  return (
    <div className="container">
      
      {/* Bagian Form untuk Memulai Stream Baru */}
      <div className="form-section">
        <header>
          <h1>🔥 StreamFlow MVP 🔥</h1>
        </header>
        <main className="form-container">
          
          <label htmlFor="video-upload" className="file-label">
            {selectedFile ? `✔️ Selected: ${selectedFile.name}` : 'Click to Choose Video File'}
          </label>
          <input
            id="video-upload"
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <input
            type="password"
            placeholder="YouTube Stream Key (Required)"
            value={youtubeKey}
            onChange={(e) => setYoutubeKey(e.target.value)}
            className="input-field"
          />
          <input
            type="password"
            placeholder="Facebook Stream Key (Optional)"
            value={facebookKey}
            onChange={(e) => setFacebookKey(e.target.value)}
            className="input-field"
          />
          
          <button onClick={handleStartStream} disabled={isLoading} className="action-button">
            {isLoading ? 'Processing...' : 'Upload & Start Streaming'}
          </button>
        </main>
        {message && <p className="message">{message}</p>}
      </div>

      {/* Bagian Dasbor untuk Stream Aktif */}
      <div className="dashboard-section">
        <h2>📊 Active Streams Dashboard</h2>
        <div className="stream-list-container">
          {activeStreams.length > 0 ? (
            <ul className="stream-list">
              {activeStreams.map(streamId => (
                <li key={streamId} className="stream-item">
                  <span className="stream-id">{streamId}</span>
                  <button onClick={() => handleStopStream(streamId)} className="stop-button">Stop</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-streams-message">No active streams running.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;