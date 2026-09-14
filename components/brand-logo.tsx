import Image from "next/image";

export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <span className="brand-logo">
      <Image
        src="/images/model-car-center-logo.png"
        alt="Model Car Center"
        width={782}
        height={319}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
