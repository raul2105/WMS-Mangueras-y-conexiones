"use client";

import { useState } from "react";
import Image from "next/image";
import { getLocalProductImagePath } from "@/lib/product-image-path";
import { BoxIcon } from "@/components/ui/icons";

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
    const isCompact = size <= 72;

    if (failed) {
        return (
            <div
                className={`flex items-center justify-center bg-slate-800 rounded-lg border border-white/5 ${className}`}
                style={{ width: size, height: size, maxWidth: "100%" }}
                title={name || sku}
                aria-label={name || sku}
            >
                <div className={isCompact ? "flex items-center justify-center" : "text-center space-y-2 px-3"}>
                    <BoxIcon className={isCompact ? "h-5 w-5 text-[var(--text-muted)]" : "mx-auto h-8 w-8 text-[var(--text-muted)]"} />
                    {isCompact ? null : (
                        <p className="line-clamp-2 max-w-full overflow-hidden text-ellipsis break-words text-[11px] text-slate-500 font-mono">
                            {sku}
                        </p>
                    )}
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
            />
        </div>
    );
}
