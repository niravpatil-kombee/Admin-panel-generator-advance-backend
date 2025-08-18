import fs from "fs";
import path from "path";
import { logSuccess } from "./backendGeneratorLogs";
import { ParsedField, ParsedModel } from "./excelParser";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
const sanitizeFieldName = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

const generateValidationObject = (fields: ParsedField[]) => {
  const obj: Record<string, string> = {};
  fields.forEach((field) => {
    if (field.name.toLowerCase() === "id") return;
    if (field.zodValidation) {
      obj[sanitizeFieldName(field.name)] = field.zodValidation;
    }
  });
  return obj;
};

export const generateValidationsFromExcel = (
  _: string,
  models: ParsedModel[]
) => {
  const validationsDir = path.join(
    __dirname,
    "../../generated-backend/src/validations"
  );
  if (!fs.existsSync(validationsDir))
    fs.mkdirSync(validationsDir, { recursive: true });

  let fileContent = `// AUTO-GENERATED FILE — DO NOT EDIT
// This file contains validation rules for all models

import { z } from 'zod';

`;

  models.forEach((model) => {
    const className = capitalize(model.tableName);
    const validationObject = generateValidationObject(model.fields);
    const entries = Object.entries(validationObject)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join(",\n");

    fileContent += `export const ${className}Validation = z.object({\n${entries}\n});\n\n`;
  });

  const filePath = path.join(validationsDir, "index.ts");
  fs.writeFileSync(filePath, fileContent.trim());
  logSuccess(`✅ Validations generated: ${filePath}`);
};
