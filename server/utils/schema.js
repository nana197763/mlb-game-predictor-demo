import { z } from "zod";

export const PredictRequestSchema = z.object({
  teamA: z.string().min(1),
  teamB: z.string().min(1),
  date: z.string().min(1),
  // location 改成 optional（由後端自動判定，不需前端提供）
  location: z.string().optional(),
  league: z.enum(["MLB", "CPBL"]).default("MLB").optional()
});

export const PredictResponseSchema = z.object({
  teamA: z.string(),
  teamB: z.string(),
  location: z.string().nullable(),
  prediction: z.string(),
  winRate: z.object({
    teamA: z.number().min(0).max(100),
    teamB: z.number().min(0).max(100)
  }),
  summaryZh: z.string(),
  summaryEn: z.string()
});
