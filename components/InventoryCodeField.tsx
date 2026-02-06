"use client";

import { useState } from "react";
import SkuScanner from "@/components/SkuScanner";

type Props = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
};

export default function InventoryCodeField({ name, label, placeholder, required, error }: Props) {
  const [value, setValue] = useState("");

  return (
    <div className="space-y-3 md:col-span-2">
      <SkuScanner
        onDetected={(text) => {
          setValue(text);
        }}
      />

      <label className="space-y-1 block">
        <span className="text-sm text-slate-400">{label}</span>
        <input
          name={name}
          required={required}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-4 py-3 glass rounded-lg font-mono"
          placeholder={placeholder}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </label>
    </div>
  );
}
