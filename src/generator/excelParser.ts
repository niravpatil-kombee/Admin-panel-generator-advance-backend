import ExcelJS from "exceljs";
import { logError, logTest } from "./backendGeneratorLogs";

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
}

export interface ParsedModel {
  tableName: string;
  fields: ParsedField[];
}

// ------------------ Helpers ------------------
const sqlToMongooseType = (type: string): ParsedField["type"] => {
  const lowered = type.toLowerCase();
  if (
    [
      "int",
      "integer",
      "bigint",
      "smallint",
      "decimal",
      "float",
      "double",
    ].includes(lowered)
  )
    return "number";
  if (["varchar", "text", "string", "char", "longtext"].includes(lowered))
    return "string";
  if (["bool", "boolean"].includes(lowered)) return "boolean";
  if (["datetime", "timestamp", "date"].includes(lowered)) return "Date";
  if (["objectid", "foreignkey"].includes(lowered)) return "ObjectId";
  logError(`Unknown SQL type: ${type}, defaulting to string`);
  return "string";
};

// Laravel-style rule string → Zod chain
const mapValidationRulesToZod = (fieldType: string, rules: unknown): string => {
  let zodChain = "";

  // Base type
  switch (fieldType) {
    case "number":
      zodChain = "z.number()";
      break;
    case "boolean":
      zodChain = "z.boolean()";
      break;
    case "Date":
      zodChain =
        "z.string().refine(val => !isNaN(Date.parse(val)), { message: 'Invalid date format' })";
      break;
    default:
      zodChain = "z.string()";
  }

  if (!rules) return zodChain;

  // Ensure we always have a string to split
  const rulesStr = typeof rules === "string" ? rules : String(rules || "");

  rulesStr.split("|").forEach((rule) => {
    rule = rule.trim();

    if (rule === "required") {
      zodChain += ".nonempty({ message: 'Required' })";
    } else if (rule.startsWith("max:")) {
      const num = rule.split(":")[1];
      zodChain += `.max(${num}, { message: 'Max length is ${num}' })`;
    } else if (rule.startsWith("min:")) {
      const num = rule.split(":")[1];
      zodChain += `.min(${num}, { message: 'Min length is ${num}' })`;
    } else if (rule.startsWith("date_format:")) {
      const format = rule.split(":")[1];
      zodChain += `.refine(val => /\\d{4}-\\d{2}-\\d{2}/.test(val), { message: 'Date must match format ${format}' })`;
    } else if (rule.startsWith("mimes:")) {
      const types = rule.split(":")[1].split(",");
      zodChain += `.refine(file => file && ${JSON.stringify(
        types
      )}.some(t => file.type.includes(t)), { message: 'Invalid file type' })`;
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

      // Enum mapping from comments
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

      // Enum from column
      if (!enumValues && rowData["enum_values"]) {
        enumValues = rowData["enum_values"]
          .toString()
          .split(",")
          .map((v: string) => v.trim());
      }

      const fieldType = sqlToMongooseType(rowData["type"]);

      // Always ensure validation rule is string
      const validationRule = rowData["validation_rule"]
        ? String(rowData["validation_rule"]).trim()
        : undefined;

      fields.push({
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
        zodValidation: mapValidationRulesToZod(fieldType, validationRule),
      });
    });

    if (fields.length) {
      logTest(fields);
      models.push({ tableName, fields });
    }
  }

  return models;
};
