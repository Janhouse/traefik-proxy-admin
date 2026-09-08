"use client";

import { Label } from "@/components/ui/label";

/* Numbered form section + labeled field column — the layout primitives the
 * service form introduced, shared so other settings pages match it. */

export function Section({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7 first:mt-0">
      <div className="sec-title">
        <span className="step-num">{n}</span>
        {title}
        <span className="ln" />
      </div>
      <p className="fs-desc">{desc}</p>
      <div className="rounded-[var(--radius-lg)] border bg-card p-5 shadow-[var(--shadow-md)] sm:p-[22px]">
        {children}
      </div>
    </div>
  );
}

export function FieldCol({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
