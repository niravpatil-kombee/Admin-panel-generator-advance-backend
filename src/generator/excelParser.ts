import ExcelJS from "exceljs";
import { logError, logTest } from "./backendGeneratorLogs";

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
}

export interface ParsedModel {
  tableName: string;
  fields: ParsedField[];
}

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

/**
 * Memory-efficient streaming Excel parser
 */
export const parseExcelFile = async (
  filePath: string
): Promise<ParsedModel[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const models: ParsedModel[] = [];

  for (const sheet of workbook.worksheets) {
    // Read first two rows for meta info
    const tableName =
      sheet.getRow(1).getCell(2).value?.toString().trim() || sheet.name;

    // Headers are in row 2
    const headers: string[] = [];
    sheet.getRow(2).eachCell((cell, colNumber) => {
      headers[colNumber - 1] =
        cell.value?.toString().trim().toLowerCase() || "";
    });

    const fields: ParsedField[] = [];

    // Start from row 3 for data
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // skip first two rows

      const rowData: Record<string, any> = {};
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber - 1]] = cell.value;
      });

      if (!rowData["column"]) return; // skip empty rows

      const comments = rowData["comments"]?.toString().trim() || undefined;
      let enumValues: string[] | undefined;
      let defaultValue = rowData["default_value"] || undefined;

      // Detect enum mapping in comments
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

      // Enum explicitly listed
      if (!enumValues && rowData["enum_values"]) {
        enumValues = rowData["enum_values"]
          .toString()
          .split(",")
          .map((v: string) => v.trim());
      }

      fields.push({
        name: rowData["column"],
        type: sqlToMongooseType(rowData["type"]),
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
        validation: rowData["validation_rule"] || undefined,
        sortable: rowData["sortable"]?.toString().toLowerCase() === "y",
        faker: rowData["faker_value"] || undefined,
        comments,
        enumValues,
      });
    });

    if (fields.length) {
      logTest(fields);
      models.push({ tableName, fields });
    }
  }

  return models;
};
