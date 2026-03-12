import LoginForm from "./login-form";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const rawError = sp?.error;
  const initialErrorCode =
    typeof rawError === "string" ? rawError : Array.isArray(rawError) ? rawError[0] ?? null : null;

  return <LoginForm initialErrorCode={initialErrorCode} />;
}
