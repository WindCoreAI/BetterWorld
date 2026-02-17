"use client";

interface TeacherBadgeProps {
  teachingPoints?: number;
  size?: "sm" | "md" | "lg";
}

export function TeacherBadge({ teachingPoints, size = "md" }: TeacherBadgeProps) {
  const sizeClass =
    size === "sm"
      ? "text-xs px-2 py-0.5"
      : size === "lg"
        ? "text-sm px-3 py-1.5"
        : "text-xs px-2.5 py-1";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium bg-amber-100 text-amber-800 ${sizeClass}`}
      title={
        teachingPoints !== undefined
          ? `Teacher (${teachingPoints} teaching points)`
          : "Teacher"
      }
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
      </svg>
      Teacher
    </span>
  );
}
