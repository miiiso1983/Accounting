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
  isActive: boolean;
  permissions: Array<{ permission: Permission }>;
  roles: Array<{ role: Role }>;
}

interface Props {
  users: UserRecord[];
  allRoles: Role[];
  allPermissions: Permission[];
  currentUserId: string;
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
    status: string;
    active: string;
    inactive: string;
    activate: string;
    deactivate: string;
    updatingStatus: string;
    statusUpdated: string;
    failedStatus: string;
    actions: string;
    resetPassword: string;
    reset: string;
    resetting: string;
    passwordReset: string;
    failedResetPassword: string;
    deleteUser: string;
    deleting: string;
    confirmDelete: string;
    deletedUser: string;
    failedDelete: string;
    cannotDeleteSelf: string;
    cannotDeactivateSelf: string;
    self: string;
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

export function UsersClient({ users, allRoles, allPermissions, labels, currentUserId }: Props) {
  const [items, setItems] = useState(users);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
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
  const [resetForms, setResetForms] = useState<Record<string, { password: string; confirmPassword: string }>>({});

  const upsertUser = (user: UserRecord) => {
    setItems((prev) => prev.map((item) => (item.id === user.id ? user : item)));
    setUserRoles((prev) => ({
      ...prev,
      [user.id]: new Set(user.roles.map((role) => role.role.id)),
    }));
    setUserPermissions((prev) => ({
      ...prev,
      [user.id]: new Set(user.permissions.map((permission) => permission.permission.id)),
    }));
  };

  const updateResetForm = (userId: string, field: "password" | "confirmPassword", value: string) => {
    setResetForms((prev) => ({
      ...prev,
      [userId]: {
        password: prev[userId]?.password ?? "",
        confirmPassword: prev[userId]?.confirmPassword ?? "",
        [field]: value,
      },
    }));
  };

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
    setActionMsg((prev) => ({ ...prev, [userId]: "" }));
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

  const toggleStatus = async (user: UserRecord) => {
    if (user.id === currentUserId) {
      alert(labels.cannotDeactivateSelf);
      return;
    }

    setStatusLoading(user.id);
    setActionMsg((prev) => ({ ...prev, [user.id]: "" }));
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (!res.ok) throw new Error(await readErrorMessage(res, labels.failedStatus));

      const data = (await res.json()) as { user: UserRecord };
      upsertUser(data.user);
      setActionMsg((prev) => ({ ...prev, [user.id]: labels.statusUpdated }));
    } catch (error) {
      alert(error instanceof Error ? error.message : labels.failedStatus);
    } finally {
      setStatusLoading(null);
    }
  };

  const resetPassword = async (userId: string) => {
    const values = resetForms[userId] ?? { password: "", confirmPassword: "" };

    if (values.password.length < 8) {
      alert(labels.passwordMin);
      return;
    }

    if (values.password !== values.confirmPassword) {
      alert(labels.passwordMismatch);
      return;
    }

    setResetLoading(userId);
    setActionMsg((prev) => ({ ...prev, [userId]: "" }));
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: values.password }),
      });

      if (!res.ok) throw new Error(await readErrorMessage(res, labels.failedResetPassword));

      const data = (await res.json()) as { user: UserRecord };
      upsertUser(data.user);
      setResetForms((prev) => ({
        ...prev,
        [userId]: { password: "", confirmPassword: "" },
      }));
      setActionMsg((prev) => ({ ...prev, [userId]: labels.passwordReset }));
    } catch (error) {
      alert(error instanceof Error ? error.message : labels.failedResetPassword);
    } finally {
      setResetLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (userId === currentUserId) {
      alert(labels.cannotDeleteSelf);
      return;
    }

    if (!window.confirm(labels.confirmDelete)) return;

    setDeleteLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(await readErrorMessage(res, labels.failedDelete));

      setItems((prev) => prev.filter((user) => user.id !== userId));
      setUserRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setUserPermissions((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setResetForms((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      alert(labels.deletedUser);
    } catch (error) {
      alert(error instanceof Error ? error.message : labels.failedDelete);
    } finally {
      setDeleteLoading(null);
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
            const isSelf = u.id === currentUserId;
            const statusLabel = u.isActive ? labels.active : labels.inactive;
            const toggleLabel =
              statusLoading === u.id ? labels.updatingStatus : u.isActive ? labels.deactivate : labels.activate;
            const deleteLabel = deleteLoading === u.id ? labels.deleting : labels.deleteUser;
            const resetLabel = resetLoading === u.id ? labels.resetting : labels.reset;
            const resetForm = resetForms[u.id] ?? { password: "", confirmPassword: "" };

            return (
              <div key={u.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-zinc-900">{u.name ?? "—"}</div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {statusLabel}
                      </span>
                      {isSelf ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">{labels.self}</span> : null}
                    </div>
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

                <div className="mt-4 grid gap-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-3 md:grid-cols-[0.9fr_1.1fr]">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labels.actions}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(u)}
                        disabled={statusLoading === u.id || deleteLoading === u.id || isSelf}
                        className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-sky-50 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-emerald-200/70"
                      >
                        {toggleLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteUser(u.id)}
                        disabled={deleteLoading === u.id || statusLoading === u.id || isSelf}
                        className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-rose-100"
                      >
                        {deleteLabel}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{labels.resetPassword}</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input
                        type="password"
                        value={resetForm.password}
                        onChange={(event) => updateResetForm(u.id, "password", event.target.value)}
                        placeholder={labels.password}
                        className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
                      />
                      <input
                        type="password"
                        value={resetForm.confirmPassword}
                        onChange={(event) => updateResetForm(u.id, "confirmPassword", event.target.value)}
                        placeholder={labels.confirmPassword}
                        className="rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300"
                      />
                      <button
                        type="button"
                        onClick={() => resetPassword(u.id)}
                        disabled={resetLoading === u.id}
                        className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 focus:outline-none focus:ring-4 focus:ring-zinc-200"
                      >
                        {resetLabel}
                      </button>
                    </div>
                  </div>
                </div>

                {actionMsg[u.id] ? <div className="mt-3 text-xs text-emerald-700">{actionMsg[u.id]}</div> : null}

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

