import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

import multer from 'multer';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';



const app = express();
app.use(cors({ origin: 'https://product-scanner-3.onrender.com' , 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Allow cookies or auth headers if needed
}));
app.use(express.json());

// Set up volatile in-memory storage buffers via Multer
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 } // 4MB maximum safe size threshold
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://Tawanda:tawanda@cluster0.n3u8sve.mongodb.net/zcms?appName=Cluster0')
  .then(() => console.log('✅ Connected to MongoDB Backend Database'))
  .catch(err => console.error('❌ Mongoose Link Failure:', err));

const Product = mongoose.model('Product', new mongoose.Schema({
  barcodeDigits: { type: String, required: true, unique: true },
  name: { type: String, default: 'Uncataloged Product' },
  scannedAt: { type: Date, default: Date.now }
}));

// Initialize Persistent Backend OCR Worker
let backendOcrWorker = null;

async function launchBackendOcrWorker() {
  try {
    backendOcrWorker = await createWorker('eng');
    await backendOcrWorker.setParameters({
      tessedit_char_whitelist: '0123456789', // Force digit recognition only
      tessedit_pageseg_mode: '7',            // Page Seg Mode 7: Single text line logic
      load_system_dawg: '0',                 // Disable vocabulary lookup
      load_freq_dawg: '0'
    });
    console.log('🧠 Persistent Backend Tesseract Engine Configured & Loaded');
  } catch (err) {
    console.error('❌ Tesseract Core Boot Failure:', err);
  }
}
launchBackendOcrWorker();

// Core OCR Endpoint
app.post('/api/products/scan-backend', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing image payload file.' });
  if (!backendOcrWorker) return res.status(503).json({ error: 'OCR engine is offline.' });

  try {
    // Sharp enhancement pipeline
    const optimizedPixelBuffer = await sharp(req.file.buffer)
      .resize({ width: 1200, withoutEnlargement: false }) // Enlarge image for optimal character box reading
      .grayscale()                                        // Strip background color noise
      .linear(1.8, -0.1)                                  // Broaden black-to-white edge contrast
      .threshold(130)                                     // Crisp black characters on pure white
      .toBuffer();

    const { data: { text } } = await backendOcrWorker.recognize(optimizedPixelBuffer);
    const parsedDigits = text.replace(/\s+/g, ''); // Clear formatting whitespaces and line breaks

    // ────────────────────────────────────────────────────────────────
    // 🛑 STRICT 13-DIGIT CONSTRAINT VALIDATION BLOCK
    // ────────────────────────────────────────────────────────────────
    if (parsedDigits.length !== 13) {
      return res.status(422).json({ 
        error: 'Structural rejection. Barcode must be exactly 13 digits long.',
        detectedLength: parsedDigits.length,
        detectedString: parsedDigits 
      });
    }

    // Check database if it successfully clears the 13-digit gate
    let product = await Product.findOne({ barcodeDigits: parsedDigits });
    let isNewRecord = false;

    if (!product) {
      product = new Product({ barcodeDigits: parsedDigits, name: `EAN Product (#${parsedDigits.slice(-4)})` });
      await product.save();
      isNewRecord = true;
    }

    res.status(200).json({
      message: isNewRecord ? 'Fresh tracking profile appended.' : 'Item matched system catalog entries.',
      product,
      isNew: isNewRecord
    });

  } catch (error) {
    console.error('OCR Controller Exception:', error);
    res.status(500).json({ error: 'Internal server processing failure.', details: error.message });
  }
});

process.on('SIGTERM', async () => {
  if (backendOcrWorker) await backendOcrWorker.terminate();
  process.exit(0);
});

app.listen(PORT, () => console.log(`🚀 API executing 13-digit strict tracking routines on port: ${PORT}`));
