import fs from 'fs';
import path from 'path';

const BASE_DIR = path.join(__dirname, '../../generated-backend');
const SRC_DIR = path.join(BASE_DIR, 'src');

const folders = ['controllers', 'models', 'routes', 'middlewares', 'utils', 'config'];

const files = {
  'package.json': `{
  "name": "backend",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "start": "node dist/server.js",
    "dev": "ts-node-dev --respawn src/server.ts",
    "build": "tsc"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "bcryptjs": "^3.0.2",
    "cookie-parser": "^1.4.7",
    "crypto": "^1.0.1",
    "dotenv": "^17.2.1",
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.17.0",
    "nodemailer": "^7.0.5",
    "nodemon": "^3.1.10"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.9",
    "@types/express": "^5.0.3",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "^24.2.0",
    "@types/nodemailer": "^6.4.17",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.9.2"
  }
}
`,
  '.env': `PORT=5000
MONGO_URI=mongodb://localhost:27017/authSystem
JWT_SECRET=R@h6%4$uL90$
JWT_REFRESH=R$y%to09&*bGt
EMAIL=onoffcollection503@gmail.com
EMAIL_PASSWORD=lhyoezzwbjjevbbn`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES6",
    "module": "CommonJS",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "typeRoots": ["./node_modules/@types", "./src/types"]
  }
}`,
};

// server.ts content inside /src
const serverFile = {
  'server.ts': `// src/server.ts

import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

app.listen(process.env.PORT || 4000, () => {
  console.log(\`Server running on port \${process.env.PORT || 4000}\`);
});`,
};

export const createBackendStructure = () => {
  // Create base project folder
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR);
  }

  // Create src folder
  if (!fs.existsSync(SRC_DIR)) {
    fs.mkdirSync(SRC_DIR);
  }

  // Create subfolders inside src/
  folders.forEach(folder => {
    const folderPath = path.join(SRC_DIR, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
  });

  // Create root-level files
  Object.entries(files).forEach(([filename, content]) => {
    const filePath = path.join(BASE_DIR, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  });

  // Create server.ts in src/
  Object.entries(serverFile).forEach(([filename, content]) => {
    const filePath = path.join(SRC_DIR, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  });

  console.log("✅ Folder and file structure created successfully");
};
