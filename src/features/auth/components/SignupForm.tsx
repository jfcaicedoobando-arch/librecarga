import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { signUpWithEmail } from "@/features/auth/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/shared";
import { notifyError } from "@/lib/ui/appFeedback";
import { translateAuthError } from "@/lib/auth/translateAuthError";
import { getFirstFieldError } from "./SignupForm.helpers";
import { PASSWORD_MIN, PASSWORD_MAX } from "@/lib/passwords/policy";
import { signupSchema, type SignupValues } from "./SignupForm.schema";
import { PasswordStrengthMeter } from "@/components/shared/PasswordStrengthMeter";


export function SignupForm() {
  const { toast } = useToast();
  const [signupDone, setSignupDone] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [mostrarContrasena, setMostrarContrasena] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      company: "",
      phone: "",
      email: "",
      password: "",
      password2: "",
      // SAFE-CAST: `z.literal(true)` obliga a que el tipo del campo sea `true`,
      // pero el defaultValue del checkbox arranca en `false` hasta que el usuario lo marca.
      acceptTerms: false as unknown as true,
    },
  });

  const onSubmit = async (v: SignupValues) => {
    setSignupError(null);
    try {
      await signUpWithEmail({
        email: v.email,
        password: v.password,
        fullName: v.name,
        companyName: v.company.trim(),
        phone: v.phone?.trim() || undefined,
        redirectTo: `${window.location.origin}/onboarding`,
      });
      setSignupDone(true);
      toast({ title: "Cuenta creada", description: "Revisa tu correo para confirmar tu cuenta." });
    } catch (err) {
      const friendly = translateAuthError(err instanceof Error ? err.message : null);
      setSignupError(friendly);
      notifyError(undefined, {
        title: "No pudimos crear la cuenta",
        description: friendly,
        error: err,
        method: "HANDLE_SIGNUP",
      });
    }
  };

  if (signupDone) {
    return (
      <div className="space-y-3 py-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-accent" />
        <p className="text-sm font-medium text-foreground">¡Listo! Te enviamos un correo de confirmación.</p>
        <p className="text-xs text-muted-foreground">Abre el enlace para activar tu cuenta y entrar a Libre Carga.</p>
      </div>
    );
  }

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const alertMessage = signupError ?? (getFirstFieldError(errors) ? "Revisa los campos indicados." : null);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {alertMessage && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{alertMessage}</AlertDescription>
        </Alert>
      )}
      <FormField label="Nombre completo" error={errors.name?.message}>
        <Input id="signup-name" type="text" placeholder="Juan Pérez" autoComplete="name" {...register("name")} />
      </FormField>
      <FormField label="Nombre de empresa" error={errors.company?.message}>
        <Input
          id="signup-company"
          type="text"
          placeholder="Mi Agencia Aduanal S.A. de C.V."
          autoComplete="organization"
          {...register("company")}
        />
      </FormField>
      <FormField label="Teléfono" hint="(opcional)" error={errors.phone?.message}>
        <Input
          id="signup-phone"
          type="tel"
          placeholder="55 1234 5678"
          autoComplete="tel"
          inputMode="tel"
          {...register("phone")}
        />
      </FormField>
      <FormField label="Email de trabajo" error={errors.email?.message}>
        <Input id="signup-email" type="email" placeholder="tu@agencia.com" autoComplete="email" {...register("email")} />
      </FormField>
      <FormField label="Contraseña" error={errors.password?.message}>
        <Input
          id="signup-password"
          type={mostrarContrasena ? "text" : "password"}
          placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          {...register("password")}
        />
        <Button type="button" variant="ghost" size="sm" aria-controls="signup-password signup-password2"
          onClick={() => setMostrarContrasena(v => !v)}>
          {mostrarContrasena ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {mostrarContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
        </Button>
        <PasswordStrengthMeter password={form.watch("password")} />
      </FormField>

      <FormField label="Confirmar contraseña" error={errors.password2?.message}>
        <Input
          id="signup-password2"
          type={mostrarContrasena ? "text" : "password"}
          placeholder="Repite tu contraseña"
          autoComplete="new-password"
          {...register("password2")}
        />
      </FormField>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <Controller
          control={control}
          name="acceptTerms"
          render={({ field }) => (
            <Checkbox
              className="mt-0.5"
              aria-invalid={!!errors.acceptTerms}
              aria-describedby={errors.acceptTerms ? "signup-terms-error" : undefined}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />
        <span>
          Acepto los{" "}
          <a href="/legal/terminos" target="_blank" className="text-accent hover:underline">
            Términos
          </a>{" "}
          y el{" "}
          <a href="/legal/privacidad" target="_blank" className="text-accent hover:underline">
            Aviso de privacidad
          </a>
          .
        </span>
      </label>
      {errors.acceptTerms && <p id="signup-terms-error" className="text-body-sm text-destructive">{errors.acceptTerms.message}</p>}
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Crear cuenta gratis
      </Button>
    </form>
  );
}
