"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users, Shield, ClipboardList, Search, Store } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

type AdminTab = "users" | "applications" | "verifications" | "logs";

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>("users");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!user || user.role !== "admin") { router.push("/"); return; }
    const fetchAll = async () => {
      // Swallowing errors here would render an empty table that is
      // indistinguishable from "no data" — collect them and surface instead.
      const failures: string[] = [];
      const pull = async <T,>(label: string, req: Promise<T>, fallback: T): Promise<T> => {
        try { return await req; }
        catch (e: unknown) { failures.push(`${label}: ${e instanceof Error ? e.message : "request failed"}`); return fallback; }
      };
      const [users, applications, verifications, logsRes] = await Promise.all([
        pull("Users", api.get<any[]>("/admin/users"), []),
        pull("Applications", api.get<any[]>("/admin/seller-applications"), []),
        pull("Verifications", api.get<any[]>("/verification/requests"), []),
        // /admin/logs returns a paginated envelope ({ logs, total, skip, limit }),
        // unlike the bare arrays above — unwrap it to the array the table renders.
        pull("Audit logs", api.get<{ logs: any[] }>("/admin/logs?limit=50"), { logs: [] }),
      ]);
      setData({ users, applications, verifications, logs: logsRes?.logs ?? [] });
      setFetchErrors(failures);
      setLoading(false);
    };
    fetchAll();
  }, [user, router]);

  if (!user || user.role !== "admin") return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading...</span></div></div>;
  if (!data) return null;

  const updateRole = async (userId: string, role: string) => {
    try { await api.patch(`/admin/users/${userId}/role`, { role }); setData({ ...data, users: await api.get<any[]>("/admin/users") }); toast.success("Role updated"); }
    catch { toast.error("Failed"); }
  };

  const updateTier = async (userId: string, tier: string) => {
    try { await api.patch(`/admin/users/${userId}/tier`, { sellerTier: tier }); setData({ ...data, users: await api.get<any[]>("/admin/users") }); toast.success("Tier updated"); }
    catch { toast.error("Failed"); }
  };

  const decideApplication = async (userId: string, decision: "approve" | "reject") => {
    try {
      await api.post(`/admin/seller-applications/${userId}/${decision}`, {});
      const [applications, users] = await Promise.all([
        api.get<any[]>("/admin/seller-applications"),
        api.get<any[]>("/admin/users"),
      ]);
      setData({ ...data, applications, users });
      toast.success(decision === "approve" ? "Seller approved" : "Application declined");
    } catch { toast.error("Failed"); }
  };

  const updateVerification = async (verificationId: string, status: string) => {
    try {
      if (status === "approved") {
        await api.post(`/verification/requests/${verificationId}/approve`, {});
      } else {
        // Rejection requires a reason (backend-validated).
        const reason = window.prompt("Reason for rejecting this verification?");
        if (!reason || !reason.trim()) return;
        await api.post(`/verification/requests/${verificationId}/reject`, { reason: reason.trim() });
      }
      setData({ ...data, verifications: await api.get<any[]>("/verification/requests") });
      toast.success(`Verification ${status}`);
    } catch { toast.error("Failed"); }
  };

  const tabs: { key: AdminTab; label: string; icon: any; count?: number }[] = [
    { key: "users", label: "Users", icon: Users, count: data.users.length },
    { key: "applications", label: "Seller Applications", icon: Store, count: data.applications.length },
    { key: "verifications", label: "Verifications", icon: Shield, count: data.verifications.length },
    { key: "logs", label: "Audit Logs", icon: ClipboardList },
  ];

  const filteredUsers = data.users.filter((u: any) => !userSearch || u.email?.toLowerCase().includes(userSearch.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage users, verifications, and audit logs</p>
        </div>

        {fetchErrors.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
            <p className="text-sm font-medium text-amber-900">Some data could not be loaded</p>
            <ul className="mt-1 text-xs text-amber-800 list-disc list-inside">
              {fetchErrors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === t.key ? "bg-orange-600 text-white shadow-sm" : "bg-white border border-gray-100 text-gray-600 hover:bg-gray-50"}`}>
              <t.icon className="w-4 h-4" />{t.label}{t.count !== undefined && <span className="text-xs ml-1">({t.count})</span>}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {tab === "users" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by email..." className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">{["Email", "Role", "Tier", "MFA", "Actions"].map((h) => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>{filteredUsers.map((u: any, i: number) => <tr key={u._id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-orange-50/30 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                  <td className="px-4 py-3">
                    <select value={u.role} onChange={(e) => updateRole(u._id, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-orange-500 outline-none">
                      <option value="buyer">Buyer</option><option value="seller">Seller</option><option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select value={u.sellerTier || "unverified"} onChange={(e) => updateTier(u._id, e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-orange-500 outline-none">
                      <option value="unverified">Unverified</option><option value="verified">Verified</option><option value="trusted">Trusted</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">{u.mfaEnabled ? <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 font-medium px-2 py-0.5 rounded-full">Enabled</span> : <span className="text-xs text-gray-400">—</span>}</td>
                  <td className="px-4 py-3"><span className="text-xs text-gray-400">ID: {u._id.slice(-6)}</span></td>
                </tr>)}</tbody>
              </table>
              {filteredUsers.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No users match your search.</p>}
            </div>
          </div>
        )}

        {/* Seller Applications tab */}
        {tab === "applications" && (
          <div className="space-y-3">
            {data.applications.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <Store className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500">No pending seller applications.</p>
              </div>
            ) : data.applications.map((a: any) => (
              <div key={a._id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center"><Store className="w-5 h-5 text-orange-500" /></div>
                  <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{a.email}</p><p className="text-xs text-gray-400 mt-0.5">Requested seller access</p></div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">Pending</span>
                </div>
                <div className="flex gap-2 ml-4">
                  <button onClick={() => decideApplication(a._id, "approve")} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors">Approve</button>
                  <button onClick={() => decideApplication(a._id, "reject")} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors">Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Verifications tab */}
        {tab === "verifications" && (
          <div className="space-y-3">
            {data.verifications.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <Shield className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500">No verification requests.</p>
              </div>
            ) : data.verifications.map((v: any) => (
              <div key={v._id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Shield className="w-5 h-5 text-orange-500" /></div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{v.sellerId?.email || "Unknown seller"}</p>
                      {v.details && (
                        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-gray-500">
                          <span><span className="text-gray-400">Name:</span> {v.details.fullName}</span>
                          <span className="capitalize"><span className="text-gray-400">ID:</span> {v.details.idType?.replace("_", " ")} — {v.details.idNumber}</span>
                          {v.details.businessName && <span><span className="text-gray-400">Business:</span> {v.details.businessName}</span>}
                          <span><span className="text-gray-400">Phone:</span> {v.details.phone}</span>
                          <span className="sm:col-span-2"><span className="text-gray-400">Address:</span> {v.details.address}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize flex-shrink-0 ${v.status === "pending" ? "bg-yellow-100 text-yellow-700" : v.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{v.status}</span>
                </div>
                {v.status === "pending" && (
                  <div className="flex gap-2 mt-4 pt-3 border-t border-gray-50">
                    <button onClick={() => updateVerification(v._id, "approved")} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors">Approve</button>
                    <button onClick={() => updateVerification(v._id, "rejected")} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors">Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Logs tab */}
        {tab === "logs" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">{["Action", "User", "IP", "Time"].map((h) => <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>{data.logs.map((l: any, i: number) => <tr key={l._id || i} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-orange-50/30 transition-colors`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{l.action}</td>
                  {/* actor/subject are populated docs ({_id,email,role}), never plain strings — render the email, not the object */}
                  <td className="px-4 py-3">{l.actor?.email || l.subject?.email || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{l.ip || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(l.createdAt || l.timestamp).toLocaleString()}</td>
                </tr>)}</tbody>
              </table>
              {data.logs.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">No log entries.</p>}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
