import fs from "fs";
import path from "path";
import { logSuccess } from "./backendGeneratorLogs";
import { ParsedModel } from "./excelParser";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const BASE_PATH = path.join(__dirname, "../../generated-backend/src/routes");

const generateRoutesFile = (model: ParsedModel) => {
  if (!fs.existsSync(BASE_PATH)) fs.mkdirSync(BASE_PATH, { recursive: true });

  const className = capitalize(model.tableName);
  const routeBase = `/api/${model.tableName.toLowerCase()}`;
  const hasFileField = model.fields.some((f) =>
    (f.ui || "").toLowerCase().includes("file")
  );

  const imports = [
    `import { Router } from 'express';`,
    `import { create${className}, get${className}s, get${className}ById, update${className}, delete${className} } from '../controllers/${className}.controller';`,
  ];

  if (hasFileField) {
    imports.push(
      `import { ${model.tableName}Upload } from '../controllers/${className}.controller';`
    );
  }

  const content = `
${imports.join("\n")}

const router = Router();

// Create
${
  hasFileField
    ? `router.post('${routeBase}', ${model.tableName}Upload.single('file'), create${className});`
    : `router.post('${routeBase}', create${className});`
}

// Get all
router.get('${routeBase}', get${className}s);

// Get by ID
router.get('${routeBase}/:id', get${className}ById);

// Update
${
  hasFileField
    ? `router.put('${routeBase}/:id', ${model.tableName}Upload.single('file'), update${className});`
    : `router.put('${routeBase}/:id', update${className});`
}

// Delete
router.delete('${routeBase}/:id', delete${className});

export default router;
`;

  const filePath = path.join(BASE_PATH, `${className}.routes.ts`);
  fs.writeFileSync(filePath, content.trim());
  logSuccess(`✅ Routes generated: ${filePath}`);
};

export const generateRoutesFromExcel = (_: string, models: ParsedModel[]) => {
  models.forEach((model) => generateRoutesFile(model));
};
