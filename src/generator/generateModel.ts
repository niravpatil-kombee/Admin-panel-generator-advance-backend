import fs from 'fs';
import path from 'path';
import { ParsedModel, ParsedField } from './excelParser';
import mongoose, { Schema } from 'mongoose';

const typeMapTS: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  Date: 'Date',
  ObjectId: 'mongoose.Types.ObjectId',
};

const typeMapMongoose: Record<string, string> = {
  string: 'String',
  number: 'Number',
  boolean: 'Boolean',
  Date: 'Date',
  ObjectId: 'Schema.Types.ObjectId',
};

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

// Replace invalid characters in variable names with underscores
const sanitizeFieldName = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, '_');

const generateTSType = (field: ParsedField): string => {
  if (field.enumValues && field.enumValues.length) {
    return field.enumValues.map(v => `'${v}'`).join(' | ');
  }
  return typeMapTS[field.isForeign ? 'ObjectId' : field.type] || 'string';
};

const generateSchemaField = (field: ParsedField): string => {
  // Skip 'id' if you want MongoDB to handle _id automatically
  if (field.name.toLowerCase() === 'id') return '';

  const rules: string[] = [
    `type: ${field.isForeign ? 'Schema.Types.ObjectId' : typeMapMongoose[field.type]}`
  ];

  if (field.enumValues && field.enumValues.length) {
    rules.push(`enum: ${JSON.stringify(field.enumValues)}`);
    if (field.default !== undefined) {
      rules.push(`default: ${JSON.stringify(field.default)}`);
    }
  } else {
    if (field.required) rules.push('required: true');
    if (field.unique) rules.push('unique: true');
    if (field.default !== undefined) rules.push(`default: ${JSON.stringify(field.default)}`);
  }

  if (field.isForeign && field.foreignTable) {
    rules.push(`ref: '${capitalize(field.foreignTable)}'`);
  }

  return `  ${field.name}: { ${rules.join(', ')} },`;
};


const BASE_PATH = path.join(__dirname, '../../generated-backend/src/models');

const generateModelFile = (model: ParsedModel) => {
  if (!fs.existsSync(BASE_PATH)) fs.mkdirSync(BASE_PATH, { recursive: true });

  const className = capitalize(model.tableName);

  // Schema
  const schemaFields = model.fields.map(generateSchemaField).join('\n');

  // Interface
  const interfaceFields = model.fields
  .filter(f => f.name.toLowerCase() !== 'id') // Skip 'id'
  .map(f => `  ${f.name}${f.required ? '' : '?'}: ${generateTSType(f)};`)
  .join('\n');

  const content = `
import mongoose, { Schema, Document } from 'mongoose';

const ${className}Schema = new Schema({
${schemaFields}
}, { timestamps: true });

export interface I${className} extends Document {
${interfaceFields}
}

export const ${className} = mongoose.model<I${className}>('${className}', ${className}Schema);
`;

  const filePath = path.join(BASE_PATH, `${className}.model.ts`);
  fs.writeFileSync(filePath, content.trim());
  console.log(`✅ Model generated: ${filePath}`);
};

export const generateModelsFromExcel = (_: string, models: ParsedModel[]) => {
  models.forEach(model => generateModelFile(model));
};
