"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare, Send, Flag, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Conversation, Message } from "@/types";

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    api.get<{ conversations: Conversation[] }>("/conversations")
      .then(async (d) => {
        setConversations(d.conversations);
        // Resolve listing titles for the list labels (best-effort).
        const uniq = [...new Set(d.conversations.map((c) => c.listingId))];
        const entries = await Promise.all(uniq.map(async (id) => {
          try { const l = await api.get<{ title: string }>(`/listings/${id}`); return [id, l.title] as const; }
          catch { return [id, "Listing"] as const; }
        }));
        setTitles(Object.fromEntries(entries));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  const openThread = useCallback(async (id: string) => {
    setActiveId(id);
    try {
      const d = await api.get<{ messages: Message[] }>(`/conversations/${id}/messages`);
      setMessages(d.messages);
    } catch { toast.error("Could not load messages"); }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await api.post<Message>(`/conversations/${activeId}/messages`, { body: draft.trim() });
      setMessages((prev) => [...prev, msg]);
      setDraft("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) toast.error("Verify your email before messaging");
      else toast.error("Could not send message");
    } finally {
      setSending(false);
    }
  };

  const report = async (messageId: string) => {
    if (!activeId) return;
    try {
      await api.post(`/conversations/${activeId}/messages/${messageId}/report`);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reported: true } : m)));
      toast.success("Message reported to moderators");
    } catch { toast.error("Could not report message"); }
  };

  if (!user) return null;
  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" role="status"><span className="sr-only">Loading…</span></div></div>;

  if (conversations.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6"><MessageSquare className="w-12 h-12 text-orange-300" /></div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No messages yet</h2>
          <p className="text-gray-500 mb-8">Start a conversation from any listing to reach the seller.</p>
          <Link href="/marketplace" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-sm">Browse Marketplace</Link>
        </div>
      </div>
    );
  }

  const activeTitle = titles[conversations.find((c) => c.id === activeId)?.listingId || ""] || "Conversation";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Messages</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[70vh]">
        {/* Conversation list */}
        <div className={`md:col-span-1 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-y-auto ${activeId ? "hidden md:block" : ""}`}>
          {conversations.map((c) => (
            <button key={c.id} onClick={() => openThread(c.id)} className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${activeId === c.id ? "bg-orange-50" : ""}`}>
              <p className="font-medium text-gray-900 truncate">{titles[c.listingId] || "Listing"}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.buyerId === user.id ? "You're the buyer" : "You're the seller"} · {new Date(c.lastMessageAt).toLocaleDateString()}</p>
            </button>
          ))}
        </div>

        {/* Thread */}
        <div className={`md:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col ${activeId ? "" : "hidden md:flex"}`}>
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Select a conversation</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <button onClick={() => setActiveId(null)} className="md:hidden text-gray-400 hover:text-gray-600" aria-label="Back"><ChevronLeft className="w-5 h-5" /></button>
                <p className="font-semibold text-gray-900 truncate">{activeTitle}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const mine = m.senderId === user.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`group max-w-[75%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                        <div className={`px-3.5 py-2 rounded-2xl text-sm ${mine ? "bg-orange-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
                          {m.body}
                        </div>
                        <div className="flex items-center gap-2 mt-1 px-1">
                          <span className="text-[10px] text-gray-400">{new Date(m.createdAt).toLocaleString()}</span>
                          {!mine && (m.reported ? (
                            <span className="text-[10px] text-red-400 inline-flex items-center gap-0.5"><Flag className="w-2.5 h-2.5" /> reported</span>
                          ) : (
                            <button onClick={() => report(m.id)} className="text-[10px] text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5"><Flag className="w-2.5 h-2.5" /> report</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t border-gray-100 flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message…"
                  maxLength={2000}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400 outline-none"
                />
                <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send" className="bg-orange-600 text-white p-2.5 rounded-xl hover:bg-orange-700 disabled:opacity-50 transition-colors">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
