import axios from "axios";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

export class WhatsAppBusinessAPI {
  private phoneNumberId: string;
  private accessToken: string;
  private baseUrl = "https://graph.facebook.com/v18.0";

  constructor(phoneNumberId: string, accessToken: string) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
  }

  static async fromConfig(tenantId?: number): Promise<WhatsAppBusinessAPI> {
    const query = db.select({
      whatsappPhoneNumberId: botConfig.whatsappPhoneNumberId,
      whatsappAccessToken: botConfig.whatsappAccessToken,
    }).from(botConfig);

    const [config] = tenantId
      ? await query.where(eq(botConfig.tenantId, tenantId)).limit(1)
      : await query.limit(1);

    return new WhatsAppBusinessAPI(
      config?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
      config?.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ""
    );
  }

  async sendTextMessage(to: string, message: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      return response.data?.messages?.[0]?.id || null;
    } catch (error) {
      console.error("Failed to send WhatsApp message:", error);
      return null;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        { messaging_product: "whatsapp", status: "read", message_id: messageId },
        { headers: { Authorization: `Bearer ${this.accessToken}` } }
      );
    } catch { /* non-critical */ }
  }

  /**
   * Send an interactive button message via the WhatsApp Business API.
   * Buttons appear as tappable chips in the chat.
   * Max 3 buttons; each button needs a unique id and display_text.
   */
  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string,
  ): Promise<string | null> {
    if (!buttons.length || buttons.length > 3) throw new Error("Interactive messages require 1–3 buttons");
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            ...(headerText ? { header: { type: "text", text: headerText } } : {}),
            body:    { text: bodyText },
            ...(footerText ? { footer: { text: footerText } } : {}),
            action: {
              buttons: buttons.map(b => ({
                type:  "reply",
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      return response.data?.messages?.[0]?.id || null;
    } catch (error: any) {
      console.error("Failed to send interactive button message:", error?.response?.data ?? error.message);
      return null;
    }
  }

  /**
   * Send an interactive list message (dropdown with up to 10 items).
   * Great for service menus, booking options, etc.
   */
  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    headerText?: string,
  ): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "interactive",
          interactive: {
            type: "list",
            ...(headerText ? { header: { type: "text", text: headerText } } : {}),
            body:    { text: bodyText },
            action: {
              button: buttonLabel.slice(0, 20),
              sections: sections.map(s => ({
                title: s.title,
                rows:  s.rows.map(r => ({ id: r.id, title: r.title.slice(0, 24), description: r.description?.slice(0, 72) ?? "" })),
              })),
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );
      return response.data?.messages?.[0]?.id || null;
    } catch (error: any) {
      console.error("Failed to send interactive list message:", error?.response?.data ?? error.message);
      return null;
    }
  }
}
