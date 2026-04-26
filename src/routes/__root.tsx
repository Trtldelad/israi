import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ISR AI" },
      { name: "description", content: "ISR AI was created to promote Israeli advocacy worldwide. The tool is intended to respond to antisemitic comments and posts." },
      { name: "author", content: "ISR AI" },
      { property: "og:title", content: "ISR AI" },
      { property: "og:description", content: "ISR AI was created to promote Israeli advocacy worldwide. The tool is intended to respond to antisemitic comments and posts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@ISRAI" },
      { name: "twitter:title", content: "ISR AI" },
      { name: "twitter:description", content: "ISR AI was created to promote Israeli advocacy worldwide. The tool is intended to respond to antisemitic comments and posts." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2ee253fe-74a0-4da0-8cd5-430775939792/id-preview-56b5c856--701fef09-7831-4e47-a847-7350a3b38e50.lovable.app-1777132587142.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2ee253fe-74a0-4da0-8cd5-430775939792/id-preview-56b5c856--701fef09-7831-4e47-a847-7350a3b38e50.lovable.app-1777132587142.png" },
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
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
