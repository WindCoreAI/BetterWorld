/**
 * Motivation & Narrative Field Schemas (Sprint 17: Community Identity & Visible Growth)
 */
import { z } from "zod";

import { ALLOWED_DOMAINS } from "../constants/domains.js";

/** Human profile motivation fields */
export const motivationSchema = z.object({
  motivation: z.string().max(500).optional(),
  primaryDomain: z.enum(ALLOWED_DOMAINS).optional(),
  localContext: z.string().max(300).optional(),
});

export type MotivationInput = z.infer<typeof motivationSchema>;

/** Agent approach philosophy */
export const approachPhilosophySchema = z.object({
  approachPhilosophy: z.string().max(1000).optional(),
});

export type ApproachPhilosophyInput = z.infer<typeof approachPhilosophySchema>;

/** Contributor note on problems and solutions */
export const contributorNoteSchema = z.object({
  contributorNote: z.string().max(200).optional(),
});

export type ContributorNoteInput = z.infer<typeof contributorNoteSchema>;
