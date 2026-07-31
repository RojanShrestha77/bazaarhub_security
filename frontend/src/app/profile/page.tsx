"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { User, Save, Download, Shield, Mail, BadgeCheck, Store, MapPin, ChevronRight, MailWarning, AlertTriangle, Camera } from "lucide-react";
import { api, API_BASE, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { UserProfile } from "@/types";
import toast from "react-hot-toast";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resending, setResending] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api.get<UserProfile>("/profiles/me").then((p) => { setProfile(p); setName(p.displayName || ""); }).catch(() => {});
  }, [user, authLoading, router]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const updated = await api.upload<UserProfile>("/profiles/me/avatar", form);
      setProfile(updated);
      setAvatarVersion((v) => v + 1); // cache-bust the <img> src so the new image actually shows
      toast.success("Profile picture updated");
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to upload profile picture");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<UserProfile>("/profiles/me", { displayName: name });
      setProfile(updated);
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyAsSeller = async () => {
    setApplying(true);
    try {
      const res = await api.post<{ sellerApplicationStatus: UserProfile["sellerApplicationStatus"] }>("/seller/apply");
      setProfile((p) => (p ? { ...p, sellerApplicationStatus: res.sellerApplicationStatus } : p));
      toast.success("Seller application submitted — an admin will review it");
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit application");
    } finally {
      setApplying(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await api.post("/auth/email/verify/resend");
      toast.success("Verification email sent — check your inbox");
    } catch {
      toast.error("Could not send verification email");
    } finally {
      setResending(false);
    }
  };

  const handleDeleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await api.delete("/profiles/me", { body: { currentPassword: deletePassword } });
      toast.success("Your account has been deleted");
      await logout();
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) toast.error("Resolve orders that are still in progress first");
      else if (err instanceof ApiError && err.status === 401) toast.error("Incorrect password");
      else toast.error("Could not delete account");
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.get<{ data: string }>("/profiles/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "my-data.json"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch { toast.error("Export failed"); }
  };

  if (!user) return null;
  if (!profile) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Email verification banner */}
        {profile.emailVerified === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <MailWarning className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Verify your email address</p>
              <p className="text-xs text-amber-700 mt-0.5">Buying, selling, and messaging are locked until you confirm your email.</p>
            </div>
            <button onClick={handleResendVerification} disabled={resending} className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors whitespace-nowrap">
              {resending ? "Sending…" : "Resend email"}
            </button>
          </div>
        )}

        {/* Profile header */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-6">
          <div className="flex items-center gap-5">
            <div className="relative w-20 h-20 flex-shrink-0 group">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-red-100 rounded-full flex items-center justify-center overflow-hidden">
                {profile.hasAvatar ? (
                  <img
                    src={`${API_BASE}/profiles/me/avatar?v=${avatarVersion}`}
                    crossOrigin="use-credentials"
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-orange-600" />
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Change profile picture"
                className="absolute inset-0 w-full h-full rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors disabled:cursor-wait"
              >
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{profile.displayName || "User"}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />{profile.email}
                  {profile.emailVerified && <BadgeCheck className="w-3.5 h-3.5 text-green-500" aria-label="Email verified" />}
                </span>
                <span className="inline-flex items-center gap-1 capitalize"><Shield className="w-3.5 h-3.5" />{profile.role}</span>
                {/* Seller tier is only meaningful for sellers — hide it from buyers/admins. */}
                {profile.role === "seller" && (
                  <span className="inline-flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" />{profile.sellerTier} seller</span>
                )}
              </div>
            </div>
            {profile.mfaEnabled && <span className="text-xs bg-green-50 text-green-700 font-medium px-3 py-1.5 rounded-full border border-green-100">MFA Enabled</span>}
          </div>
        </div>

        {/* Edit form */}
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h2 className="font-semibold text-gray-900">Account Details</h2>
          <div>
            <label htmlFor="p-name" className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
            <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none transition-shadow text-sm" placeholder="Your display name" />
          </div>
          <div>
            <label htmlFor="p-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input id="p-email" type="email" value={profile.email} disabled className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed text-sm" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-700 disabled:opacity-50 transition-all active:scale-[0.98] shadow-sm">
              <Save className="w-4 h-4" />{saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-6 py-2.5 rounded-xl font-semibold hover:bg-gray-50 transition-all">
              <Download className="w-4 h-4" />Export Data
            </button>
          </div>
        </form>

        {/* Seller section — role-aware */}
        {profile.role !== "admin" && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Store className="w-4 h-4 text-orange-600" />
              <h2 className="font-semibold text-gray-900">Selling</h2>
            </div>
            {profile.role === "seller" ? (
              <div className="flex items-center justify-between py-2">
                <div><p className="text-sm font-medium text-gray-900">You&apos;re a seller</p><p className="text-xs text-gray-500">Create listings and manage your orders from the seller dashboard.</p></div>
                <a href="/seller" className="text-xs bg-orange-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-orange-700 transition-colors whitespace-nowrap">Seller Dashboard</a>
              </div>
            ) : profile.sellerApplicationStatus === "pending" ? (
              <div className="flex items-center justify-between py-2">
                <div><p className="text-sm font-medium text-gray-900">Application under review</p><p className="text-xs text-gray-500">An admin will approve or decline your seller request soon.</p></div>
                <span className="text-xs bg-yellow-100 text-yellow-700 font-medium px-3 py-1.5 rounded-full whitespace-nowrap">Pending</span>
              </div>
            ) : (
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">Want to sell on BazaarHub?</p>
                  <p className="text-xs text-gray-500">{profile.sellerApplicationStatus === "rejected" ? "Your previous request was declined. You can apply again." : "Request a seller account. An admin will review your application."}</p>
                </div>
                <button onClick={handleApplyAsSeller} disabled={applying} className="text-xs bg-orange-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                  {applying ? "Submitting..." : profile.sellerApplicationStatus === "rejected" ? "Apply Again" : "Apply to Sell"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Security section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mt-6">
          <h2 className="font-semibold text-gray-900 mb-3">Security</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div><p className="text-sm font-medium text-gray-900">Multi-Factor Authentication</p><p className="text-xs text-gray-500">{profile.mfaEnabled ? "MFA is active" : "Add an extra layer of security"}</p></div>
              {profile.mfaEnabled ? (
                <span className="text-xs bg-green-50 text-green-700 font-medium px-3 py-1.5 rounded-full">Enabled</span>
              ) : (
                <a href="/mfa/enrol" className="text-xs bg-orange-600 text-white px-4 py-1.5 rounded-lg font-medium hover:bg-orange-700 transition-colors">Enable</a>
              )}
            </div>
            <div className="flex items-center justify-between py-2">
              <div><p className="text-sm font-medium text-gray-900">Password</p><p className="text-xs text-gray-500">Last changed —</p></div>
              <a href="/password/change" className="text-xs border border-gray-200 text-gray-700 px-4 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">Change</a>
            </div>
          </div>
        </div>

        {/* Shipping addresses */}
        <Link href="/addresses" className="block bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mt-6 hover:border-orange-100 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-600" />
              <div>
                <h2 className="font-semibold text-gray-900">Shipping Addresses</h2>
                <p className="text-xs text-gray-500">Manage where your orders are delivered</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </div>
        </Link>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm mt-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="font-semibold text-gray-900">Delete Account</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">Permanently close your account. Your personal data is erased; this cannot be undone. You must resolve any in-progress orders first.</p>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)} className="text-xs border border-red-200 text-red-600 px-4 py-1.5 rounded-lg font-medium hover:bg-red-50 transition-colors">Delete my account</button>
          ) : (
            <form onSubmit={handleDeleteAccount} className="space-y-3">
              <div>
                <label htmlFor="del-pw" className="block text-xs font-medium text-gray-600 mb-1">Confirm your password to continue</label>
                <input id="del-pw" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-red-400 focus:ring-1 focus:ring-red-400 outline-none" placeholder="Current password" />
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" disabled={deleting || !deletePassword} className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">{deleting ? "Deleting…" : "Permanently delete"}</button>
                <button type="button" onClick={() => { setShowDelete(false); setDeletePassword(""); }} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
