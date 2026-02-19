interface ReadingTimeProps {
  minutes: number;
}

export function ReadingTime({ minutes }: ReadingTimeProps) {
  return (
    <span className="text-sm text-charcoal-light">
      {minutes} min read
    </span>
  );
}
