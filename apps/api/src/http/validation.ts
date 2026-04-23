import { z } from "zod";

const stripControlChars = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

export const text = (min = 1, max = 500) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .transform(stripControlChars);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform(stripControlChars)
    .optional();
