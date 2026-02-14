"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShowForm } from "@/components/forms/show-form";

export default function NewShowPage() {
  const router = useRouter();

  async function handleSubmit(data: Record<string, unknown>) {
    try {
      const res = await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const { show } = await res.json();
        router.push(`/shows/${show.id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create show");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create show");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Create New Show</h1>
      <ShowForm onSubmit={handleSubmit} onCancel={() => router.push("/shows")} />
    </div>
  );
}
