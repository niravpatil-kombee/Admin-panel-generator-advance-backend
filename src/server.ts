import cors from "cors";
import dotenv from "dotenv";
import express, { Request, Response } from "express";
import path from "path";

import { createBackendStructure } from "./generator/createBackend";
import { parseExcelFile } from "./generator/excelParser";
import { generateControllersFromExcel } from "./generator/generateController";
import { generateModelsFromExcel } from "./generator/generateModel";
import { generateRoutesFromExcel } from "./generator/generateRoutes";
import { upload } from "./middleware/uploads";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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

      // Step 2: Generate login system
      //await generateLoginSystem();

      // Step 3: Parse Excel schema
      const models = await parseExcelFile(req.file.path);

      // Step 4: Generate models
      await generateModelsFromExcel("", models);

      // Step 5: Generate controllers
      await generateControllersFromExcel("", models);

      // Step 6: Generate routes
      await generateRoutesFromExcel("", models);

      res.status(200).json({
        message:
          "✅ Backend structure, login system, models, controllers, and routes created successfully!",
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
