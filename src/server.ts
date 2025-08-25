import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";


import { createBackendStructure } from "./generator/createBackend";
import { parseExcelFile } from "./generator/excelParser";
import { generateControllersFromExcel } from "./generator/generateController";
import { generateModelsFromExcel } from "./generator/generateModel"; // now also generates Zod validations
import { generateRoutesFromExcel } from "./generator/generateRoutes";
import { upload } from "./middleware/uploads";
import { generateUniversalExport } from "./generator/generateExport";
import { generateLogManagement } from "./generator/logManagment";


dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Utility: Load generated validations for quick inspection (optional)
const loadGeneratedValidations = () => {
  const validationsDir = path.join(
    __dirname,
    "../generated-backend/src/validations"
  );
  if (fs.existsSync(validationsDir)) {
    const files = fs.readdirSync(validationsDir);
    console.log(`📦 Generated validations:`, files);
  } else {
    console.warn("⚠️ No validations folder found yet.");
  }
};

app.post(
  "/generate-backend",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "No Excel schema file uploaded" });
      }

      // Step 1: Create base backend structure
      await createBackendStructure();

      // Step 2: Parse Excel schema
      const models = await parseExcelFile(req.file.path);

      // Step 3: Generate models (+ Zod validation files)
      await generateModelsFromExcel("", models);

      // Step 4: Generate controllers (will use validations dynamically if updated)
      await generateControllersFromExcel("", models);

      // Step 5: Generate routes
      await generateRoutesFromExcel("", models);

      // Step 6: Generate export feature
      await generateUniversalExport(models);

      // Step 7: Generate log files
      await generateLogManagement();

      // Step 6 (optional): Display generated validation files in console
      loadGeneratedValidations();

      res.status(200).json({
        message:
          "✅ Backend structure, models, validations, controllers, and routes created successfully!",
        models,
      });
    } catch (err) {
      console.error("❌ Error creating backend:", err);
      res
        .status(500)
        .json({ message: "Error creating backend structure", error: err });
    }
  }
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
