import fs from "fs";
import path from "path";
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

// Replace invalid characters in variable names with underscores
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

  // Safely handle validation value
  const validationStr =
    typeof field.validation === "string"
      ? field.validation
      : (field.validation as any)?.toString?.() || "";

  const isRequired =
    field.required ||
    validationStr.toLowerCase().split("|").includes("required");

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

const BASE_PATH = path.join(__dirname, "../../generated-backend/src/models");

const generateModelFile = (model: ParsedModel) => {
  if (!fs.existsSync(BASE_PATH)) fs.mkdirSync(BASE_PATH, { recursive: true });

  const className = capitalize(model.tableName);

  // Detect if the model has a file upload field
  const hasFileField = model.fields.some((f) =>
    (f.ui || "").toLowerCase().includes("file")
  );

  // Schema fields
  let schemaFields = model.fields
    .map(generateSchemaField)
    .filter(Boolean)
    .join(",\n");

  // Add filePath if needed
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
  console.log(`✅ Model generated: ${filePath}`);
};

export const generateModelsFromExcel = (_: string, models: ParsedModel[]) => {
  models.forEach((model) => generateModelFile(model));
};
