import fs from "fs";
import path from "path";
import { logSuccess } from "./backendGeneratorLogs";
import { ParsedField, ParsedModel } from "./excelParser";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const parseValidationToZod = (field: ParsedField) => {
  let zodChain = "";

  // Base type
  switch (field.type) {
    case "string":
      zodChain = "z.string()";
      break;
    case "number":
      zodChain = "z.number()";
      break;
    case "boolean":
      zodChain = "z.boolean()";
      break;
    case "Date":
      zodChain = `z.string().transform(val => new Date(val))`;
      break;
    default:
      zodChain = "z.any()";
  }

  // Validation rules from Excel
  if (field.validation) {
    const rules = String(field.validation)
      .split("|")
      .map((r) => r.trim());

    rules.forEach((rule) => {
      if (rule === "required") {
        if (field.type === "string") {
          zodChain += `.min(1, { message: "${field.name} is required" })`;
        } else {
          zodChain += `.refine(val => val !== undefined && val !== null, { message: "${field.name} is required" })`;
        }
      }
      if (rule.startsWith("max:") && field.type === "string") {
        const val = parseInt(rule.split(":")[1], 10);
        zodChain += `.max(${val}, { message: "${field.name} must be at most ${val}" })`;
      }
      if (rule.startsWith("min:") && field.type === "string") {
        const val = parseInt(rule.split(":")[1], 10);
        zodChain += `.min(${val}, { message: "${field.name} must be at least ${val}" })`;
      }
      // mimes handled separately (multer), skip here
    });
  }

  return zodChain;
};

const generateControllerFile = (outputDir: string, model: ParsedModel) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const className = capitalize(model.tableName);
  const varName = className;
  const hasFileField = model.fields.some((f) =>
    (f.ui || "").toLowerCase().includes("file")
  );

  const imports = [
    `import { Request, Response } from 'express';`,
    `import { ${className} } from '../models/${className}.model';`,
    `import { ${className}Schema } from '../validations/${className}.validation';`,
  ];

  if (hasFileField) {
    imports.push(`import multer from 'multer';`);
    imports.push(`import path from 'path';`);
    imports.push(`import fs from 'fs';`);
  }

  let uploadCode = "";
  if (hasFileField) {
    uploadCode = `
const uploadDir = path.join(__dirname, '../../uploads/${className}');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

export const ${className}Upload = multer({ storage });
    `;
  }

  const stringFields = model.fields.filter((f) => f.type === "string");

  const content = `
${imports.join("\n")}
${uploadCode}

// Helper: get all schema unique fields
const getUniqueFields = () =>
  Object.keys(${varName}.schema.paths).filter(
    key => ${varName}.schema.paths[key].options?.unique
  );

// Create
export const create${className} = async (req: Request, res: Response) => {
  try {
    const parsed = ${className}Schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, errors: parsed.error.format() });
    }
    const payload = parsed.data;
    ${
      hasFileField
        ? `if (req.file) payload.filePath = '/uploads/${className}/' + req.file.filename;`
        : ""
    }

    // Unique check
    for (const field of getUniqueFields()) {
      if (payload[field]) {
        const value = String(payload[field]).trim().toLowerCase();
        const exists = await ${varName}.findOne({ [field]: { $regex: \`^\${value}$\`, $options: 'i' } });
        if (exists) {
          return res.status(400).json({ success: false, message: \`\${field} already exists\` });
        }
      }
    }

    const item = new ${varName}(payload);
    await item.save();
    res.status(201).json({ success: true, data: item });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Read (list with search, sort, pagination)
export const get${className}s = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, sortBy = '_id', order = 'asc', search } = req.query;
    const query: any = {};
    ${
      stringFields.length
        ? `if (search) {
      query.$or = [
        ${stringFields
          .map((f) => `{ ${f.name}: { $regex: search, $options: 'i' } }`)
          .join(",\n        ")}
      ];
    }`
        : ""
    }
    const docs = await ${varName}
      .find(query)
      .sort({ [sortBy as string]: order === 'desc' ? -1 : 1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    const total = await ${varName}.countDocuments(query);
    res.status(200).json({ success: true, data: docs, total });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Read (single)
export const get${className}ById = async (req: Request, res: Response) => {
  try {
    const doc = await ${varName}.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '${className} not found' });
    res.status(200).json({ success: true, data: doc });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update
export const update${className} = async (req: Request, res: Response) => {
  try {
    const parsed = ${className}Schema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, errors: parsed.error.format() });
    }
    const payload = parsed.data;

    ${
      hasFileField
        ? `
    if (req.file) {
      payload.filePath = '/uploads/${className}/' + req.file.filename;
      const oldDoc = await ${varName}.findById(req.params.id);
      if (oldDoc?.filePath) {
        const oldPath = path.join(__dirname, '../../', oldDoc.filePath);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }`
        : ""
    }

    const existingDoc = await ${varName}.findById(req.params.id);
    if (!existingDoc) {
      return res.status(404).json({ success: false, message: '${className} not found' });
    }

    const existingDocObj = existingDoc.toObject() as Record<string, any>;

    // Unique check for updated values
    for (const field of getUniqueFields()) {
      if (payload[field]) {
        const newValue = String(payload[field]).trim().toLowerCase();
        const oldValue = String(existingDocObj[field] ?? "").trim().toLowerCase();
        if (newValue !== oldValue) {
          const duplicate = await ${varName}.findOne({ [field]: { $regex: \`^\${newValue}$\`, $options: 'i' } });
          if (duplicate) {
            return res.status(400).json({ success: false, message: \`\${field} already exists\` });
          }
        }
      }
    }

    const updatedDoc = await ${varName}.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: updatedDoc });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Delete
export const delete${className} = async (req: Request, res: Response) => {
  try {
    const doc = await ${varName}.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '${className} not found' });
    ${
      hasFileField
        ? `
    if (doc.filePath) {
      const filePath = path.join(__dirname, '../../', doc.filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }`
        : ""
    }
    res.status(200).json({ success: true, message: '${className} deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
`;

  const filePath = path.join(outputDir, `${className}.controller.ts`);
  fs.writeFileSync(filePath, content.trim());
  logSuccess(`✅ Controller generated: ${filePath}`);
};

export const generateControllersFromExcel = (
  outputDir: string,
  models: ParsedModel[]
) => {
  if (!outputDir) {
    outputDir = path.join(__dirname, "../../generated-backend/src/controllers");
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  models.forEach((model) => generateControllerFile(outputDir, model));
};
