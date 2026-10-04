import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

export default async function SettingsPage() {
  const shows = await db.show.findMany({
    select: { id: true, slug: true, title: true },
    orderBy: { createdAt: "desc" },
  });
  const keys = await db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      shows: { select: { show: { select: { id: true, slug: true, title: true } } } },
    },
  });
  const initialKeys = keys.map((k) => ({
    ...k,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }));
  const endpoint = `${getEnv().APP_URL}/api/v1/subscribe`;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Give each website its own key, limited to the feeds it may subscribe people to. Keys are stored hashed
            and shown only once.
          </p>
          <ApiKeysManager shows={shows} initialKeys={initialKeys} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscribe API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Call this from your site&apos;s server after an opt-in. The response contains the person&apos;s private feed
            URL to email and show them. Repeat calls for the same email and feed return the same URL.
          </p>
          <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"feed": "your-feed-slug", "email": "listener@example.com", "first_name": "Jane"}'`}
          </pre>
          <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`201 (new) / 200 (already subscribed)
{
  "feed_url": "${getEnv().APP_URL}/api/feeds/abc123...",
  "subscriber_id": "...",
  "feed": "your-feed-slug",
  "status": "active",
  "created": true,
  "start_date": "2026-10-04T12:00:00.000Z"
}`}
          </pre>
          <p className="text-sm text-gray-500">
            Errors: 401 bad key, 404 unknown feed or key not allowed for it, 403 feed closed, 409 subscriber revoked,
            400 invalid request. Full contract: docs/API.md.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
