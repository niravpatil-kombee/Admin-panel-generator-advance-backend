import xlsx from 'xlsx';

export interface ParsedField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'Date' | 'ObjectId';
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

const sqlToMongooseType = (type: string): ParsedField['type'] => {
  const lowered = type.toLowerCase();
  if (['int', 'integer', 'bigint', 'smallint', 'decimal', 'float', 'double'].includes(lowered)) return 'number';
  if (['varchar', 'text', 'string', 'char', 'longtext'].includes(lowered)) return 'string';
  if (['bool', 'boolean'].includes(lowered)) return 'boolean';
  if (['datetime', 'timestamp', 'date'].includes(lowered)) return 'Date';
  if (['objectid', 'foreignkey'].includes(lowered)) return 'ObjectId';
  console.warn(`Unknown SQL type: ${type}, defaulting to string`);
  return 'string';
};

export const parseExcelFile = (filePath: string): ParsedModel[] => {
  const workbook = xlsx.readFile(filePath);
  const models: ParsedModel[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

    if (rows.length < 2) {
      console.warn(`⚠ Sheet "${sheetName}" skipped: not enough rows`);
      return;
    }

    const headers = rows[1];
    const dataRows = rows.slice(2);

    const json = dataRows.map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((key, index) => {
        obj[key?.toString().trim().toLowerCase()] = row[index];
      });
      return obj;
    });

    const tableName = rows[0][1]?.toString().trim() || sheetName;

    const fields: ParsedField[] = json
      .filter((row) => !!row['column'])
      .map((row) => {
        const comments = row['comments']?.toString().trim() || undefined;
        let enumValues: string[] | undefined;
        let defaultValue = row['default_value'] || undefined;

        // Detect enum mapping inside comments like "Y => Active, N => Inactive"
        if (comments && comments.includes('=>')) {
          const mapping: Record<string, string> = {};
          comments.split(',').forEach((part: string) => {
            const [key, val] = part.split('=>').map(s => s.trim().replace(/^'|'$/g, ''));
            if (key && val) mapping[key] = val;
          });

          enumValues = Object.values(mapping);

          // Map default key to the label if found
          if (defaultValue && mapping[defaultValue] !== undefined) {
            defaultValue = mapping[defaultValue];
          }
        }

        // If enum is explicitly listed in Excel without mapping
        if (!enumValues && row['enum_values']) {
          enumValues = row['enum_values']
            .toString()
            .split(',')
            .map((v: string) => v.trim());
        }

        return {
          name: row['column'],
          type: sqlToMongooseType(row['type']),
          required: row['is_null']?.toString().toLowerCase() === 'n',
          unique: row['is_unique']?.toString().toLowerCase() === 'y',
          isIndex: row['is_index']?.toString().toLowerCase() === 'y',
          isPrimary: row['constraints']?.toString().toLowerCase().includes('pk'),
          isForeign: row['constraints']?.toString().toLowerCase().includes('fk'),
          foreignTable: row['foreign_table'] || undefined,
          foreignKey: row['foreign_key'] || undefined,
          isDependent: row['is_dependent']?.toString().toLowerCase() === 'y',
          dependentOn: row['dependent_on'] || undefined,
          isParent: row['is_parent']?.toString().toLowerCase() === 'y',
          childTable: row['child_table'] || undefined,
          default: defaultValue,
          ui: row['ui_component'] || undefined,
          validation: row['validation_rule'] || undefined,
          sortable: row['sortable']?.toString().toLowerCase() === 'y',
          faker: row['faker_value'] || undefined,
          comments,
          enumValues
        };
      });

    models.push({ tableName, fields });
  });

  return models;
};


