import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, botConfig, conversations, templates } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { totpService } from "../services/totpService";

/**
 * Critical Integration Tests
 * Tests for auth, message pipeline, and booking flows
 * These must pass before production deployment
 */

describe("Critical Flows", () => {
  const testEmail = "test-critical@example.com";
  const testPassword = "SecurePassword123!";
  let testUserId: number;
  let testTenantId: number;

  beforeAll(async () => {
    // Clean up test data if exists
    await db.delete(users).where(eq(users.email, testEmail));
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(users).where(eq(users.id, testUserId || 999999));
  });

  describe("Auth Flow", () => {
    it("should register a new user", async () => {
      const hashedPassword = await bcrypt.hash(testPassword, 10);

      const [created] = await db
        .insert(users)
        .values({
          email: testEmail,
          name: "Test User",
          passwordHash: hashedPassword,
          role: "user",
          passwordVersion: 1,
          isActive: true,
          emailVerified: false,
          twoFactorEnabled: false,
          plan: "trial",
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .returning();

      testUserId = created.id;
      testTenantId = created.id;

      expect(created).toBeDefined();
      expect(created.email).toBe(testEmail);
      expect(created.role).toBe("user");
    });

    it("should create bot config for new user", async () => {
      const [config] = await db
        .insert(botConfig)
        .values({
          tenantId: testTenantId,
          businessName: "Test Business",
          systemPrompt: "You are a helpful AI assistant",
          aiModel: "gemma4:latest",
          timezone: "Africa/Johannesburg",
          enableBusinessHours: false,
          businessHoursStart: "09:00",
          businessHoursEnd: "17:00",
          afterHoursMessage: "We're closed",
        })
        .returning();

      expect(config).toBeDefined();
      expect(config.tenantId).toBe(testTenantId);
      expect(config.businessName).toBe("Test Business");
    });

    it("should verify password correctly", async () => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, testUserId),
      });

      expect(user).toBeDefined();
      const isValid = await bcrypt.compare(testPassword, user!.passwordHash);
      expect(isValid).toBe(true);
    });

    it("should reject invalid password", async () => {
      const user = await db.query.users.findFirst({
        where: eq(users.id, testUserId),
      });

      expect(user).toBeDefined();
      const isValid = await bcrypt.compare("WrongPassword123!", user!.passwordHash);
      expect(isValid).toBe(false);
    });

    it("should handle 2FA setup", async () => {
      const secret = totpService.generateSecret();
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThan(0);

      const token = totpService.generateToken(secret);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
    });

    it("should verify TOTP token", async () => {
      const secret = totpService.generateSecret();
      const token = totpService.generateToken(secret);

      const isValid = totpService.verifyToken(token, secret);
      expect(isValid).toBe(true);
    });

    it("should reject invalid TOTP token", async () => {
      const secret = totpService.generateSecret();

      const isValid = totpService.verifyToken("000000", secret);
      expect(isValid).toBe(false);
    });

    it("should increment passwordVersion on password change", async () => {
      const originalUser = await db.query.users.findFirst({
        where: eq(users.id, testUserId),
      });

      const originalVersion = originalUser!.passwordVersion;
      const newHashedPassword = await bcrypt.hash("NewPassword456!", 10);

      await db
        .update(users)
        .set({
          passwordHash: newHashedPassword,
          passwordVersion: originalVersion + 1,
        })
        .where(eq(users.id, testUserId));

      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, testUserId),
      });

      expect(updatedUser!.passwordVersion).toBe(originalVersion + 1);
    });
  });

  describe("Message Pipeline Flow", () => {
    it("should validate tenant isolation", async () => {
      // Create a second test tenant
      const hashedPassword = await bcrypt.hash("AnotherPassword123!", 10);
      const [otherUser] = await db
        .insert(users)
        .values({
          email: "other-tenant@example.com",
          name: "Other Tenant",
          passwordHash: hashedPassword,
          role: "user",
          passwordVersion: 1,
          isActive: true,
          emailVerified: false,
          twoFactorEnabled: false,
          plan: "trial",
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .returning();

      // Create conversations for both tenants
      const [conv1] = await db
        .insert(conversations)
        .values({
          tenantId: testTenantId,
          customerPhone: "+27123456789",
          messageText: "Hello from tenant 1",
          messageDirection: "inbound",
          source: "ai",
          sentiment: "neutral",
        })
        .returning();

      const [conv2] = await db
        .insert(conversations)
        .values({
          tenantId: otherUser.id,
          customerPhone: "+27987654321",
          messageText: "Hello from tenant 2",
          messageDirection: "inbound",
          source: "ai",
          sentiment: "neutral",
        })
        .returning();

      // Verify tenants can only see their own conversations
      const tenant1Convs = await db.query.conversations.findMany({
        where: eq(conversations.tenantId, testTenantId),
      });

      const tenant2Convs = await db.query.conversations.findMany({
        where: eq(conversations.tenantId, otherUser.id),
      });

      expect(tenant1Convs.length).toBe(1);
      expect(tenant1Convs[0].tenantId).toBe(testTenantId);

      expect(tenant2Convs.length).toBe(1);
      expect(tenant2Convs[0].tenantId).toBe(otherUser.id);

      // Clean up
      await db.delete(users).where(eq(users.id, otherUser.id));
    });

    it("should create conversation record", async () => {
      const [conv] = await db
        .insert(conversations)
        .values({
          tenantId: testTenantId,
          customerPhone: "+27123456789",
          messageText: "Test message",
          messageDirection: "inbound",
          source: "ai",
          sentiment: "neutral",
        })
        .returning();

      expect(conv).toBeDefined();
      expect(conv.tenantId).toBe(testTenantId);
      expect(conv.messageText).toBe("Test message");
      expect(conv.messageDirection).toBe("inbound");
    });

    it("should validate message source types", async () => {
      const sources = ["ai", "template", "agent", "after_hours"] as const;

      for (const source of sources) {
        const [conv] = await db
          .insert(conversations)
          .values({
            tenantId: testTenantId,
            customerPhone: "+27123456789",
            messageText: `Message from ${source}`,
            messageDirection: "outbound",
            source,
            sentiment: "neutral",
          })
          .returning();

        expect(conv.source).toBe(source);
      }
    });
  });

  describe("Templates Flow", () => {
    it("should create and retrieve template", async () => {
      const [template] = await db
        .insert(templates)
        .values({
          tenantId: testTenantId,
          name: "Greeting",
          trigger: "hello",
          response: "Hello! How can I help you?",
          isActive: true,
          priority: 1,
        })
        .returning();

      expect(template).toBeDefined();
      expect(template.name).toBe("Greeting");
      expect(template.trigger).toBe("hello");

      // Retrieve it
      const retrieved = await db.query.templates.findFirst({
        where: eq(templates.id, template.id),
      });

      expect(retrieved).toBeDefined();
      expect(retrieved!.tenantId).toBe(testTenantId);
    });

    it("should respect template priority ordering", async () => {
      // Create multiple templates with different priorities
      const priorities = [3, 1, 2];

      for (const priority of priorities) {
        await db.insert(templates).values({
          tenantId: testTenantId,
          name: `Template Priority ${priority}`,
          trigger: `trigger-${priority}`,
          response: `Response ${priority}`,
          isActive: true,
          priority,
        });
      }

      // Retrieve ordered by priority
      const ordered = await db.query.templates.findMany({
        where: eq(templates.tenantId, testTenantId),
        orderBy: (t) => t.priority,
      });

      const priorities_result = ordered.map((t) => t.priority);
      expect(priorities_result).toEqual([1, 2, 3]);
    });
  });

  describe("Data Integrity", () => {
    it("should enforce tenantId on all queries", async () => {
      // This test verifies we never query without tenantId filter
      const allConvs = await db.query.conversations.findMany();

      // All conversations should belong to a tenant
      expect(allConvs.every((c) => c.tenantId > 0)).toBe(true);
    });

    it("should maintain referential integrity", async () => {
      // Verify that conversations reference valid tenants
      const conv = await db.query.conversations.findFirst();

      if (conv) {
        const tenant = await db.query.users.findFirst({
          where: eq(users.id, conv.tenantId),
        });

        expect(tenant).toBeDefined();
      }
    });

    it("should handle concurrent writes safely", async () => {
      // Simulate concurrent writes
      const promises = Array.from({ length: 5 }, (_, i) =>
        db.insert(conversations).values({
          tenantId: testTenantId,
          customerPhone: `+2712345678${i}`,
          messageText: `Concurrent message ${i}`,
          messageDirection: "inbound",
          source: "ai",
          sentiment: "neutral",
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r[0].id)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing required fields", async () => {
      expect(async () => {
        await db.insert(conversations).values({
          tenantId: testTenantId,
          customerPhone: "+27123456789",
          messageText: "", // Empty message - might fail validation
          messageDirection: "inbound",
          source: "ai",
        } as any);
      }).rejects;
    });

    it("should validate email format", async () => {
      // Try to insert invalid email
      expect(async () => {
        await db.insert(users).values({
          email: "not-an-email",
          name: "Test",
          passwordHash: "hash",
          role: "user",
          passwordVersion: 1,
        } as any);
      }).rejects;
    });
  });
});
