import fs from "fs-extra";
import path from "path";

export const generateLoginSystem = async () => {
  const BASE_PATH = path.join(__dirname, "../../generated-backend/src");

  const folders = ["config", "controllers", "models", "routes", "utils"];

  try {
    // Create required directories
    for (const folder of folders) {
      await fs.ensureDir(path.join(BASE_PATH, folder));
    }

    // 1. config/db.ts
    await fs.writeFile(
      path.join(BASE_PATH, "config", "db.ts"),
      `
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error", err);
    process.exit(1);
  }
};

export default connectDB;
`
    );

    // 2. controllers/auth.controller.ts
    await fs.writeFile(
      path.join(BASE_PATH, "controllers", "auth.controller.ts"),
      `
import { Request, Response } from "express";
import User from "../models/user.model";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sendEmail from "../utils/sendEmail";
import crypto from "crypto"

export const signup = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) return res.status(400).json({ message: "User already exists" });

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashed, isVerified: true });
  await user.save();

  res.status(201).json({ message: "User registered" });
};

export const loginStep1 = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !user.isVerified) return res.status(401).json({ message: "Unauthorized" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: "Invalid credentials" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + 5 * 60 * 1000);
  await user.save();

  await sendEmail(user.email, "Your OTP", \`Your OTP is: \${otp}\`);
  res.status(200).json({ message: "OTP sent" });
};

export const loginStep2 = async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });
  if (!user || user.otp !== otp || user.otpExpires! < new Date()) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET!, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH!, { expiresIn: "7d" });

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ message: "Login successful" });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.resetPasswordToken = resetTokenHash;
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  await user.save();

  const resetUrl = \`http://localhost:5173/reset-password?token=\${resetToken}\`;
  await sendEmail(email, 'Reset Password', \`Reset your password here: \${resetUrl}\`);

  res.status(200).json({ message: 'Password reset link sent' });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: tokenHash,
    resetPasswordExpires: { $gt: new Date() },
  });

  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();
  res.status(200).json({ message: 'Password reset successful' });
};
`
    );

    // 3. models/user.model.ts
    await fs.writeFile(
      path.join(BASE_PATH, "models", "user.model.ts"),
      `
import { Schema, model, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  isVerified: boolean;
  otp?: string;
  otpExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otp: String,
  otpExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});

export default model<IUser>("User", userSchema);

`
    );

    // 4. routes/auth.routes.ts
    await fs.writeFile(
      path.join(BASE_PATH, "routes", "auth.routes.ts"),
      `
import { Router } from "express";
import {signup, loginStep1, loginStep2, forgotPassword, resetPassword } from "../controllers/auth.controller";

const router = Router();

router.post("/signup", signup);
router.post("/login", loginStep1);
router.post("/verify-otp", loginStep2);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;

`
    );

    // 5. utils/sendEmail.ts
    await fs.writeFile(
      path.join(BASE_PATH, "utils", "sendEmail.ts"),
      `
import nodemailer from "nodemailer";
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL!,
    pass: process.env.EMAIL_PASSWORD!,
  },
});

const sendEmail = async (to: string, subject: string, text: string) => {
  await transporter.sendMail({
    from: \`"Auth System" <\${process.env.EMAIL}>\`,
    to,
    subject,
    text,
  });
};

export default sendEmail;
`
    );

    console.log("✅ Login system files generated successfully.");
  } catch (error) {
    console.error("❌ Error generating login system:", error);
    throw error;
  }
};
