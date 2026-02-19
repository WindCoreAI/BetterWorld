interface KeywordTagProps {
  keyword: string;
}

export function KeywordTag({ keyword }: KeywordTagProps) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-terracotta/8 text-terracotta/80 border border-terracotta/10 whitespace-nowrap shrink-0">
      {keyword}
    </span>
  );
}
