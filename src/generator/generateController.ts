import fs from "fs";
import path from "path";
import { logSuccess } from "./backendGeneratorLogs";
import { ParsedModel } from "./excelParser";

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const generateControllerFile = (outputDir: string, model: ParsedModel) => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const className = capitalize(model.tableName);
  const varName = className;
  const hasFileField = model.fields.some((f) =>
    (f.ui || "").toLowerCase().includes("file")
  );

  const imports = [`import { Request, Response } from 'express';`];
  if (hasFileField) {
    imports.push(`import multer from 'multer';`);
    imports.push(`import path from 'path';`);
    imports.push(`import fs from 'fs';`);
  }
  imports.push(`import { ${className} } from '../models/${className}.model';`);

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
    const payload = req.body;
    ${
      hasFileField
        ? `if (req.file) payload.filePath = '/uploads/${className}/' + req.file.filename;`
        : ""
    }

    // Unique field check (case-insensitive + trim)
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
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: \`\${field} already exists\`
      });
    }

    if (err.name === "ValidationError") {
      const errors: Record<string, string> = {};
      for (let field in err.errors) {
        errors[field] = err.errors[field].message;
      }
      return res.status(400).json({ success: false, errors });
    }

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
    const payload = req.body;

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

    // Unique field check (case-insensitive + trim, skip if unchanged)
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
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: \`\${field} already exists\`
      });
    }
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
