import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createSessionStore,
  guardDataService,
  ServiceContext,
} from "./service-context";
import type { ApplicationRuntime } from "./service-context";

let nextNamespace = 0;
const namespaces = new WeakMap<object, string>();
function namespaceFor(services: object): string {
  let value = namespaces.get(services);
  if (!value) {
    value = `adapter-${++nextNamespace}`;
    namespaces.set(services, value);
  }
  return value;
}
export function ApplicationProviders({
  runtime,
  children,
}: {
  runtime: ApplicationRuntime;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const context = useMemo(() => {
    const session = createSessionStore(runtime.services.auth, client);
    return {
      services: {
        auth: runtime.services.auth,
        data: guardDataService(runtime.services.data, session),
      },
      mode: runtime.mode,
      namespace: namespaceFor(runtime.services),
      session,
    };
  }, [runtime, client]);
  useEffect(() => context.session.start(), [context]);
  return (
    <QueryClientProvider client={client}>
      <ServiceContext.Provider value={context}>
        {children}
      </ServiceContext.Provider>
    </QueryClientProvider>
  );
}
