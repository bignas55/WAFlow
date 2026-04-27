import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { customers, conversations, appointments, surveys } from "../../drizzle/schema.js";
import { eq, desc, like, and, or, sql, inArray } from "drizzle-orm";
import { escapeLike } from "../utils.js";
import { logAction } from "../services/auditService.js";

export const crmRouter = router({
  customers: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
      search: z.string().optional(),
      sortBy: z.enum(["name", "lastContact", "totalMessages", "satisfaction"]).default("lastContact"),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [eq(customers.tenantId, tenantId)];
      if (input.search) conditions.push(
        or(like(customers.name, `%${escapeLike(input.search)}%`), like(customers.phoneNumber, `%${escapeLike(input.search)}%`))
      );
      const where = and(...conditions);
      const [rows, [{ count }]] = await Promise.all([
        db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(input.limit).offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(customers).where(where),
      ]);

      // Batch-load NPS survey scores for the returned customers
      const phoneList = rows.map(c => c.phoneNumber);
      const surveyScores = phoneList.length
        ? await db.select({ phoneNumber: surveys.phoneNumber, score: surveys.score, status: surveys.status })
            .from(surveys)
            .where(and(inArray(surveys.phoneNumber, phoneList), eq(surveys.status, "responded")))
        : [];
      const scoreByPhone: Record<string, number | null> = {};
      for (const phone of phoneList) {
        const responded = surveyScores.filter(s => s.phoneNumber === phone && s.score !== null);
        if (responded.length) {
          scoreByPhone[phone] = Math.round(responded.reduce((s, r) => s + (r.score ?? 0), 0) / responded.length * 10) / 10;
        } else {
          scoreByPhone[phone] = null;
        }
      }

      return {
        customers: rows.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phoneNumber,
          email: c.email,
          tags: c.tags || [],
          totalConversations: c.totalAppointments,
          satisfactionScore: scoreByPhone[c.phoneNumber] ?? null,
          lastContact: c.updatedAt,
        })),
        total: Number(count),
      };
    }),

  customerDetail: protectedProcedure
    .input(z.object({ customerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const [customer] = await db.select().from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)))
        .limit(1);
      if (!customer) return null;
      const convRows = await db.select().from(conversations)
        .where(and(eq(conversations.phoneNumber, customer.phoneNumber), eq(conversations.tenantId, tenantId)))
        .orderBy(desc(conversations.createdAt))
        .limit(20);
      return {
        ...customer,
        phone: customer.phoneNumber,
        tags: customer.tags || [],
        totalConversations: convRows.length,
        totalMessages: convRows.length * 2,
        avgSatisfaction: null,
        lastContact: convRows[0]?.createdAt || customer.updatedAt,
        notes: customer.notes || "",
        dateOfBirth: customer.dateOfBirth ?? null,
        conversations: convRows.map((c) => ({
          id: c.id,
          lastMessage: c.message,
          status: c.isEscalated ? "escalated" : "active",
          isEscalated: c.isEscalated,
          createdAt: c.createdAt,
        })),
      };
    }),

  addTag: protectedProcedure
    .input(z.object({ customerId: z.number(), tag: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const [customer] = await db.select({ tags: customers.tags }).from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId))).limit(1);
      if (!customer) throw new Error("Not found");
      const existing = (customer.tags as string[]) || [];
      if (!existing.includes(input.tag)) {
        await db.update(customers).set({ tags: [...existing, input.tag], updatedAt: new Date() })
          .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)));
      }
      return { success: true };
    }),

  updateNotes: protectedProcedure
    .input(z.object({ customerId: z.number(), notes: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      await db.update(customers).set({ notes: input.notes, updatedAt: new Date() })
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)));
      return { success: true };
    }),

  updateDob: protectedProcedure
    .input(z.object({ customerId: z.number(), dateOfBirth: z.string().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
      await db.update(customers).set({ dateOfBirth: dob, updatedAt: new Date() })
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, tenantId)));
      return { success: true };
    }),

  // ── CSV IMPORT ───────────────────────────────────────────────────────────
  importCustomers: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        name: z.string().optional(),
        phone: z.string(),
        email: z.string().optional(),
      })).max(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      let imported = 0;
      let skipped = 0;

      for (const row of input.rows) {
        const phone = row.phone.trim().replace(/\s+/g, "");
        if (!phone) { skipped++; continue; }

        try {
          await db.insert(customers).values({
            tenantId,
            phoneNumber: phone,
            name: row.name?.trim() || null,
            email: row.email?.trim() || null,
          }).onDuplicateKeyUpdate({
            set: {
              name: row.name?.trim() || undefined,
              email: row.email?.trim() || undefined,
              updatedAt: new Date(),
            },
          });
          imported++;
        } catch {
          skipped++;
        }
      }

      logAction(tenantId, ctx.user.userId, "customer.imported", "customer", undefined, {
        imported, skipped, total: input.rows.length,
      }).catch(() => {});

      return { success: true, imported, skipped };
    }),

  // ── MERGE ────────────────────────────────────────────────────────────────
  merge: protectedProcedure
    .input(z.object({
      primaryId: z.number(),
      secondaryId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.primaryId === input.secondaryId) throw new Error("Cannot merge a customer with themselves");

      const tenantId = ctx.user.userId;
      const [primary] = await db.select().from(customers)
        .where(and(eq(customers.id, input.primaryId), eq(customers.tenantId, tenantId))).limit(1);
      const [secondary] = await db.select().from(customers)
        .where(and(eq(customers.id, input.secondaryId), eq(customers.tenantId, tenantId))).limit(1);
      if (!primary || !secondary) throw new Error("One or both customers not found");

      // Move conversations from secondary phone to primary phone — scoped to this tenant
      await db.update(conversations)
        .set({ phoneNumber: primary.phoneNumber })
        .where(and(eq(conversations.phoneNumber, secondary.phoneNumber), eq(conversations.tenantId, tenantId)));

      // Move appointments from secondary customer to primary customer
      await db.update(appointments)
        .set({ customerId: primary.id })
        .where(eq(appointments.customerId, secondary.id));

      // Merge counters into primary
      await db.update(customers).set({
        totalAppointments: (primary.totalAppointments ?? 0) + (secondary.totalAppointments ?? 0),
        completedAppointments: (primary.completedAppointments ?? 0) + (secondary.completedAppointments ?? 0),
        noShows: (primary.noShows ?? 0) + (secondary.noShows ?? 0),
        lifetimeValue: sql`${customers.lifetimeValue} + ${secondary.lifetimeValue ?? 0}`,
        // Keep primary's name/phone; merge email if primary has none
        email: primary.email ?? secondary.email,
        notes: [primary.notes, secondary.notes].filter(Boolean).join("\n---\n") || null,
        updatedAt: new Date(),
      }).where(eq(customers.id, primary.id));

      // Delete secondary record
      await db.delete(customers).where(eq(customers.id, secondary.id));

      logAction(ctx.user.userId, ctx.user.userId, "customer.merged", "customer", primary.id, {
        primaryPhone: primary.phoneNumber,
        secondaryPhone: secondary.phoneNumber,
      }).catch(() => {});

      return { success: true };
    }),

  // ── Bulk CSV contact import ──────────────────────────────────────────────
  importContacts: protectedProcedure
    .input(
      z.object({
        contacts: z.array(
          z.object({
            name: z.string().max(255),
            phone: z.string().max(50),
            email: z.string().email().optional().or(z.literal("")),
            tags: z.array(z.string()).optional(),
          })
        ).max(5000),
        skipDuplicates: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      let inserted = 0;
      let skipped = 0;

      for (const contact of input.contacts) {
        if (!contact.phone) { skipped++; continue; }

        // Check for existing record by phone
        const [existing] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, contact.phone)))
          .limit(1);

        if (existing) {
          if (input.skipDuplicates) { skipped++; continue; }
          // Merge tags if updating
          const [cur] = await db.select({ tags: customers.tags }).from(customers).where(eq(customers.id, existing.id)).limit(1);
          const merged = Array.from(new Set([...((cur?.tags as string[]) ?? []), ...(contact.tags ?? [])]));
          await db.update(customers)
            .set({ name: contact.name, email: contact.email || null, tags: merged, updatedAt: new Date() })
            .where(eq(customers.id, existing.id));
          inserted++;
        } else {
          await db.insert(customers).values({
            tenantId,
            name: contact.name,
            phoneNumber: contact.phone,
            email: contact.email || null,
            tags: contact.tags ?? [],
            optedOut: false,
            totalAppointments: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          inserted++;
        }
      }

      await logAction(tenantId, tenantId, "customer.imported", "customer", undefined, { inserted, skipped, total: input.contacts.length });
      return { inserted, skipped, total: input.contacts.length };
    }),
});
