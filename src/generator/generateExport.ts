import fs from "fs";
import path from "path";

export const generateUniversalExport = async (models: any[]) => {
    const controllersDir = path.join(__dirname,
        "../../generated-backend/src/controllers");
    const routesDir = path.join(__dirname,
        "../../generated-backend/src/routes");
    const utilsDir = path.join(__dirname,
        "../../generated-backend/src/utils");

    // Ensure dirs exist
    [controllersDir, routesDir, utilsDir].forEach((dir) => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // --- Create exportUtils.ts ---
    const exportUtilsPath = path.join(utilsDir, "exportUtils.ts");
    const utilsContent = `
    import fs from "fs";
    import path from "path";

    const schemaPath = path.join(__dirname, "../../schema.json");
    const schema = fs.existsSync(schemaPath)
      ? JSON.parse(fs.readFileSync(schemaPath, "utf-8"))
      : [];

    export const getExportableFields = (tableName: string): string[] => {
      if (!schema || schema.length === 0) {
        console.warn("⚠️ schema.json is empty or missing");
        return [];
      }

      // make lookup case-insensitive
      const model = schema.find(
        (m: any) => m.tableName?.toLowerCase() === tableName.toLowerCase()
      );

      if (!model) {
        console.warn(\`⚠️ No model found in schema.json for \${tableName}\`);
        return [];
      }

      const exportable = model.fields
        .filter((f: any) => f.exportable === true)
        .map((f: any) => f.name);

      if (exportable.length > 0) {
        return exportable;
      }

      // fallback to all fields if none marked
      return model.fields.map((f: any) => f.name);
    };
  `;
    fs.writeFileSync(exportUtilsPath, utilsContent.trim());

    // --- Create export.controller.ts ---
    const controllerPath = path.join(controllersDir, "export.controller.ts");

    const modelImports = models
        .map(
            (m) =>
                `import { ${m.tableName} } from "../models/${m.tableName}.model";`
        )
        .join("\n");

    const modelRegistry = models
        .map((m) => `  ${m.tableName},`)
        .join("\n");

    const controllerContent = `
    import { Request, Response } from "express";
    import { Parser } from "json2csv";
    import { getExportableFields } from "../utils/exportUtils";

    ${modelImports}

    const models: Record<string, any> = {
    ${modelRegistry}
    };

    export const exportData = async (req: Request, res: Response) => {
      try {
        const { model, selectedIds, filters } = req.body;

        if (!model || !models[model]) {
          return res.status(400).json({ message: "Invalid or missing model name" });
        }

        const Model = models[model];

        let query: any = {};
        if (selectedIds && selectedIds.length > 0) {
          query._id = { $in: selectedIds };
        } else if (filters && Object.keys(filters).length > 0) {
          query = { ...filters };
        }

        const data = await Model.find(query).lean();
        if (!data || data.length === 0) {
          return res.status(404).json({ message: "No data found to export" });
        }

        // 🔎 DEBUG: log exportable fields
        const exportableFields = getExportableFields(model);
        console.log("📌 Exporting fields:", exportableFields);

        if (!exportableFields || exportableFields.length === 0) {
          return res.status(400).json({ message: \`No exportable fields for \${model}\` });
        }

        const filteredData = data.map((row: any) =>
          Object.fromEntries(
            Object.entries(row).filter(([key]) => exportableFields.includes(key))
          )
        );

        const parser = new Parser({ fields: exportableFields });
        const csv = parser.parse(filteredData);

        res.header("Content-Type", "text/csv");
        res.attachment(\`\${model.toLowerCase()}_export.csv\`);
        return res.send(csv);
      } catch (err) {
        console.error("Export error:", err);
        res.status(500).json({ message: "Error exporting data", error: err });
      }
    };
  `;
    fs.writeFileSync(controllerPath, controllerContent.trim());

    // --- Create export.routes.ts ---
    const routePath = path.join(routesDir, "export.routes.ts");
    const routeContent = `
    import { Router } from "express";
    import { exportData } from "../controllers/export.controller";

    const router = Router();

    // Universal Export Route
    router.post("/export", exportData);

    export default router;
  `;
    fs.writeFileSync(routePath, routeContent.trim());

    console.log("✅ Universal export controller, route, and utils generated successfully!");
};
