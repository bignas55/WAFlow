import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(url, options) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 120 second timeout
        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          return response;
        } catch (error) {
          clearTimeout(timeout);
          throw error;
        }
      },
    }),
  ],
});
