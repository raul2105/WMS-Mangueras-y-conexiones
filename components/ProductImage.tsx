"use client";

import { useState } from "react";
import Image from "next/image";
import { getLocalProductImagePath } from "@/lib/product-image-path";

interface ProductImageProps {
    sku: string;
    imageUrl?: string | null;
    name?: string;
    size?: number;
    className?: string;
}

export default function ProductImage({
    sku,
    imageUrl,
    name,
    size = 400,
    className = "",
}: ProductImageProps) {
    const localSrc = getLocalProductImagePath(sku);
    const [src, setSrc] = useState<string>(imageUrl || localSrc);
    const [failed, setFailed] = useState(false);

    if (failed) {
        return (
            <div
                className={`flex items-center justify-center bg-slate-800 rounded-lg border border-white/5 ${className}`}
                style={{ width: size, height: size, maxWidth: "100%" }}
            >
                <div className="text-center space-y-2 px-4">
                    <div className="text-4xl">📦</div>
                    <p className="text-xs text-slate-500 font-mono break-all">{sku}</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`relative overflow-hidden rounded-lg bg-slate-800 border border-white/5 ${className}`}
            style={{ width: size, height: size, maxWidth: "100%" }}
        >
            <Image
                src={src}
                alt={name || sku}
                fill
                sizes={`${size}px`}
                className="object-contain"
                onError={() => {
                    if (src !== localSrc) {
                        setSrc(localSrc);
                    } else {
                        setFailed(true);
                    }
                }}
                unoptimized
            />
        </div>
    );
}
