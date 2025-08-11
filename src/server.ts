import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';

import { createBackendStructure } from './generator/createBackend';
import { generateLoginSystem } from './generator/generateLoginSystem';
import { parseExcelFile } from './generator/excelParser';
import { upload } from './middleware/uploads';
import { generateModelsFromExcel } from './generator/generateModel';

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/generate-backend', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel schema file uploaded' });
    }

    // Step 1: Create base backend structure
    await createBackendStructure();

    // Step 2: Generate login system
    await generateLoginSystem();

    // Step 3: Parse Excel schema
    const models = await parseExcelFile(req.file.path);

    // Step 4: Output directory for models
    const outputDir = path.join(__dirname, '../generated-backend/src/models');

    // Step 5: Generate models
    await generateModelsFromExcel(outputDir,models);

    res.status(200).json({
      message: '✅ Backend structure, login system, and models created successfully!',
      models
    });
  } catch (err) {
    console.error('❌ Error creating backend:', err);
    res.status(500).json({ message: 'Error creating backend structure', error: err });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
