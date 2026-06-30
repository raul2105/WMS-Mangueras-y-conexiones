"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginFormProps = {
  action: (formData: FormData) => void;
  callbackUrl: string;
  error: string;
};

export default function LoginForm({
  action,
  callbackUrl,
  error,
}: LoginFormProps) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="admin@scmayher.com"
        autoComplete="email"
        autoFocus
        required
      />
      <Input
        name="password"
        type="password"
        label="Contrasena"
        autoComplete="current-password"
        enterKeyHint="go"
        required
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
      />
      {error ? <p className="text-sm text-[var(--status-danger-text)]">{error}</p> : null}
      <Button type="submit" fullWidth>
        Iniciar sesion
      </Button>
    </form>
  );
}
