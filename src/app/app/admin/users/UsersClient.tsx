"use client";

import { useState, type FormEvent } from "react";

interface Role {
  id: string;
  key: string;
  name: string;
}

interface Permission {
  id: string;
  key: string;
  description: string | null;
}

interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  permissions: Array<{ permission: Permission }>;
  roles: Array<{ role: Role }>;
}

interface Props {
  users: UserRecord[];
  allRoles: Role[];
  allPermissions: Permission[];
  labels: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    permissions: string;
    roles: string;
    noRoles: string;
    noPermissions: string;
    saveAccess: string;
    saving: string;
    saved: string;
    noUsers: string;
    createUser: string;
    createHint: string;
    create: string;
    creating: string;
    createdUser: string;
    failedCreate: string;
    failedSave: string;
    passwordMismatch: string;
    passwordMin: string;
    namePlaceholder: string;
    emailPlaceholder: string;
  };
}

function AccessChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus:ring-4 focus:ring-emerald-200/70 ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-sky-100 bg-white text-zinc-600 hover:bg-sky-50"
      }`}
    >
      {label}
    </button>
  );
}

async function readErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    if (typeof data?.error === "string") return data.error;
  } catch {
    // ignore JSON parsing errors and use fallback
  }
  return fallback;
}

export function UsersClient({ users, allRoles, allPermissions, labels }: Props) {
  const [items, setItems] = useState(users);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(
        users.map((u) => [u.id, new Set(u.roles.map((r) => r.role.id))]),
      ),
  );
  const [userPermissions, setUserPermissions] = useState<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(
        users.map((u) => [u.id, new Set(u.permissions.map((p) => p.permission.id))]),
      ),
  );
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [createRoles, setCreateRoles] = useState<Set<string>>(() => new Set());
  const [createPermissions, setCreatePermissions] = useState<Set<string>>(() => new Set());

  const toggleRole = (userId: string, roleId: string) => {
    setUserRoles((prev) => {
      const next = new Set(prev[userId] ?? []);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return { ...prev, [userId]: next };
    });
    setSavedMsg(null);
  };

  const togglePermission = (userId: string, permissionId: string) => {
    setUserPermissions((prev) => {
      const next = new Set(prev[userId] ?? []);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return { ...prev, [userId]: next };
    });
    setSavedMsg(null);
  };

  const toggleCreateRole = (roleId: string) => {
    setCreateRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const toggleCreatePermission = (permissionId: string) => {
    setCreatePermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const saveAccess = async (userId: string) => {
    setSaving(userId);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleIds: Array.from(userRoles[userId] ?? []),
          permissionIds: Array.from(userPermissions[userId] ?? []),
        }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, labels.failedSave));
      setSavedMsg(userId);
      setTimeout(() => setSavedMsg(null), 2500);
    } catch (error) {
      alert(error instanceof Error ? error.message : labels.failedSave);
    } finally {
      setSaving(null);
    }
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateMsg(null);

    if (form.password.length < 8) {
      alert(labels.passwordMin);
      return;
    }

    if (form.password !== form.confirmPassword) {
      alert(labels.passwordMismatch);
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          roleIds: Array.from(createRoles),
          permissionIds: Array.from(createPermissions),
        }),
      });

      if (!res.ok) throw new Error(await readErrorMessage(res, labels.failedCreate));

      const data = (await res.json()) as { user: UserRecord };
      const newUser = data.user;
      setItems((prev) => [newUser, ...prev]);
      setUserRoles((prev) => ({
        ...prev,
        [newUser.id]: new Set(newUser.roles.map((role) => role.role.id)),
      }));
      setUserPermissions((prev) => ({
        ...prev,
        [newUser.id]: new Set(newUser.permissions.map((permission) => permission.permission.id)),
      }));
      setForm({ name: "", email: "", password: "", confirmPassword: "" });
      setCreateRoles(new Set());
      setCreatePermissions(new Set());
      setCreateMsg(labels.createdUser);
    } catch (error) {
      alert(error instanceof Error ? error.message : labels.failedCreate);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mt-4 space-y-6">
      <form
        onSubmit={createUser}
        className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4 shadow-sm"
      >
        <div className="text-sm font-medium text-zinc-900">{labels.createUser}</div>
        <div className="mt-1 text-xs text-zinc-500">{labels.createHint}</div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-zinc-700">{labels.name}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={labels.namePlaceholder}
              className="w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-zinc-700">{labels.email}</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder={labels.emailPlaceholder}
              className="w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-zinc-700">{labels.password}</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              className="w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-zinc-700">{labels.confirmPassword}</span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              className="w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
              required
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labels.roles}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {allRoles.length === 0 ? (
              <span className="text-xs text-zinc-500">{labels.noRoles}</span>
            ) : (
              allRoles.map((role) => (
                <AccessChip
                  key={role.id}
                  active={createRoles.has(role.id)}
                  label={role.name || role.key}
                  onClick={() => toggleCreateRole(role.id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labels.permissions}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {allPermissions.length === 0 ? (
              <span className="text-xs text-zinc-500">{labels.noPermissions}</span>
            ) : (
              allPermissions.map((permission) => (
                <AccessChip
                  key={permission.id}
                  active={createPermissions.has(permission.id)}
                  label={permission.key}
                  onClick={() => toggleCreatePermission(permission.id)}
                />
              ))
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={creating}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
          >
            {creating ? labels.creating : labels.create}
          </button>
          {createMsg ? <span className="text-xs text-emerald-700">{createMsg}</span> : null}
        </div>
      </form>

      {items.length === 0 ? (
        <div className="text-sm text-zinc-600">{labels.noUsers}</div>
      ) : (
        <div className="divide-y divide-sky-100">
          {items.map((u) => {
            const saveLabel = saving === u.id ? labels.saving : savedMsg === u.id ? labels.saved : labels.saveAccess;

            return (
              <div key={u.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{u.name ?? "—"}</div>
                    <div className="text-xs text-zinc-500">{u.email ?? "—"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveAccess(u.id)}
                    disabled={saving === u.id}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
                  >
                    {saveLabel}
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labels.roles}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allRoles.length === 0 ? (
                      <span className="text-xs text-zinc-500">{labels.noRoles}</span>
                    ) : (
                      allRoles.map((role) => (
                        <AccessChip
                          key={role.id}
                          active={userRoles[u.id]?.has(role.id) ?? false}
                          label={role.name || role.key}
                          onClick={() => toggleRole(u.id, role.id)}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labels.permissions}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allPermissions.length === 0 ? (
                      <span className="text-xs text-zinc-500">{labels.noPermissions}</span>
                    ) : (
                      allPermissions.map((permission) => (
                        <AccessChip
                          key={permission.id}
                          active={userPermissions[u.id]?.has(permission.id) ?? false}
                          label={permission.key}
                          onClick={() => togglePermission(u.id, permission.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

