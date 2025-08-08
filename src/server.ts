    // src/server.ts

import express from 'express';
import { createBackendStructure } from './generator/createBackend';
import dotenv from 'dotenv';
import { generateLoginSystem } from './generator/generateLoginSystem';

dotenv.config();
const app = express();
app.use(express.json());

app.post('/generate-backend', async(req, res) => {
  try {
    await createBackendStructure();
    await generateLoginSystem();
    
    res.status(200).json({ message: 'Backend structure and login system generated successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error creating backend structure' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
