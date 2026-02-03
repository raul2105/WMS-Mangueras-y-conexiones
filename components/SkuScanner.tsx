"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";

type Props = {
  onDetected: (value: string) => void;
  className?: string;
};

export default function SkuScanner({ onDetected, className }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reader = useMemo(() => new BrowserMultiFormatReader(), []);

  useEffect(() => {
    return () => {
      try {
        controlsRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  async function start() {
    setError(null);
    setIsScanning(true);

    try {
      const video = videoRef.current;
      if (!video) throw new Error("Video element not ready");

      // Prefer back camera on mobile.
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const preferred = devices.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ?? devices[0]?.deviceId;

      await reader.decodeFromVideoDevice(preferred, video, (result, err, controls) => {
        controlsRef.current = controls;
        if (result) {
          const text = result.getText();
          onDetected(text);
          controls.stop();
          setIsScanning(false);
        }
        if (err) {
          // ignore per-frame decode errors
        }
      });
    } catch (e) {
      setIsScanning(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore
    }
    setIsScanning(false);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {!isScanning ? (
          <button type="button" onClick={start} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Escanear (cámara)
          </button>
        ) : (
          <button type="button" onClick={stop} className="px-4 py-2 glass rounded-lg text-slate-300 hover:text-white">
            Detener
          </button>
        )}
        <span className="text-xs text-slate-500">Lee códigos QR o de barras para llenar el SKU/Referencia.</span>
      </div>

      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

      {isScanning && (
        <div className="mt-3 glass rounded-xl p-3">
          <video ref={videoRef} className="w-full rounded-lg" muted playsInline />
          <p className="text-xs text-slate-500 mt-2">Apunta al código…</p>
        </div>
      )}
    </div>
  );
}
