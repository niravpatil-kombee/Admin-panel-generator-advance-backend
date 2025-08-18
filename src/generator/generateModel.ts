import fs from "fs";
import path from "path";
import { logSuccess } from "./backendGeneratorLogs";
import { ParsedField, ParsedModel } from "./excelParser";

const typeMapTS: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  Date: "Date",
  ObjectId: "mongoose.Types.ObjectId",
};

const typeMapMongoose: Record<string, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  Date: "Date",
  ObjectId: "Schema.Types.ObjectId",
};

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
const sanitizeFieldName = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

const generateTSType = (field: ParsedField): string => {
  if (field.enumValues && field.enumValues.length) {
    return field.enumValues.map((v) => `'${v}'`).join(" | ");
  }
  return typeMapTS[field.isForeign ? "ObjectId" : field.type] || "string";
};

const generateSchemaField = (field: ParsedField): string => {
  if (field.name.toLowerCase() === "id") return "";

  const fieldName = sanitizeFieldName(field.name);
  const isRequired =
    field.required ||
    (typeof field.validation === "string" &&
      field.validation.toLowerCase().split("|").includes("required"));

  const rules: string[] = [
    `type: ${
      field.isForeign ? "Schema.Types.ObjectId" : typeMapMongoose[field.type]
    }`,
  ];

  if (field.enumValues && field.enumValues.length) {
    rules.push(`enum: ${JSON.stringify(field.enumValues)}`);
    if (field.default !== undefined) {
      rules.push(`default: ${JSON.stringify(field.default)}`);
    }
  } else {
    if (isRequired) rules.push("required: true");
    if (field.unique) rules.push("unique: true");
    if (field.default !== undefined) {
      rules.push(`default: ${JSON.stringify(field.default)}`);
    }
  }

  if (field.isForeign && field.foreignTable) {
    rules.push(`ref: '${capitalize(field.foreignTable)}'`);
  }

  return `  ${fieldName}: { ${rules.join(", ")} }`;
};

// Build Zod validation schema from ParsedField data
const generateZodField = (field: ParsedField): string => {
  let zodType = "";

  // Base type
  switch (field.type) {
    case "string":
      zodType = "z.string()";
      break;
    case "number":
      zodType = "z.number()";
      break;
    case "boolean":
      zodType = "z.boolean()";
      break;
    case "Date":
      zodType = "z.date()";
      break;
    case "ObjectId":
      zodType = "z.string().regex(/^[0-9a-fA-F]{24}$/)";
      break;
    default:
      zodType = "z.string()";
  }

  // Enum
  if (field.enumValues && field.enumValues.length) {
    zodType = `z.enum([${field.enumValues.map((v) => `'${v}'`).join(", ")}])`;
  }

  // Required or optional
  if (
    !(
      field.required ||
      (typeof field.validation === "string" &&
        field.validation.toLowerCase().split("|").includes("required"))
    )
  ) {
    zodType += ".optional()";
  }

  return `  ${sanitizeFieldName(field.name)}: ${zodType}`;
};

const BASE_PATH = path.join(__dirname, "../../generated-backend/src/models");
const VALIDATION_PATH = path.join(
  __dirname,
  "../../generated-backend/src/validations"
);

const generateModelFile = (model: ParsedModel) => {
  if (!fs.existsSync(BASE_PATH)) fs.mkdirSync(BASE_PATH, { recursive: true });
  if (!fs.existsSync(VALIDATION_PATH))
    fs.mkdirSync(VALIDATION_PATH, { recursive: true });

  const className = capitalize(model.tableName);
  const hasFileField = model.fields.some((f) =>
    (f.ui || "").toLowerCase().includes("file")
  );

  // Schema fields
  let schemaFields = model.fields
    .map(generateSchemaField)
    .filter(Boolean)
    .join(",\n");

  if (hasFileField) {
    schemaFields += `,\n  filePath: { type: String }`;
  }

  // Interface fields
  let interfaceFields = model.fields
    .filter((f) => f.name.toLowerCase() !== "id")
    .map(
      (f) =>
        `  ${sanitizeFieldName(f.name)}${
          f.required ? "" : "?"
        }: ${generateTSType(f)};`
    )
    .join("\n");

  if (hasFileField) {
    interfaceFields += `\n  filePath?: string;`;
  }

  // Zod validation schema
  const zodSchemaContent = `
import { z } from "zod";

export const ${className}Schema = z.object({
${model.fields.map(generateZodField).join(",\n")}
});
`;

  fs.writeFileSync(
    path.join(VALIDATION_PATH, `${className}.validation.ts`),
    zodSchemaContent.trim()
  );

  // Model file content
  const content = `
import mongoose, { Schema, Document } from 'mongoose';

export interface I${className} extends Document {
${interfaceFields}
}

const ${className}Schema = new Schema<I${className}>({
${schemaFields}
}, { timestamps: true });

export const ${className} = mongoose.model<I${className}>('${className}', ${className}Schema);
`;

  const filePath = path.join(BASE_PATH, `${className}.model.ts`);
  fs.writeFileSync(filePath, content.trim());

  logSuccess(`✅ Model generated: ${filePath}`);
  logSuccess(
    `✅ Validation generated: ${path.join(
      VALIDATION_PATH,
      `${className}.validation.ts`
    )}`
  );
};

export const generateModelsFromExcel = (_: string, models: ParsedModel[]) => {
  models.forEach((model) => generateModelFile(model));
};
