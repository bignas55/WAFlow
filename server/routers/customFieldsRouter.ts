import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { customFieldDefinitions, customFieldValues } from "../../drizzle/schema.js";
import { eq, and, asc } from "drizzle-orm";

const FIELD_TYPES = ["text", "number", "select", "date", "textarea"] as const;

export const customFieldsRouter = router({

  // ── Field definitions (tenant configures their schema) ───────────────────────

  listDefinitions: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.tenantId, ctx.user!.userId), eq(customFieldDefinitions.isActive, 1)))
      .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.id));
  }),

  createDefinition: protectedProcedure
    .input(z.object({
      fieldKey:   z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Use only lowercase letters, numbers and underscores"),
      label:      z.string().min(1).max(255),
      fieldType:  z.enum(FIELD_TYPES).default("text"),
      options:    z.array(z.string()).optional(),
      isRequired: z.boolean().default(false),
      sortOrder:  z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.userId;
      await db.insert(customFieldDefinitions).values({
        tenantId,
        fieldKey:   input.fieldKey,
        label:      input.label,
        fieldType:  input.fieldType,
        options:    input.options ?? null,
        isRequired: input.isRequired ? 1 : 0,
        sortOrder:  input.sortOrder,
        isActive:   1,
      });
      return { ok: true };
    }),

  updateDefinition: protectedProcedure
    .input(z.object({
      id:         z.number().int(),
      label:      z.string().min(1).max(255).optional(),
      options:    z.array(z.string()).optional(),
      isRequired: z.boolean().optional(),
      sortOrder:  z.number().int().optional(),
      isActive:   z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await db.update(customFieldDefinitions)
        .set({
          ...(fields.label      !== undefined ? { label:      fields.label }                 : {}),
          ...(fields.options    !== undefined ? { options:    fields.options }               : {}),
          ...(fields.isRequired !== undefined ? { isRequired: fields.isRequired ? 1 : 0 }   : {}),
          ...(fields.sortOrder  !== undefined ? { sortOrder:  fields.sortOrder }             : {}),
          ...(fields.isActive   !== undefined ? { isActive:   fields.isActive   ? 1 : 0 }   : {}),
        })
        .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.tenantId, ctx.user!.userId)));
      return { ok: true };
    }),

  deleteDefinition: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Soft delete
      await db.update(customFieldDefinitions)
        .set({ isActive: 0 })
        .where(and(eq(customFieldDefinitions.id, input.id), eq(customFieldDefinitions.tenantId, ctx.user!.userId)));
      return { ok: true };
    }),

  // ── Field values (per customer) ──────────────────────────────────────────────

  getValues: protectedProcedure
    .input(z.object({ customerId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select().from(customFieldValues)
        .where(and(
          eq(customFieldValues.tenantId,   ctx.user!.userId),
          eq(customFieldValues.customerId, input.customerId),
        ));
      // Return as key→value map
      const map: Record<string, string> = {};
      rows.forEach(r => { if (r.fieldKey) map[r.fieldKey] = r.value ?? ""; });
      return map;
    }),

  setValues: protectedProcedure
    .input(z.object({
      customerId: z.number().int(),
      values:     z.record(z.string()),  // { fieldKey: value }
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.userId;
      for (const [fieldKey, value] of Object.entries(input.values)) {
        // Upsert: insert or update
        const existing = await db.select({ id: customFieldValues.id })
          .from(customFieldValues)
          .where(and(
            eq(customFieldValues.tenantId,   tenantId),
            eq(customFieldValues.customerId, input.customerId),
            eq(customFieldValues.fieldKey,   fieldKey),
          ))
          .limit(1);

        if (existing.length) {
          await db.update(customFieldValues)
            .set({ value, updatedAt: new Date() })
            .where(and(
              eq(customFieldValues.tenantId,   tenantId),
              eq(customFieldValues.customerId, input.customerId),
              eq(customFieldValues.fieldKey,   fieldKey),
            ));
        } else {
          await db.insert(customFieldValues).values({ tenantId, customerId: input.customerId, fieldKey, value });
        }
      }
      return { ok: true };
    }),
});
