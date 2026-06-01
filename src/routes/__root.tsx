import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Snowfall } from "@/components/Snowfall";
import { useSettings } from "@/lib/settings";


import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "kimmy's valuelist" },
      { name: "description", content: "kimmy's valuelist — community skin value list. contact @wrruf on discord for any info/ changes needed." },
      { property: "og:title", content: "kimmy's valuelist" },
      { property: "og:description", content: "kimmy's valuelist — community skin value list. contact @wrruf on discord for any info/ changes needed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "kimmy's valuelist" },
      { name: "twitter:description", content: "kimmy's valuelist — community skin value list. contact @wrruf on discord for any info/ changes needed." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/fIHbIqaPPoY4ruPBnZdASAIWnEM2/social-images/social-1779526701205-kimmy’s_valuelist.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/fIHbIqaPPoY4ruPBnZdASAIWnEM2/social-images/social-1779526701205-kimmy’s_valuelist.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  // Pre-paint script: apply persisted theme/perf flags to <html> before React
  // hydrates so the page doesn't flash the default winter palette (and never
  // "snaps back to spring" between releases).
  const bootstrap = `(function(){try{var s=localStorage.getItem('kimmy-valuelist-settings');if(!s)return;var p=JSON.parse(s);var d=document.documentElement;if(p.theme)d.dataset.theme=p.theme;if(p.lowPerf)d.dataset.lowPerf='1';if(p.reduceMotion)d.dataset.reduceMotion='1';}catch(e){}})();`;
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [settings] = useSettings();

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster theme="dark" />
      {settings.showEffects && !settings.lowPerf && <Snowfall />}
      <Outlet />
    </QueryClientProvider>
  );
}

