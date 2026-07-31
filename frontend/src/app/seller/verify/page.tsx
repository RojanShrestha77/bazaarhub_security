"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SellerVerifyRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/seller/verification"); }, [router]);
  return null;
}
