import ExcelJS from "exceljs";
import { logError, logTest } from "./backendGeneratorLogs";
import fs from "fs";
import path from "path";

// ------------------ Interfaces ------------------
export interface ParsedField {
  name: string;
  type: "string" | "number" | "boolean" | "Date" | "ObjectId";
  required: boolean;
  unique: boolean;
  isIndex: boolean;
  isPrimary: boolean;
  isForeign: boolean;
  foreignTable?: string;
  foreignKey?: string;
  isDependent?: boolean;
  dependentOn?: string;
  isParent?: boolean;
  childTable?: string;
  default?: string | number | boolean;
  ui?: string;
  validation?: string;
  sortable?: boolean;
  faker?: string;
  comments?: string;
  enumValues?: string[];
  zodValidation?: string;
  exportable: boolean;
}

export interface ParsedModel {
  tableName: string;
  fields: ParsedField[];
}

// ------------------ Helpers ------------------
const sqlToMongooseType = (
  type: string,
  columnName: string
): ParsedField["type"] => {
  const lowered = type.toLowerCase();
  if (lowered === "int" || lowered === "integer") {
    if (columnName.toLowerCase().endsWith("_id")) {
      return "ObjectId";
    }
    return "number";
  }
  if (["varchar", "text", "string", "char", "longtext"].includes(lowered))
    return "string";
  if (["bool", "boolean"].includes(lowered)) return "boolean";
  if (["datetime", "timestamp", "date"].includes(lowered)) return "Date";
  if (["objectid", "foreignkey"].includes(lowered)) return "ObjectId";
  logError(`Unknown SQL type: ${type}, defaulting to string`);
  return "string";
};

// ------------------ Zod Rule Mapper ------------------
const mapValidationRulesToZod = (field: ParsedField): string => {
  let zodChain = "";

  if (Array.isArray(field.enumValues) && field.enumValues.length) {
    return `z.enum([${field.enumValues.map((v) => `'${v}'`).join(", ")}])`;
  }

  if (field.isForeign || field.type === "ObjectId") {
    zodChain = `z.string().regex(/^[0-9a-fA-F]{24}$/, { message: 'Invalid ObjectId' })`;
  } else {
    switch (field.type) {
      case "number":
        zodChain = "z.number()";
        break;
      case "boolean":
        zodChain = "z.boolean()";
        break;
      case "Date":
        zodChain = `z.preprocess(val => (typeof val === "string" ? new Date(val) : val), z.date())`;
        break;
      default:
        zodChain = "z.string()";
    }
  }

  const rulesStr =
    typeof field.validation === "string"
      ? field.validation
      : String(field.validation || "");
  rulesStr.split("|").forEach((rule) => {
    rule = rule.trim();
    if (rule === "required") {
      zodChain += ".nonempty({ message: 'Required' })";
    } else if (rule.startsWith("max:")) {
      const num = rule.split(":")[1];
      zodChain += `.max(${num}, { message: 'Max is ${num}' })`;
    } else if (rule.startsWith("min:")) {
      const num = rule.split(":")[1];
      zodChain += `.min(${num}, { message: 'Min is ${num}' })`;
    } else if (rule.startsWith("mimes:")) {
      const types = rule.split(":")[1].split(",");
      zodChain += `.refine(file => file && ${JSON.stringify(
        types
      )}.some(t => file.type.includes(t)), { message: 'Invalid file type' })`;
    } else if (rule.startsWith("date_format:")) {
      // already handled
    } else if (rule.startsWith("in:")) {
      const values = rule
        .split(":")[1]
        .split(",")
        .map((v) => `'${v.trim()}'`);
      zodChain = `z.enum([${values.join(", ")}])`;
    }
  });

  return zodChain;
};

// ------------------ Main Excel Parser ------------------
export const parseExcelFile = async (
  filePath: string
): Promise<ParsedModel[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const models: ParsedModel[] = [];

  for (const sheet of workbook.worksheets) {
    const tableName =
      sheet.getRow(1).getCell(2).value?.toString().trim() || sheet.name;

    const headers: string[] = [];
    sheet.getRow(2).eachCell((cell, colNumber) => {
      headers[colNumber - 1] =
        cell.value?.toString().trim().toLowerCase() || "";
    });

    const fields: ParsedField[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return;

      const rowData: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber - 1]] = cell.value;
      });

      if (!rowData["column"]) return;

      const comments = rowData["comments"]?.toString().trim() || undefined;
      let enumValues: string[] | undefined;
      let defaultValue = rowData["default_value"] || undefined;

      if (comments && comments.includes("=>")) {
        const mapping: Record<string, string> = {};
        comments.split(",").forEach((part: string) => {
          const [key, val] = part
            .split("=>")
            .map((s) => s.trim().replace(/^'|'$/g, ""));
          if (key && val) mapping[key] = val;
        });
        enumValues = Object.values(mapping);
        if (defaultValue && mapping[defaultValue] !== undefined) {
          defaultValue = mapping[defaultValue];
        }
      }

      if (!enumValues && rowData["enum_values"]) {
        enumValues = rowData["enum_values"]
          .toString()
          .split(",")
          .map((v: string) => v.trim());
      }

      const fieldType = sqlToMongooseType(rowData["type"], rowData["column"]);
      const validationRule = rowData["validation_rule"]
        ? String(rowData["validation_rule"]).trim()
        : undefined;

      const field: ParsedField = {
        name: rowData["column"],
        type: fieldType,
        required: rowData["is_null"]?.toString().toLowerCase() === "n",
        unique: rowData["is_unique"]?.toString().toLowerCase() === "y",
        isIndex: rowData["is_index"]?.toString().toLowerCase() === "y",
        isPrimary: rowData["constraints"]
          ?.toString()
          .toLowerCase()
          .includes("pk"),
        isForeign: rowData["constraints"]
          ?.toString()
          .toLowerCase()
          .includes("fk"),
        foreignTable: rowData["foreign_table"] || undefined,
        foreignKey: rowData["foreign_key"] || undefined,
        isDependent: rowData["is_dependent"]?.toString().toLowerCase() === "y",
        dependentOn: rowData["dependent_on"] || undefined,
        isParent: rowData["is_parent"]?.toString().toLowerCase() === "y",
        childTable: rowData["child_table"] || undefined,
        default: defaultValue,
        ui: rowData["ui_component"] || undefined,
        validation: validationRule,
        sortable: rowData["sortable"]?.toString().toLowerCase() === "y",
        faker: rowData["faker_value"] || undefined,
        comments,
        enumValues,
        zodValidation: "",
        exportable: rowData["exportable"]?.toString().toLowerCase() === "y", // <-- NEW
      };

      field.zodValidation = mapValidationRulesToZod(field);

      fields.push(field);
    });

    if (fields.length) {
      logTest(fields);
      models.push({ tableName, fields });
    }
  }

  const schemaPath = path.join(__dirname, "../../generated-backend/schema.json");
  if (!fs.existsSync(path.dirname(schemaPath))) {
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  }
  fs.writeFileSync(schemaPath, JSON.stringify(models, null, 2));

  return models;
};
