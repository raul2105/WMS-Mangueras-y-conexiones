import { z } from "zod";

export const userPasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña es demasiado larga");

export const userCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Nombre es obligatorio").max(120, "Nombre demasiado largo"),
    email: z.string().trim().email("Email inválido"),
    password: userPasswordSchema,
    confirmPassword: z.string(),
    roleIds: z.array(z.string().min(1, "Rol inválido")).min(1, "Selecciona al menos un rol"),
    isActive: z.boolean().default(true),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, "Nombre es obligatorio").max(120, "Nombre demasiado largo"),
  email: z.string().trim().email("Email inválido"),
  roleIds: z.array(z.string().min(1, "Rol inválido")).min(1, "Selecciona al menos un rol"),
  isActive: z.boolean(),
});

export const userResetPasswordSchema = z
  .object({
    password: userPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export function firstUserSchemaError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Datos inválidos";
}
