import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function getUser() {
  return db.user.findFirst();
}

export default async function SettingsPage() {
  const user = await getUser();

  const maskedApiKey = user?.apiKey 
    ? `${user.apiKey.slice(0, 8)}-${user.apiKey.slice(8, 16)}-${user.apiKey.slice(-8)}`
    : "No API key";

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/shows/{show_id}/subscribers`;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Use this API key to authenticate webhook requests from external systems.
          </p>
          <div className="bg-gray-50 p-3 rounded font-mono text-sm">
            {maskedApiKey}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Full key: {user?.apiKey}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Add Subscriber Endpoint</h3>
            <code className="block bg-gray-50 p-3 rounded text-sm">
              POST {webhookUrl}
            </code>
          </div>

          <div>
            <h3 className="font-medium mb-2">Request Headers</h3>
            <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium mb-2">Request Body</h3>
            <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`{
  "email": "subscriber@example.com",
  "name": "John Doe"
}`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium mb-2">Example cURL</h3>
            <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`curl -X POST "${webhookUrl.replace("{show_id}", "YOUR_SHOW_ID")}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "subscriber@example.com", "name": "John Doe"}'`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium mb-2">Response</h3>
            <pre className="bg-gray-50 p-3 rounded text-sm overflow-x-auto">
{`{
  "id": "clx123abc",
  "email": "subscriber@example.com",
  "name": "John Doe",
  "feed_url": "https://yourdomain.com/api/feeds/abc123...",
  "status": "active",
  "start_date": "2026-02-12T10:00:00Z",
  "activated": false
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
