import { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Video, Mic, Sparkles, BrainCircuit } from 'lucide-react';
import './index.css';

function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (selectedFile) => {
    if (selectedFile.type.startsWith('video/')) {
      setFile(selectedFile);
      setError(null);
      processVideo(selectedFile);
    } else {
      setError("Please select a valid video file.");
    }
  };

  const processVideo = async (videoFile) => {
    setLoading(true);
    setResults(null);
    setError(null);

    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const response = await axios.post('http://localhost:3000/analyze-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResults(response.data);
    } catch (err) {
      console.error(err);
      const errMsg = err.response?.data?.error || "An error occurred during video processing. Please ensure the backend services are active.";
      if (err.response?.data?.trace) {
        setError(errMsg + "\n\nTRACE:\n" + err.response.data.trace);
      } else {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>EmoPro Engine</h1>
        <p>Multimodal AI Emotion Recognition via Video & Audio Fusion</p>
      </div>

      {!loading && !results && (
        <div
          className="glass-card upload-zone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <Upload className="upload-icon" />
          <div className="upload-text">Drag & drop a video clip, or click to browse</div>
          <div className="upload-subtext">Optimized for clips up to 30 seconds (Max 50MB)</div>
          <input
            type="file"
            accept="video/*"
            className="file-input"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files[0]) handleFileSelection(e.target.files[0]);
            }}
          />
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px' }}>
          {error}
          <button className="reset-btn" onClick={() => { setError(null); setFile(null); }} style={{ marginTop: '1rem' }}>Try Again</button>
        </div>
      )}

      {loading && (
        <div className="glass-card loading-state">
          <div className="spinner"></div>
          <div className="loading-text">Analyzing modalities & synthesizing reasoning...</div>
        </div>
      )}

      {results && (
        <div className="dashboard">
          <div className="results-grid">
            <div className="modality-card">
              <div className="modality-icon"><Video size={28} /></div>
              <div className="modality-data" style={{ width: '100%' }}>
                <h3>Visual Modality</h3>
                <div className="emotion">{results.video_emotion}</div>
                <div className="confidence-bar-container">
                  <div className="confidence-bar" style={{ width: `${Math.min(100, Math.max(0, results.video_confidence * 100))}%` }}></div>
                </div>
                <div className="confidence-text">{Math.round(results.video_confidence * 100)}% Confidence</div>
              </div>
            </div>

            <div className="modality-card">
              <div className="modality-icon"><Mic size={28} /></div>
              <div className="modality-data" style={{ width: '100%' }}>
                <h3>Audio Modality</h3>
                <div className="emotion">{results.audio_emotion}</div>
                <div className="confidence-bar-container">
                  <div className="confidence-bar" style={{ width: `${Math.min(100, Math.max(0, results.audio_confidence * 100))}%` }}></div>
                </div>
                <div className="confidence-text">{Math.round(results.audio_confidence * 100)}% Confidence</div>
              </div>
            </div>
          </div>

          {/* <div className="glass-card synthesis-card">
            <div className="synthesis-header">
              <BrainCircuit color="#c4b5fd" size={24}/>
              <h2>AI Synthesis</h2>
            </div>
            
            <div className="final-emotion">
              <Sparkles size={28} color="#fcd34d" />
              {results.final_emotion}
            </div>
            
            <div className="insight-text">
              {results.insight}
            </div>
          </div> */}

          <button className="reset-btn" onClick={() => { setResults(null); setFile(null); }}>
            Analyze Another Video
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
