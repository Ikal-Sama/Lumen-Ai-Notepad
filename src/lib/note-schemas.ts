import { z } from "zod";

const noteFields = {
  title: z.string().max(200).optional(),
  content: z.string().max(500_000).optional(),
  contentCiphertext: z.string().max(2_000_000).optional().nullable(),
  contentIv: z.string().max(200).optional().nullable(),
  encryptionVersion: z.number().int().min(0).max(10).optional(),
};

function hasEncryptedPayload(d: {
  contentCiphertext?: string | null;
  contentIv?: string | null;
}) {
  return Boolean(d.contentCiphertext && d.contentIv);
}

export const createNoteSchema = z
  .object(noteFields)
  .refine(
    (d) =>
      (d.encryptionVersion ?? 0) > 0
        ? hasEncryptedPayload(d)
        : d.title !== undefined || d.content !== undefined,
    { message: "Invalid note payload." },
  );

export const updateNoteSchema = z
  .object(noteFields)
  .refine((d) => Object.values(d).some((value) => value !== undefined), {
    message: "Provide a title or content to update.",
  })
  .superRefine((d, ctx) => {
    if ((d.encryptionVersion ?? 0) > 0 && !hasEncryptedPayload(d)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Encrypted note updates must include both contentCiphertext and contentIv.",
      });
    }
  });
