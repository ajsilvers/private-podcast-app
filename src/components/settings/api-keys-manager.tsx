"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ShowOption {
  id: string;
  slug: string;
  title: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  shows: { show: ShowOption }[];
}

export function ApiKeysManager({ shows, initialKeys }: { shows: ShowOption[]; initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/api-keys");
    if (res.ok) setKeys((await res.json()).keys);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, showIds: selected }),
    });
    if (!res.ok) {
      setError("Could not create key. Give it a name and choose at least one feed.");
      return;
    }
    setNewKey((await res.json()).raw);
    setName("");
    setSelected([]);
    load();
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this key? Sites using it will stop being able to subscribe people.")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      {newKey && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm space-y-2">
          <p className="font-medium">Copy this key now. It won&apos;t be shown again.</p>
          <code className="block break-all bg-white p-2 rounded">{newKey}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(newKey)}>
            Copy
          </Button>
        </div>
      )}

      <form onSubmit={create} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="keyName">Key name (e.g. the site that will use it)</Label>
          <Input id="keyName" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium mb-1">Feeds this key may subscribe people to</legend>
          {shows.length === 0 && <p className="text-sm text-gray-500">Create a show first.</p>}
          {shows.map((show) => (
            <label key={show.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(show.id)}
                onChange={(e) =>
                  setSelected(e.target.checked ? [...selected, show.id] : selected.filter((id) => id !== show.id))
                }
              />
              {show.title} <code className="text-xs text-gray-500">{show.slug}</code>
            </label>
          ))}
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">Create key</Button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-1">Name</th>
            <th>Key</th>
            <th>Feeds</th>
            <th>Last used</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className="border-t">
              <td className="py-2">{key.name}</td>
              <td>
                <code>{key.prefix}…</code>
              </td>
              <td>{key.shows.map((s) => s.show.slug).join(", ")}</td>
              <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</td>
              <td className="text-right">
                {key.revokedAt ? (
                  <span className="text-gray-400">Revoked</span>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => revoke(key.id)}>
                    Revoke
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
