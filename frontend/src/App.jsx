import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const BACKEND_API_URL = 'https://product-scanner-e971.onrender.com/api/products/scan-backend';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [lastScannedCode, setLastScannedCode] = useState('None');
  const [productDetails, setProductDetails] = useState(null);
  const [systemMessage, setSystemMessage] = useState('Initializing webcam...');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);

  const isScanningActive = useRef(false);

  useEffect(() => {
    activateDeviceCamera();
    return () => {
      isScanningActive.current = false;
    };
  }, []);

  const activateDeviceCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user', 
          width: { ideal: 1920, min: 1280 }, 
          height: { ideal: 1080, min: 720 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          isScanningActive.current = true;
        };
      }
      setSystemMessage('Camera ready. Line up numbers in the green lane and click Freeze & Scan.');
    } catch (err) {
      setSystemMessage(`Hardware access exception: ${err.message}`);
    }
  };

  // Triggers manually when the user hits the button
  const handleFreezeAndScan = async () => {
    if (!isScanningActive.current || !videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Viewport crop boundaries targeting the number baseline
    const boxWidth = videoWidth * 0.50;  
    const boxHeight = videoHeight * 0.20; 
    const boxX = (videoWidth - boxWidth) / 2;
    const boxY = (videoHeight - boxHeight) / 2;

    const textCropWidth = boxWidth;
    const textCropHeight = boxHeight * 0.35;      
    const textCropX = boxX;
    const textCropY = boxY + (boxHeight * 0.65);  

    canvas.width = textCropWidth;
    canvas.height = textCropHeight;

    // Lock the frame instantly onto our canvas context
    context.drawImage(video, textCropX, textCropY, textCropWidth, textCropHeight, 0, 0, textCropWidth, textCropHeight);

    // Freeze the video track display visually
    video.pause();
    setIsFrozen(true);
    setIsProcessing(true);
    setSystemMessage('Frame frozen! Processing stabilized image buffer at backend...');

    canvas.toBlob(async (imageBlob) => {
      if (!imageBlob) {
        resetScannerState();
        return;
      }

      const networkFormData = new FormData();
      networkFormData.append('image', imageBlob, 'frame_capture.png');

      try {
        const networkResponse = await axios.post(BACKEND_API_URL, networkFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const foundProduct = networkResponse.data.product;
        setLastScannedCode(foundProduct.barcodeDigits);
        setProductDetails(foundProduct);
        setSystemMessage(`✅ Success! Saved 13-Digit Code: ${foundProduct.barcodeDigits}`);
        setIsProcessing(false);

      } catch (err) {
        if (err.response && err.response.status === 422) {
          const { detectedLength, detectedString } = err.response.data;
          setLastScannedCode(detectedString || 'Invalid Capture');
          setSystemMessage(`❌ Scan Failed: Found ${detectedLength}/13 digits. Unfreeze and try again.`);
        } else {
          setSystemMessage('Network or processing error occurred.');
        }
        setIsProcessing(false);
      }
    }, 'image/png');
  };

  const resetScannerState = () => {
    if (videoRef.current) {
      videoRef.current.play(); // Unfreeze live stream
    }
    setIsFrozen(false);
    setProductDetails(null);
    setLastScannedCode('None');
    setSystemMessage('Stream active. Align text numbers with the green lane.');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '550px', margin: '0 auto', textAlign: 'center' }}>
      <header style={{ marginBottom: '20px' }}>
        <h2>📡 Stabilized Core Barcode Scanner</h2>
        <div style={{ 
          background: '#1e293b', color: '#38bdf8', padding: '12px', 
          borderLeft: `4px solid ${isFrozen ? '#eab308' : '#4ade80'}`, borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'monospace', textAlign: 'left'
        }}>
          LOG_STREAM // {systemMessage}
        </div>
      </header>

      <main>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', background: '#000', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            style={{ width: '100%', display: 'block', filter: 'contrast(1.3) brightness(1.05)', opacity: isFrozen ? 0.7 : 1 }} 
          />
          
          {/* Main Overlay Window Guide */}
          <div style={{
            position: 'absolute', top: '40%', left: '25%', width: '50%', height: '20%',
            border: `2px solid ${isFrozen ? '#eab308' : 'rgba(244, 63, 94, 0.3)'}`, borderRadius: '6px', boxSizing: 'border-box', pointerEvents: 'none',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)' 
          }}>
            <div style={{
              position: 'absolute', bottom: '0', left: '0', width: '100%', height: '35%',
              background: isFrozen ? 'rgba(234, 179, 8, 0.2)' : 'rgba(74, 222, 128, 0.25)', 
              borderTop: `2px dashed ${isFrozen ? '#eab308' : '#4ade80'}`,
              color: isFrozen ? '#eab308' : '#4ade80', fontSize: '0.65rem', fontWeight: 'bold', letterSpacing: '1px',
              textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {isFrozen ? 'FRAME FROZEN' : 'ALIGN 13 NUMBERS HERE'}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ marginTop: '20px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
          {!isFrozen ? (
            <button 
              onClick={handleFreezeAndScan}
              disabled={isProcessing}
              style={{ padding: '12px 24px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 6px rgba(34, 197, 94, 0.2)' }}
            >
              📸 Freeze & Scan Code
            </button>
          ) : (
            <button 
              onClick={resetScannerState}
              disabled={isProcessing}
              style={{ padding: '12px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)' }}
            >
              🔄 Unfreeze Camera
            </button>
          )}
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        <section style={{ marginTop: '20px', padding: '20px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>Scanner Output Dashboard:</h4>
          <p style={{ margin: '5px 0' }}><strong>Latest Code Result:</strong> <span style={{ fontFamily: 'monospace', fontSize: '1.4rem', color: lastScannedCode.length === 13 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>{lastScannedCode}</span></p>
          
          {productDetails && lastScannedCode.length === 13 && (
            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #e2e8f0', fontSize: '0.95rem' }}>
              <p style={{ margin: '4px 0' }}><strong>MongoDB Track Item:</strong> {productDetails.name}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
