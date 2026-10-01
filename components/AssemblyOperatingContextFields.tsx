"use client";

export type AssemblyOperatingContextValues = {
  workingPressureBar: string;
  operatingTemperatureC: string;
  medium: string;
  application: string;
  assemblyMethod: string;
};

type Props = {
  values?: Partial<AssemblyOperatingContextValues>;
  onValueChange?: (field: keyof AssemblyOperatingContextValues, value: string) => void;
};

export default function AssemblyOperatingContextFields({ values = {}, onValueChange }: Props) {
  const inputProps = (field: keyof AssemblyOperatingContextValues) => onValueChange
    ? { value: values[field] ?? "", onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange(field, event.target.value) }
    : { defaultValue: values[field] ?? "" };

  return (
    <fieldset className="md:col-span-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      <legend className="px-1 text-sm font-semibold text-[var(--text-primary)]">Condiciones de operación</legend>
      <p id="assembly-operating-context-help" className="mb-4 text-xs text-[var(--text-secondary)]">
        Captura los datos conocidos para validar límites técnicos. Si una regla los exige y faltan, el ensamble no podrá avanzar.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="op-label">Presión de trabajo (bar)</span>
          <input name="workingPressureBar" type="number" min="0" step="0.01" inputMode="decimal" {...inputProps("workingPressureBar")} className="op-field w-full px-4 py-3" aria-describedby="assembly-operating-context-help" />
        </label>
        <label className="space-y-1">
          <span className="op-label">Temperatura de operación (°C)</span>
          <input name="operatingTemperatureC" type="number" step="0.1" inputMode="decimal" {...inputProps("operatingTemperatureC")} className="op-field w-full px-4 py-3" aria-describedby="assembly-operating-context-help" />
        </label>
        <label className="space-y-1">
          <span className="op-label">Medio o fluido</span>
          <input name="medium" type="text" maxLength={120} placeholder="Ej. aceite hidráulico" {...inputProps("medium")} className="op-field w-full px-4 py-3" />
        </label>
        <label className="space-y-1">
          <span className="op-label">Aplicación</span>
          <input name="application" type="text" maxLength={160} placeholder="Ej. línea de retorno" {...inputProps("application")} className="op-field w-full px-4 py-3" />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="op-label">Método de ensamble</span>
          <input name="assemblyMethod" type="text" maxLength={120} placeholder="Ej. prensado según ficha técnica" {...inputProps("assemblyMethod")} className="op-field w-full px-4 py-3" />
        </label>
      </div>
    </fieldset>
  );
}
