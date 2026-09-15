import Image from "next/image";

export function BrandLogo({ priority = false, dark = false }: { priority?: boolean; dark?: boolean }) {
  return (
    <span className="brand-logo">
      <Image
        src={dark ? "/images/model-car-center-logo-dark.svg" : "/images/model-car-center-logo.png"}
        alt="Model Car Center"
        width={782}
        height={319}
        priority={priority}
        unoptimized
      />
    </span>
  );
}
