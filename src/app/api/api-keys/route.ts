import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/api-keys";

const CreateKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  showIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const showIds = [...new Set(parsed.data.showIds)];
  if ((await db.show.count({ where: { id: { in: showIds } } })) !== showIds.length) {
    return NextResponse.json({ error: "Unknown show" }, { status: 400 });
  }

  const { raw, prefix, hash } = generateApiKey();
  const key = await db.apiKey.create({
    data: {
      name: parsed.data.name,
      prefix,
      keyHash: hash,
      shows: { create: showIds.map((showId) => ({ showId })) },
    },
  });
  // The raw key is returned exactly once; only its hash is stored.
  return NextResponse.json({ id: key.id, name: key.name, prefix, raw }, { status: 201 });
}
