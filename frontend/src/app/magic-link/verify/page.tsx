"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) { setError("Missing verification token"); return; }
    api.post("/auth/magic-link/verify", { token })
      .then(() => router.push("/marketplace"))
      .catch(() => setError("Link expired or invalid. Request a new one."));
  }, [searchParams, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <p className="text-gray-500">{error || "Verifying your link..."}</p>
    </div>
  );
}

export default function MagicLinkVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>}>
      <VerifyContent />
    </Suspense>
  );
}
