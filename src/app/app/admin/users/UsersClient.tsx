"use client";

import { useState } from "react";

interface Role {
  id: string;
  key: string;
  name: string;
}

interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  roles: Array<{ role: Role }>;
}

interface Props {
  users: UserRecord[];
  allRoles: Role[];
  labels: {
    name: string;
    email: string;
    roles: string;
    noRoles: string;
    saveRoles: string;
    saving: string;
    saved: string;
    noUsers: string;
  };
}

export function UsersClient({ users, allRoles, labels }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(
        users.map((u) => [u.id, new Set(u.roles.map((r) => r.role.id))]),
      ),
  );

  const toggleRole = (userId: string, roleId: string) => {
    setUserRoles((prev) => {
      const next = new Set(prev[userId] ?? []);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return { ...prev, [userId]: next };
    });
    setSavedMsg(null);
  };

  const saveRoles = async (userId: string) => {
    setSaving(userId);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: Array.from(userRoles[userId] ?? []) }),
      });
      if (!res.ok) throw new Error("Failed");
      setSavedMsg(userId);
      setTimeout(() => setSavedMsg(null), 2500);
    } catch {
      alert("Failed to save roles.");
    } finally {
      setSaving(null);
    }
  };

  if (users.length === 0) {
    return <div className="mt-4 text-sm text-zinc-600">{labels.noUsers}</div>;
  }

  return (
    <div className="mt-4 divide-y divide-sky-100">
      {users.map((u) => (
        <div key={u.id} className="py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-medium text-zinc-900">{u.name ?? "—"}</div>
              <div className="text-xs text-zinc-500">{u.email ?? "—"}</div>
            </div>
            <button
              onClick={() => saveRoles(u.id)}
              disabled={saving === u.id}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
            >
              {saving === u.id
                ? labels.saving
                : savedMsg === u.id
                  ? labels.saved
                  : labels.saveRoles}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {allRoles.length === 0 && (
              <span className="text-xs text-zinc-500">{labels.noRoles}</span>
            )}
            {allRoles.map((role) => {
              const active = userRoles[u.id]?.has(role.id) ?? false;
              return (
                <button
                  key={role.id}
                  onClick={() => toggleRole(u.id, role.id)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus:ring-4 focus:ring-emerald-200/70 ${
                    active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-sky-100 bg-white text-zinc-600 hover:bg-sky-50"
                  }`}
                >
                  {role.name || role.key}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

