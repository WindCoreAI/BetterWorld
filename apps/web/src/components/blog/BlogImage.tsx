import Image from "next/image";

interface BlogImageProps {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export function BlogImage({
  src,
  alt,
  caption,
  width = 800,
  height = 450,
}: BlogImageProps) {
  return (
    <figure className="my-8">
      <div className="rounded-xl overflow-hidden shadow-neu-md">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="w-full h-auto"
        />
      </div>
      {caption && (
        <figcaption className="text-center text-sm text-charcoal-light mt-3 italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
