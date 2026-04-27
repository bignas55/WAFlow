import { router } from "./trpc.js";
import { authRouter } from "./routers/authRouter.js";
import { botConfigRouter } from "./routers/botConfigRouter.js";
import { aiConfigRouter } from "./routers/aiConfigRouter.js";
import { templatesRouter } from "./routers/templatesRouter.js";
import { conversationsRouter } from "./routers/conversationsRouter.js";
import { whatsappRouter } from "./routers/whatsappRouter.js";
import { knowledgeBaseRouter } from "./routers/knowledgeBaseRouter.js";
import { crmRouter } from "./routers/crmRouter.js";
import { advancedRouter } from "./routers/advancedRouter.js";
import { receptionistRouter } from "./routers/receptionistRouter.js";
import { appointmentsRouter } from "./routers/appointmentsRouter.js";
import { usersRouter } from "./routers/usersRouter.js";
import { adminRouter } from "./routers/adminRouter.js";
import { billingRouter } from "./routers/billingRouter.js";
import { licenseRouter } from "./routers/licenseRouter.js";
import { broadcastRouter } from "./routers/broadcastRouter.js";
import { analyticsRouter } from "./routers/analyticsRouter.js";
import { auditRouter } from "./routers/auditRouter.js";
import { staffRouter } from "./routers/staffRouter.js";
import { waitlistRouter } from "./routers/waitlistRouter.js";
import { bookingRouter } from "./routers/bookingRouter.js";
import { calendarRouter } from "./routers/calendarRouter.js";
import { loyaltyRouter } from "./routers/loyaltyRouter.js";
import { surveyRouter } from "./routers/surveyRouter.js";
import { selfServiceRouter } from "./routers/selfServiceRouter.js";
import { outboundWebhooksRouter } from "./routers/outboundWebhooksRouter.js";
import { customFieldsRouter } from "./routers/customFieldsRouter.js";
import { promptExpertRouter } from "./routers/promptExpertRouter.js";
import { ticketsRouter } from "./routers/ticketsRouter.js";
import { flowsRouter } from "./routers/flowsRouter.js";
import { menuOptionsRouter } from "./routers/menuOptionsRouter.js";
import { liveReceptionistRouter } from "./routers/liveReceptionistRouter.js";
import { subscriptionRouter } from "./routers/subscriptionRouter.js";
import { businessRulesRouter } from "./routers/businessRulesRouter.js";

export const appRouter = router({
  auth: authRouter,
  botConfig: botConfigRouter,
  aiConfig: aiConfigRouter,
  templates: templatesRouter,
  conversations: conversationsRouter,
  whatsapp: whatsappRouter,
  knowledgeBase: knowledgeBaseRouter,
  crm: crmRouter,
  advanced: advancedRouter,
  receptionist: receptionistRouter,
  appointments: appointmentsRouter,
  users: usersRouter,
  admin: adminRouter,
  billing: billingRouter,
  license: licenseRouter,
  broadcast: broadcastRouter,
  analytics: analyticsRouter,
  audit: auditRouter,
  staff: staffRouter,
  waitlist: waitlistRouter,
  booking: bookingRouter,
  calendar: calendarRouter,
  loyalty: loyaltyRouter,
  survey: surveyRouter,
  selfService: selfServiceRouter,
  outboundWebhooks: outboundWebhooksRouter,
  customFields: customFieldsRouter,
  promptExpert: promptExpertRouter,
  tickets: ticketsRouter,
  flows: flowsRouter,
  menuOptions: menuOptionsRouter,
  liveReceptionist: liveReceptionistRouter,
  subscription: subscriptionRouter,
  businessRules: businessRulesRouter,
});

export type AppRouter = typeof appRouter;
